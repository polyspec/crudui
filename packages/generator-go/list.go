package generator

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf16"

	"github.com/crudui/crudui/packages/validator-go/validator/compose"
)

// ListOptions supplies composition, display language, layout and caller-owned pagination data.
type ListOptions struct {
	Language string
	Data     *Object
	PageMeta *Object
	Files    map[string]*Object
	Loader   compose.FileLoader
	Basepath string
	Layout   string
}

func normalizeFormat(v any) *Object {
	typ := "text"
	o := NewObject()
	if s, ok := v.(string); ok && s != "" {
		typ = s
	}
	if m := object(v); m != nil {
		o = m
		if s, ok := read(m, "type").(string); ok && s != "" {
			typ = s
		}
	}
	return NewObject("type", typ, "options", o)
}

// BuildList creates a complete list model from the specification and ordered records.
func BuildList(spec *Object, rows []*Object, options ListOptions) (*Object, error) {
	if e := checkOrderedValue(spec); e != nil {
		return nil, e
	}
	if e := checkOrderedValue(options.Data); e != nil {
		return nil, e
	}
	for _, row := range rows {
		if e := checkOrderedValue(row); e != nil {
			return nil, e
		}
	}
	if spec == nil {
		return nil, fmt.Errorf("List specification must be an object")
	}
	if options.Language == "" {
		options.Language = "ko"
	}
	loader := options.Loader
	if loader == nil {
		loader = compose.NewMemoryLoader(options.Files)
	}
	raw := object(read(spec, "columns"))
	if raw == nil {
		raw = NewObject()
	}
	columns, e := compose.ComposeProperties(raw, loader, compose.ComposeOptions{Basepath: options.Basepath})
	if e != nil {
		return nil, e
	}
	data := options.Data
	if data == nil {
		data = NewObject()
	}
	lookup := plainLookup(data).(map[string]any)
	cols := []*Object{}
	for _, key := range columns.Keys() {
		raw := object(read(columns, key))
		if raw == nil {
			continue
		}
		d := resolveDesign(read(raw, "design"), lookup, nil)
		if !truthy(read(d, "show")) {
			continue
		}
		label := key
		if raw.Has("label") {
			label = translate(read(raw, "label"), options.Language)
		}
		sort := false
		if v := read(raw, "sortable"); v != nil && !isAbsent(v) {
			sort = evalShow(v, lookup, nil)
		}
		cols = append(cols, NewObject("key", key, "field", stringAt(raw, "field"), "label", label, "format", normalizeFormat(read(raw, "format")), "sortable", sort, "design", d))
	}
	rowModels := []*Object{}
	for _, row := range rows {
		if row == nil {
			return nil, fmt.Errorf("List rows must be objects")
		}
		cells := []*Object{}
		rowLookup := plainLookup(row).(map[string]any)
		for _, col := range cols {
			field := strings.TrimPrefix(stringAt(col, "field"), ".")
			v := absent
			if field != "" {
				v = getPath(row, field)
			}
			format := object(read(col, "format"))
			display, e := renderCell(format, v, row, rowLookup, valueSegments(field), options.Language)
			if e != nil {
				return nil, e
			}
			cell := NewObject("format", format)
			if !isAbsent(v) {
				cell.Set("value", v)
			}
			cell.Set("display", display)
			cell.Set("design", resolveDesign(read(read(columns, stringAt(col, "key")), "design"), rowLookup, valueSegments(field)))
			cells = append(cells, cell)
		}
		rowModels = append(rowModels, NewObject("cells", cells))
	}
	pagination := NewObject("enabled", false)
	p := read(spec, "pagination")
	if p == true {
		pagination.Set("enabled", true)
	} else if object(p) != nil {
		pagination.Set("enabled", true)
		if _, ok := asNumber(read(p, "per_page")); ok {
			pagination.Set("perPage", read(p, "per_page"))
		}
		if mode, ok := read(p, "mode").(string); ok {
			pagination.Set("mode", mode)
		}
	}
	if options.PageMeta != nil {
		for _, key := range []string{"page", "total"} {
			if options.PageMeta.Has(key) {
				pagination.Set(key, read(options.PageMeta, key))
			}
		}
	}
	actions := []*Object{}
	if raw := object(read(spec, "actions")); raw != nil {
		for _, key := range raw.Keys() {
			if key == "$ref" || key == "$patch" {
				continue
			}
			v := read(raw, key)
			if text, ok := v.(string); ok {
				actions = append(actions, NewObject("key", key, "label", key, "behavior", NewObject(key, text)))
				continue
			}
			o := object(v)
			if o == nil {
				continue
			}
			label := key
			if o.Has("label") {
				label = translate(read(o, "label"), options.Language)
			}
			a := NewObject("key", key, "label", label)
			if o.Has("format") {
				a.Set("format", normalizeFormat(read(o, "format")))
			}
			behavior := NewObject()
			if b := object(read(o, "behavior")); b != nil {
				for _, k := range b.Keys() {
					s := read(b, k)
					if object(s) != nil {
						s = read(s, "script")
					}
					if text, ok := s.(string); ok {
						behavior.Set(k, text)
					}
				}
			}
			if behavior.Len() > 0 {
				a.Set("behavior", behavior)
			}
			actions = append(actions, a)
		}
	}
	out := NewObject("columns", cols, "rows", rowModels, "pagination", pagination)
	if s := object(read(spec, "sort")); s != nil {
		if field := stringAt(s, "field"); field != "" {
			dir := "asc"
			if read(s, "dir") == "desc" {
				dir = "desc"
			}
			out.Set("sort", NewObject("field", field, "dir", dir))
		}
	}
	out.Set("actions", actions)
	out.Set("empty", translate(read(spec, "empty"), options.Language))
	out.Set("design", resolveDesign(read(spec, "design"), lookup, nil))
	return out, nil
}

