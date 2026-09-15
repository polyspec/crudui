package generator

import (
	"fmt"
	"math"
	"regexp"
	"strings"

	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
)

// ListOptions supplies composition, display language, layout and caller-owned pagination data.
// Data, Page, Total and Layout take decoded values unchanged so their type is checked like every runtime.
type ListOptions struct {
	Language string
	// Data is nil or an *Object; any other value fails with "List context must be an object".
	Data any
	// Page is nil (none) or a number holding an integer from 1 to 9007199254740991;
	// any other value fails with "List page must be a positive integer".
	Page any
	// Total is nil (none) or a number holding an integer from 0 to 9007199254740991;
	// any other value fails with "List total must be a nonnegative integer".
	Total    any
	Files    map[string]*Object
	Loader   compose.FileLoader
	Basepath string
	// Layout is nil (table) or the string "table" or "card"; any other value fails.
	Layout any
}

// maxSafeInteger is the largest integer every runtime represents exactly (2^53 - 1).
const maxSafeInteger = 9007199254740991

// countOption reads a page or total option. Nil means none; otherwise the value must be a
// number holding an integer from min to maxSafeInteger. An integral float such as 2.0 is the
// integer 2, and negative zero is 0.
func countOption(v any, min float64) (n int64, present bool, ok bool) {
	if v == nil {
		return 0, false, true
	}
	f, isNumber := asNumber(v)
	if !isNumber || f != math.Trunc(f) || f < min || f > maxSafeInteger {
		return 0, true, false
	}
	return int64(f), true, true
}

// optionObject reports the object held by an option; nil (untyped or a nil *Object) means absent.
func optionObject(v any) (*Object, bool) {
	if v == nil {
		return nil, true
	}
	o, ok := v.(*Object)
	return o, ok
}

// checkListInput applies the list input rules in the order every runtime uses.
func checkListInput(spec *Object, rows []*Object, options ListOptions) error {
	if spec == nil {
		return fmt.Errorf("List specification must be an object")
	}
	for _, row := range rows {
		if row == nil {
			return fmt.Errorf("List rows must be objects")
		}
	}
	if _, ok := optionObject(options.Data); !ok {
		return fmt.Errorf("List context must be an object")
	}
	if _, _, ok := countOption(options.Page, 1); !ok {
		return fmt.Errorf("List page must be a positive integer")
	}
	if _, _, ok := countOption(options.Total, 0); !ok {
		return fmt.Errorf("List total must be a nonnegative integer")
	}
	return nil
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
	return buildDisplay(spec, rows, options, displayPaths{own: "list", members: "columns"})
}

// displayPaths names declaration error paths of a display specification: its own design and
// the prefix of each column or field design.
type displayPaths struct {
	own     string
	members string
}

