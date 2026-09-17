package generator

import (
	"fmt"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
	"github.com/polyspec/crudui/packages/validator-go/validator/text"
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
	// Input text is checked first (docs/spec/input-text.md).
	options, e := checkDisplayText(spec, text.Input{Name: "rows", Value: rows}, options)
	if e != nil {
		return nil, e
	}
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
	// Declarations are checked after the input rules and composition: the own design, each member, then the pagination.
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
	if spec.Has("pagination") {
		if e := checkPaginationDeclaration(read(spec, "pagination"), paths.own); e != nil {
			return nil, e
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
			sort = evalFlag(v, lookup, nil)
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
	pagination := paginationModel(read(spec, "pagination"), options)
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
		if v := stringAt(display, "variant"); v != "" {
			attrs.Set("data-crudui-variant", v)
		}
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
		at := NewObject("class", "crudui-list__pagination", "data-mode", stringAt(p, "mode"), "data-per-page", stringAt(p, "perPage"), "data-page", stringAt(p, "page"))
		if has(p, "total") {
			at.Set("data-total", stringAt(p, "total"))
		}
		pageCount, _ := read(p, "pageCount").(int64)
		page := int64(1)
		if pageCount > 0 {
			page, _ = read(p, "page").(int64)
			page = min(pageCount, page)
		}
		button := func(class string, value int64, label string, disabled, current bool) string {
			x := NewObject("type", "button", "class", class, "data-page", strconv.FormatInt(value, 10), "aria-label", label)
			if current {
				x.Set("aria-current", "page")
			}
			if disabled {
				x.Set("disabled", true)
			}
			text := label
			if label == "Previous page" {
				text = "‹"
			}
			if label == "Next page" {
				text = "›"
			}
			if strings.HasPrefix(label, "Page ") {
				text = strings.TrimPrefix(label, "Page ")
			}
			return element("button", x, text)
		}
		content := button("crudui-list__pagination-prev", max(1, page-1), "Previous page", page <= 1 || pageCount == 0, false)
		for _, i := range paginationPages(page, pageCount) {
			content += button("crudui-list__pagination-page", i, "Page "+strconv.FormatInt(i, 10), i == page, i == page)
		}
		content += button("crudui-list__pagination-next", max(1, min(pageCount, page+1)), "Next page", pageCount == 0 || page >= pageCount, false)
		body += element("nav", at, content)
	}
	return element("div", a, body)
}

// paginationDeclarationKeys are the members a pagination declaration may hold.
var paginationDeclarationKeys = []string{"per_page", "mode"}

// checkPaginationDeclaration rejects a wrong value type or an unknown key in the pagination
// declaration at path.
func checkPaginationDeclaration(pagination any, path string) error {
	fail := func(key, expected string) error {
		return fmt.Errorf("Invalid %s at %s: expected %s", key, path, expected)
	}
	p := object(pagination)
	if _, isBool := pagination.(bool); !isBool && p == nil {
		return fail("pagination", "a boolean or an object")
	}
	if p == nil {
		return nil
	}
	for _, key := range p.Keys() {
		if !slices.Contains(paginationDeclarationKeys, key) {
			return fmt.Errorf("Invalid pagination.%s at %s: unknown key", key, path)
		}
	}
	if p.Has("per_page") {
		if _, _, ok := countOption(read(p, "per_page"), 1); !ok || read(p, "per_page") == nil {
			return fail("pagination.per_page", "a positive integer")
		}
	}
	if p.Has("mode") {
		if mode, ok := read(p, "mode").(string); !ok || !slices.Contains([]string{"pages", "offset", "cursor", "none"}, mode) {
			return fail("pagination.mode", "pages, offset, cursor or none")
		}
	}
	return nil
}

// paginationModel returns the pagination model, in member order: enabled, then for enabled
// paging perPage, mode and page with their defaults, the supplied total and pageCount.
// Disabled paging keeps only the supplied page and total. Supplied counts are JSON integers
// (int64), so 2.0 is written as 2 and -0 as 0.
func paginationModel(declared any, options ListOptions) *Object {
	enabled := declared == true || object(declared) != nil
	pagination := NewObject("enabled", enabled)
	page, pagePresent, _ := countOption(options.Page, 1)
	perPage := int64(20)
	if enabled {
		if value, present, ok := countOption(read(declared, "per_page"), 1); present && ok {
			perPage = value
		}
		mode := "pages"
		if value, ok := read(declared, "mode").(string); ok {
			mode = value
		}
		if !pagePresent {
			page = 1
		}
		pagination.Set("perPage", perPage)
		pagination.Set("mode", mode)
		pagination.Set("page", page)
	} else if pagePresent {
		pagination.Set("page", page)
	}
	total, totalPresent, _ := countOption(options.Total, 0)
	if totalPresent {
		pagination.Set("total", total)
	}
	if enabled {
		pageCount := int64(0)
		if totalPresent {
			pageCount = max(1, int64(math.Ceil(float64(total)/float64(perPage))))
		}
		pagination.Set("pageCount", pageCount)
	}
	return pagination
}

// paginationPages returns the bounded page-number window: every page up to seven pages,
// otherwise the first, previous, current, next and last page.
func paginationPages(page, pageCount int64) []int64 {
	pages := []int64{}
	if pageCount <= 7 {
		for i := int64(1); i <= pageCount; i++ {
			pages = append(pages, i)
		}
		return pages
	}
	for _, value := range []int64{1, max(1, page-1), page, min(pageCount, page+1), pageCount} {
		if len(pages) == 0 || pages[len(pages)-1] < value {
			pages = append(pages, value)
		}
	}
	return pages
}

// RenderList renders a table or card list with image resource hints in first-use order.
func RenderList(spec *Object, rows []*Object, options ListOptions) (string, error) {
	options, e := checkDisplayText(spec, text.Input{Name: "rows", Value: rows}, options)
	if e != nil {
		return "", e
	}
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