var interpolateRE = regexp.MustCompile(`\.[A-Za-z_][\w.]*`)

func interpolate(s string, row *Object, value any) string {
	return interpolateRE.ReplaceAllStringFunc(s, func(token string) string {
		path := token[1:]
		if path == "field" {
			return scalar(value)
		}
		v := getPath(row, path)
		if isAbsent(v) {
			return scalar(value)
		}
		return scalar(v)
	})
}
func renderCell(format *Object, value any, row *Object, lookup map[string]any, path []string, language string) (any, error) {
	o := read(format, "options")
	s := scalar(value)
	switch stringAt(format, "type") {
	case "date":
		t, ok := parseDate(s)
		if !ok {
			return s, nil
		}
		pattern := stringAt(o, "pattern")
		if pattern == "" {
			pattern = "YYYY-MM-DD"
		}
		return strings.NewReplacer("YYYY", t.Format("2006"), "MM", fmt.Sprintf("%02d", t.Month()), "DD", fmt.Sprintf("%02d", t.Day()), "HH", fmt.Sprintf("%02d", t.Hour()), "mm", fmt.Sprintf("%02d", t.Minute()), "ss", fmt.Sprintf("%02d", t.Second())).Replace(pattern), nil
	case "number":
		n, ok := asNumber(value)
		if !ok {
			n, ok = parseNumberString(s)
		}
		if !ok || math.IsInf(n, 0) || math.IsNaN(n) {
			return s, nil
		}
		body := numberString(n)
		if decimals, ok := asNumber(read(o, "decimals")); ok {
			decimals = math.Trunc(decimals)
			if decimals < 0 || decimals > 100 {
				return nil, fmt.Errorf("Number decimals must be between 0 and 100")
			}
			body = fixedNumber(n, int(decimals))
		}
		if truthy(read(o, "thousands")) {
			parts := strings.Split(body, ".")
			num := parts[0]
			sign := ""
			if strings.HasPrefix(num, "-") {
				sign = "-"
				num = num[1:]
			}
			groups := []string{}
			for len(num) > 3 {
				groups = append([]string{num[len(num)-3:]}, groups...)
				num = num[:len(num)-3]
			}
			groups = append([]string{num}, groups...)
			parts[0] = sign + strings.Join(groups, ",")
			body = strings.Join(parts, ".")
		}
		return translate(read(o, "prefix"), language) + body + translate(read(o, "suffix"), language), nil
	case "badge":
		raw := read(read(o, "map"), s)
		if object(raw) != nil {
			v := translate(raw, language)
			return NewObject("kind", "badge", "variant", v, "label", v), nil
		}
		return NewObject("kind", "badge", "variant", scalar(raw), "label", s), nil
	case "link":
		raw := read(o, "href")
		href := ""
		if h, ok := raw.(string); ok {
			href = h
		} else if object(raw) != nil {
			href = evalAppearance(raw, lookup, path)
		}
		text := s
		if v := read(o, "text"); v != nil && !isAbsent(v) && v != "" {
			text = translate(v, language)
		}
		d := NewObject("kind", "link", "href", interpolate(href, row, value), "text", text)
		if target := stringAt(o, "target"); target != "" {
			d.Set("target", target)
		}
		return d, nil
	case "choice-label":
		items := read(o, "items")
		if !dynamicItems(items) {
			if v := item(items, s); !isAbsent(v) {
				if object(v) != nil {
					return translate(v, language), nil
				}
				return scalar(v), nil
			}
		}
		return s, nil
	case "bool":
		b := truthy(value)
		if text, ok := value.(string); ok && (text == "0" || text == "false") {
			b = false
		}
		key, label := "false", "false"
		if b {
			key, label = "true", "true"
		}
		if v := read(o, key); v != nil && !isAbsent(v) {
			label = translate(v, language)
		}
		as := stringAt(o, "as")
		if as == "" {
			as = "text"
		}
		return NewObject("kind", "bool", "value", b, "label", label, "as", as), nil
	case "image":
		d := NewObject("kind", "image", "src", s, "alt", interpolate(translate(read(o, "alt"), language), row, value))
		for _, k := range []string{"width", "height"} {
			if has(o, k) {
				d.Set(k, stringAt(o, k))
			}
		}
		return d, nil
	case "html":
		return NewObject("kind", "html", "html", s), nil
	default:
		if has(o, "truncate") {
			n, ok := asNumber(read(o, "truncate"))
			if !ok {
				n, _ = strconv.ParseFloat(stringAt(o, "truncate"), 64)
			}
			units := utf16.Encode([]rune(s))
			if !math.IsNaN(n) && !math.IsInf(n, 0) && n > 0 && float64(len(units)) > n {
				s = string(utf16.Decode(units[:int(n)])) + "…"
			}
		}
		return s, nil
	}
}
func cellBody(cell *Object) string {
	display := read(cell, "display")
	if s, ok := display.(string); ok {
		return escape(s)
	}
	switch stringAt(display, "kind") {
	case "badge":
		class := "badge"
		if v := stringAt(display, "variant"); v != "" {
			class += " badge-" + v
		}
		return element("span", NewObject("class", class), escape(stringAt(display, "label")))
	case "link":
		a := NewObject("href", stringAt(display, "href"))
		if s := stringAt(display, "target"); s != "" {
			a.Set("target", s)
		}
		return element("a", a, escape(stringAt(display, "text")))
	case "image":
		a := NewObject("src", stringAt(display, "src"), "alt", stringAt(display, "alt"))
		for _, k := range []string{"width", "height"} {
			if has(display, k) {
				a.Set(k, read(display, k))
			}
		}
		if stringAt(display, "src") == "" {
			a.Delete("src")
		}
		return "<img" + attrs(a, false, false) + "/>"
	case "bool":
		label := stringAt(display, "label")
		b := truthy(read(display, "value"))
		switch stringAt(display, "as") {
		case "check":
			glyph := "✘"
			if b {
				glyph = "✔"
			}
			return element("span", NewObject("class", "bool-check", "aria-label", label), glyph)
		case "icon":
			class := "bool-icon bool-false"
			if b {
				class = "bool-icon bool-true"
			}
			return element("span", NewObject("class", class, "aria-label", label), "")
		default:
			return element("span", NewObject("class", "bool-text"), escape(label))
		}
	case "html":
		return stringAt(display, "html")
	}
	return ""
}
func cellHTML(cell *Object, tag, base string) string {
	d := object(read(cell, "design"))
	a := NewObject("class", joinClass(base, nodeClass(d, "main")))
	if style := nodeStyle(d, "main"); style != "" {
		a.Set("style", style)
	}
	return element(tag, a, cellBody(cell))
}
func listHTML(vm *Object, layout string) string {
	design := object(read(vm, "design"))
	a := NewObject("class", joinClass("list-view", nodeClass(design, "wrapper")))
	if s := nodeStyle(design, "wrapper"); s != "" {
		a.Set("style", s)
	}
	body := ""
	actions := objectList(read(vm, "actions"))
	if len(actions) > 0 {
		toolbar := ""
		for _, action := range actions {
			at := NewObject()
			tag := "button"
			format := read(action, "format")
			if stringAt(format, "type") == "link" {
				tag = "a"
				href := stringAt(read(format, "options"), "href")
				if href == "" {
					href = "#"
				}
				at.Set("href", href)
				if target := stringAt(read(format, "options"), "target"); target != "" {
					at.Set("target", target)
				}
			} else {
				at.Set("type", "button")
			}
			if b := object(read(action, "behavior")); b != nil {
				for _, k := range b.Keys() {
					at.Set("on"+k, read(b, k))
				}
			}
			toolbar += element("span", NewObject("class", "list-action", "data-action", stringAt(action, "key")), "<"+tag+attrs(at, true, false)+">"+escapeText(stringAt(action, "label"))+"</"+tag+">")
		}
		body += `<div class="list-actions">` + toolbar + `</div>`
	}
	rows := objectList(read(vm, "rows"))
	cols := objectList(read(vm, "columns"))
	if len(rows) == 0 {
		body += element("div", NewObject("class", "list-empty"), escape(stringAt(vm, "empty")))
	} else if layout == "card" {
		cards := ""
		for _, row := range rows {
			content := ""
			for i, cell := range objectList(read(row, "cells")) {
				d := object(read(cell, "design"))
				class := joinClass("list-td list-td-"+stringAt(read(cell, "format"), "type"), nodeClass(d, "main"))
				content += element("div", NewObject("class", class), element("span", NewObject("class", "list-card-label"), escape(stringAt(cols[i], "label")))+cellHTML(cell, "span", "list-card-value"))
			}
			cards += element("article", NewObject("class", "list-card"), content)
		}
		body += element("div", NewObject("class", "list-cards"), cards)
	} else {
		head := ""
		for _, col := range cols {
			d := object(read(col, "design"))
			at := NewObject("class", joinClass("list-th", nodeClass(d, "main")))
			if st := nodeStyle(d, "main"); st != "" {
				at.Set("style", st)
			}
			if f := stringAt(col, "field"); f != "" {
				at.Set("data-field", f)
			}
			if truthy(read(col, "sortable")) {
				at.Set("data-sortable", "true")
			}
			sort := read(vm, "sort")
			field := stringAt(sort, "field")
			if field != "" && (field == stringAt(col, "field") || field == stringAt(col, "key")) {
				at.Set("data-sort-dir", stringAt(sort, "dir"))
			}
			label := element("span", NewObject("class", "list-th-label"), escape(stringAt(col, "label")))
			if truthy(read(col, "sortable")) {
				label += `<span class="list-sort">↕</span>`
			}
			head += element("th", at, label)
		}
		tbody := ""
		for _, row := range rows {
			inner := ""
			for _, cell := range objectList(read(row, "cells")) {
				inner += cellHTML(cell, "td", "list-td list-td-"+stringAt(read(cell, "format"), "type"))
			}
			tbody += "<tr>" + inner + "</tr>"
		}
		body += `<table class="list-table"><thead><tr>` + head + `</tr></thead><tbody>` + tbody + `</tbody></table>`
	}
	p := read(vm, "pagination")
	if truthy(read(p, "enabled")) {
		at := NewObject("class", "list-pagination")
		if s := stringAt(p, "mode"); s != "" {
			at.Set("data-mode", s)
		}
		for _, k := range []string{"perPage", "page", "total"} {
			if has(p, k) {
				name := k
				if k == "perPage" {
					name = "per-page"
				}
				at.Set("data-"+name, stringAt(p, k))
			}
		}
		body += element("nav", at, "")
	}
	return element("div", a, body)
}

// RenderList renders a table or card list with image resource hints in first-use order.
func RenderList(spec *Object, rows []*Object, options ListOptions) (string, error) {
	if options.Layout != "" && options.Layout != "table" && options.Layout != "card" {
		return "", fmt.Errorf("List layout must be table or card")
	}
	vm, e := BuildList(spec, rows, options)
	if e != nil {
		return "", e
	}
	return imagePreloads(vm) + listHTML(vm, options.Layout), nil
}

func imagePreloads(vm *Object) string {
	seen := map[string]bool{}
	var out strings.Builder
	for _, row := range objectList(read(vm, "rows")) {
		for _, cell := range objectList(read(row, "cells")) {
			display := read(cell, "display")
			if stringAt(display, "kind") != "image" {
				continue
			}
			src := stringAt(display, "src")
			if src == "" || strings.HasPrefix(strings.ToLower(src), "data:") || seen[src] {
				continue
			}
			seen[src] = true
			out.WriteString("<link" + attrs(NewObject("rel", "preload", "as", "image", "href", src), false, false) + "/>")
		}
	}
	return out.String()
}