// buildDisplay builds a list or detail display model; paths name declaration errors for the caller's specification kind.
func buildDisplay(spec *Object, rows []*Object, options ListOptions, paths displayPaths) (*Object, error) {
	if e := checkListInput(spec, rows, options); e != nil {
		return nil, e
	}
	data, _ := optionObject(options.Data)
	if e := checkOrderedValue(spec); e != nil {
		return nil, e
	}
	// The specification is read in specification member order; data and rows keep theirs.
	spec, _ = compose.OrderMembers(spec).(*Object)
	if e := checkOrderedValue(data); e != nil {
		return nil, e
	}
	for _, row := range rows {
		if e := checkOrderedValue(row); e != nil {
			return nil, e
		}
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
	// Declarations are checked after the input rules and composition: the own design, then each member.
	if spec.Has("design") {
		if e := checkDesignDeclaration(read(spec, "design"), paths.own); e != nil {
			return nil, e
		}
	}
	for _, key := range columns.Keys() {
		if member := object(read(columns, key)); member != nil && member.Has("design") {
			if e := checkDesignDeclaration(read(member, "design"), paths.members+"."+key); e != nil {
				return nil, e
			}
		}
	}
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
		cells := []*Object{}
		rowLookup := plainLookup(row).(map[string]any)
		for _, col := range cols {
			field := strings.TrimPrefix(stringAt(col, "field"), ".")
			v := absent
			if field != "" {
				v = getPath(row, field)
			}
			format := object(read(col, "format"))
			display, e := renderCell(format, v, row, rowLookup, parsePath(field), options.Language)
			if e != nil {
				return nil, e
			}
			// A model is JSON: a path absent from the row is null, and the member is always present.
			var value any
			if !isAbsent(v) {
				value = v
			}
			cell := NewObject("format", format, "value", value, "display", display)
			cell.Set("design", resolveDesign(read(read(columns, stringAt(col, "key")), "design"), rowLookup, parsePath(field)))
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
	// Supplied page and total are JSON integers (int64), so 2.0 is written as 2 and -0 as 0.
	if page, present, _ := countOption(options.Page, 1); present {
		pagination.Set("page", page)
	}
	if total, present, _ := countOption(options.Total, 0); present {
		pagination.Set("total", total)
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

var interpolateRE = regexp.MustCompile(`\{=[A-Za-z_][\w.]*\}`)

func interpolate(s string, row *Object, value any) string {
	return interpolateRE.ReplaceAllStringFunc(s, func(token string) string {
		path := token[2 : len(token)-1]
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
			if math.IsNaN(decimals) || decimals < 0 || decimals > 100 {
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
				// A choice label is content: a string or a language map.
				return translate(v, language), nil
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
		// Only a number truncates: its integer part counts Unicode code points, never splitting one.
		if n, ok := asNumber(read(o, "truncate")); ok {
			limit := math.Trunc(n)
			runes := []rune(s)
			if limit >= 1 && float64(len(runes)) > limit {
				s = string(runes[:int(limit)]) + "…"
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
		attrs := NewObject("class", "crudui-badge")
		if v := stringAt(display, "variant"); v != "" { attrs.Set("data-crudui-variant", v) }
		return element("span", attrs, escape(stringAt(display, "label")))
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
			return element("span", NewObject("class", "crudui-bool crudui-bool--check", "data-crudui-state", fmt.Sprint(b), "aria-label", label), glyph)
		case "icon":
			return element("span", NewObject("class", "crudui-bool crudui-bool--icon", "data-crudui-state", fmt.Sprint(b), "aria-label", label), "")
		default:
			return element("span", NewObject("class", "crudui-bool crudui-bool--text", "data-crudui-state", fmt.Sprint(b)), escape(label))
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
	a := NewObject("class", joinClass("crudui-list", nodeClass(design, "wrapper")))
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
			toolbar += element("span", NewObject("class", "crudui-list__action", "data-action", stringAt(action, "key")), "<"+tag+attrs(at, true, false)+">"+escapeText(stringAt(action, "label"))+"</"+tag+">")
		}
		body += `<div class="crudui-list__actions">` + toolbar + `</div>`
	}
	rows := objectList(read(vm, "rows"))
	cols := objectList(read(vm, "columns"))
	if len(rows) == 0 {
		body += element("div", NewObject("class", "crudui-list__empty"), escape(stringAt(vm, "empty")))
	} else if layout == "card" {
		cards := ""
		for _, row := range rows {
			content := ""
			for i, cell := range objectList(read(row, "cells")) {
				d := object(read(cell, "design"))
				class := joinClass("crudui-list__cell crudui-value crudui-value--"+stringAt(read(cell, "format"), "type"), nodeClass(d, "main"))
				content += element("div", NewObject("class", class), element("span", NewObject("class", "crudui-list__card-label"), escape(stringAt(cols[i], "label")))+cellHTML(cell, "span", "crudui-list__card-value"))
			}
			cards += element("article", NewObject("class", "crudui-list__card"), content)
		}
		body += element("div", NewObject("class", "crudui-list__cards"), cards)
	} else {
		head := ""
		for _, col := range cols {
			d := object(read(col, "design"))
			at := NewObject("class", joinClass("crudui-list__heading", nodeClass(d, "main")))
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
			label := element("span", NewObject("class", "crudui-list__heading-label"), escape(stringAt(col, "label")))
			if truthy(read(col, "sortable")) {
				label += `<span class="crudui-list__sort">↕</span>`
			}
			head += element("th", at, label)
		}
		tbody := ""
		for _, row := range rows {
			inner := ""
			for _, cell := range objectList(read(row, "cells")) {
				inner += cellHTML(cell, "td", "crudui-list__cell crudui-value crudui-value--"+stringAt(read(cell, "format"), "type"))
			}
			tbody += "<tr>" + inner + "</tr>"
		}
		body += `<table class="crudui-list__table"><thead><tr>` + head + `</tr></thead><tbody>` + tbody + `</tbody></table>`
	}
	p := read(vm, "pagination")
	if truthy(read(p, "enabled")) {
		at := NewObject("class", "crudui-list__pagination")
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
	if e := checkListInput(spec, rows, options); e != nil {
		return "", e
	}
	layout := "table"
	if options.Layout != nil {
		s, ok := options.Layout.(string)
		if !ok || (s != "table" && s != "card") {
			return "", fmt.Errorf("List layout must be table or card")
		}
		layout = s
	}
	vm, e := BuildList(spec, rows, options)
	if e != nil {
		return "", e
	}
	return imagePreloads(vm) + listHTML(vm, layout), nil
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
