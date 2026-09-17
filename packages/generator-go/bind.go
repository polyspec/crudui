package generator

import (
	"fmt"
	"strconv"
	"strings"
)

// boundOptions holds the resolved text options of one binding.
type boundOptions struct {
	IDPrefix, KeyPrefix, Unsupported string
}

type bindState struct {
	data     *Object
	lookup   map[string]any
	options  boundOptions
	language string
	messages formMessages
	// rows holds repeated path segment positions, numbers the one-based positions of the enclosing rows.
	rows    []int
	numbers []int
	// stickyDepth counts enclosing rows with a sticky header.
	stickyDepth int
}

// BindForm creates the node models of the form grammar without changing the template or record.
func BindForm(template *FormTemplate, data *Object, options BindOptions) ([]*Object, error) {
	if e := CheckBindText(template, data, options); e != nil {
		return nil, e
	}
	if e := checkOrderedValue(data); e != nil {
		return nil, e
	}
	if template == nil || template.Kind != "crudui/form-template" {
		return nil, fmt.Errorf("Unsupported form template")
	}
	if data == nil {
		data = NewObject()
	}
	// Nil selects each default. Type errors come in option order, before a supported-language check.
	language, e := bindLanguage(options)
	if e != nil {
		return nil, e
	}
	bound := boundOptions{IDPrefix: "crudui", KeyPrefix: template.KeyPrefix, Unsupported: "throw"}
	for _, option := range []struct {
		name   string
		value  any
		target *string
	}{{"keyPrefix", options.KeyPrefix, &bound.KeyPrefix}, {"idPrefix", options.IDPrefix, &bound.IDPrefix}} {
		if option.value == nil {
			continue
		}
		s, ok := option.value.(string)
		if !ok {
			return nil, fmt.Errorf("%s must be a string", option.name)
		}
		*option.target = s
	}
	if options.Unsupported != nil {
		if options.Unsupported != "throw" && options.Unsupported != "marker" {
			return nil, fmt.Errorf("unsupported must be throw or marker")
		}
		bound.Unsupported = options.Unsupported.(string)
	}
	messages, e := messagesFor(language)
	if e != nil {
		return nil, e
	}
	s := bindState{data: data, lookup: plainLookup(data).(map[string]any), options: bound, language: language, messages: messages}
	return buildChildren(template.Fields, "", s)
}
func buildChildren(fields []FieldTemplate, path string, s bindState) ([]*Object, error) {
	out := []*Object{}
	for _, f := range fields {
		p := f.Name
		if path != "" {
			p = path + "." + f.Name
		}
		v, e := buildField(f, p, s)
		if e != nil {
			return nil, e
		}
		out = append(out, v)
	}
	return out, nil
}

// checkGroupData requires present group data, including a repeated group row, to be an object.
func checkGroupData(value any, path string) error {
	if !isAbsent(value) && object(value) == nil {
		return fmt.Errorf("Group data must be an object: %s", path)
	}
	return nil
}
func repeated(f FieldTemplate) bool {
	return repeatedSpec(f.Spec)
}

// repeatedSpec reports a field declared multiple: true, only or an object.
func repeatedSpec(spec *Object) bool {
	v := read(spec, "multiple")
	return v == true || v == "only" || object(v) != nil
}

// dataOnly reports a collection declared multiple: only or multiple.only: true, whose rows come
// only from the data.
func dataOnly(spec *Object) bool {
	v := read(spec, "multiple")
	return v == "only" || read(object(v), "only") == true
}

// multiple holds the evaluated controls and limits of a repeated field.
type multiple struct {
	min, max       float64
	hasMin, hasMax bool
	copy, sortable bool
	// only marks rows that come only from the data.
	only     bool
	title    string
	hasTitle bool
	controls string
	header   string
}

func multipleSettings(spec *Object) *multiple {
	v := read(spec, "multiple")
	if v == true || v == "only" {
		return &multiple{only: v == "only", controls: "header", header: "static"}
	}
	o := object(v)
	if o == nil {
		return nil
	}
	m := &multiple{copy: read(o, "copy") == true, sortable: read(o, "sortable") == true, only: read(o, "only") == true, controls: "header", header: "static"}
	m.min, m.hasMin = asNumber(read(o, "min"))
	m.max, m.hasMax = asNumber(read(o, "max"))
	m.title, m.hasTitle = read(o, "title").(string)
	if c := read(o, "controls"); c == "footer" || c == "outline" {
		m.controls = c.(string)
	}
	if read(o, "header") == "sticky" {
		m.header = "sticky"
	}
	return m
}
func makeWidget(spec *Object, value any, path string, design *Object, s bindState) (*Object, error) {
	w := evalWidget(widgetContext{spec: spec, value: value, path: path, design: design, state: s})
	if w != nil {
		return w, nil
	}
	if s.options.Unsupported != "throw" {
		return NewObject("unsupported", true, "type", stringAt(spec, "type")), nil
	}
	return nil, &UnsupportedFieldTypeError{Type: stringAt(spec, "type"), Path: path}
}

// nodeRoot starts a node with its kind, path and design.wrapper appearance.
func nodeRoot(kind, path string, d *Object) *Object {
	vm := NewObject("kind", kind, "path", path, "className", nodeClass(d, "wrapper"))
	if st := styleString(nodeStyle(d, "wrapper")); st != "" {
		vm.Set("style", st)
	}
	vm.Set("hidden", read(d, "show") != true)
	return vm
}

// setHeader adds a header from alternating part names and values, omitting empty parts and an empty header.
func setHeader(vm *Object, d *Object, parts ...string) {
	header := NewObject("className", nodeClass(d, "label"))
	if st := styleString(nodeStyle(d, "label")); st != "" {
		header.Set("style", st)
	}
	present := false
	for i := 0; i < len(parts); i += 2 {
		if parts[i+1] != "" {
			header.Set(parts[i], parts[i+1])
			present = true
		}
	}
	if present {
		vm.Set("header", header)
	}
}
func nodeBody(className, style, id string) *Object {
	body := NewObject("className", className)
	if st := styleString(style); st != "" {
		body.Set("style", st)
	}
	if id != "" {
		body.Set("id", id)
	}
	return body
}
func actionModel(name, label string, disabled bool) *Object {
	return NewObject("name", name, "label", label, "disabled", disabled)
}

// labelTarget returns the control identifier a field label targets.
func labelTarget(w *Object) string {
	if read(w, "unsupported") == true {
		return ""
	}
	if file := read(read(w, "extra"), "file"); has(file, "id") && read(file, "id") != nil {
		return stringAt(file, "id")
	}
	return stringAt(read(w, "attrs"), "id")
}
func buildField(f FieldTemplate, path string, s bindState) (*Object, error) {
	spec := f.Spec
	d := resolveDesign(read(spec, "design"), s.lookup, parsePath(path))
	label, description := "", ""
	if truthy(read(spec, "label")) {
		label = translate(read(spec, "label"), s.language)
	}
	if truthy(read(spec, "description")) {
		description = translate(read(spec, "description"), s.language)
	}
	if m := multipleSettings(spec); m != nil {
		return buildCollection(f, path, d, label, description, m, s)
	}
	if stringAt(spec, "type") == "group" {
		return buildGroup(f, path, d, label, description, s)
	}
	if l := read(spec, "lang"); l == true || object(l) != nil {
		return buildLang(spec, path, d, label, description, l, s)
	}
	return buildLeaf(spec, path, d, label, description, s)
}
func buildLeaf(spec *Object, path string, d *Object, label, description string, s bindState) (*Object, error) {
	typ := stringAt(spec, "type")
	value := getPath(s.data, path)
	vm := nodeRoot("field", path, d)
	if typ == "checkbox" || typ == "switcher" {
		effective := value
		if isAbsent(effective) {
			effective = read(spec, "default")
		}
		checked := effective == true || effective == float64(1) || effective == 1 || effective == "1"
		setHeader(vm, d, "description", description)
		vm.Set("body", nodeBody("", "", ""))
		vm.Set("checkbox", NewObject("id", controlID(s.options.IDPrefix, path), "name", bracketName(path, s.options.KeyPrefix), "className", joinClass("valid-target", nodeClass(d, "main")), "checked", checked, "caption", label))
		return vm, nil
	}
	w, e := makeWidget(spec, value, path, d, s)
	if e != nil {
		return nil, e
	}
	if typ != "hidden" {
		labelFor := ""
		if label != "" {
			labelFor = labelTarget(w)
		}
		setHeader(vm, d, "label", label, "labelFor", labelFor, "description", description)
	}
	vm.Set("body", nodeBody("", "", ""))
	vm.Set("widget", w)
	return vm, nil
}
func buildGroup(f FieldTemplate, path string, d *Object, label, description string, s bindState) (*Object, error) {
	if e := checkGroupData(getPath(s.data, path), path); e != nil {
		return nil, e
	}
	vm := nodeRoot("group", path, d)
	setHeader(vm, d, "label", label, "description", description)
	vm.Set("body", nodeBody(nodeClass(d, "group"), nodeStyle(d, "group"), ""))
	children, e := buildChildren(f.Children, path, s)
	if e != nil {
		return nil, e
	}
	vm.Set("children", children)
	return vm, nil
}
func buildCollection(f FieldTemplate, path string, d *Object, label, description string, m *multiple, s bindState) (*Object, error) {
	var keys []string
	switch value := getPath(s.data, path); {
	case isAbsent(value) && m.only:
		keys = []string{}
	case isAbsent(value):
		keys = []string{"__0000000000000__"}
	case object(value) != nil:
		keys = object(value).Keys()
	default:
		return nil, fmt.Errorf("Repeated data must be a keyed object: %s", path)
	}
	item := "field"
	if stringAt(f.Spec, "type") == "group" {
		item = "group"
	}
	rows := []*Object{}
	for i, key := range keys {
		row, e := buildRow(f, path, key, i, len(keys), item, label, m, s)
		if e != nil {
			return nil, e
		}
		rows = append(rows, row)
	}
	vm := nodeRoot("collection", path, d)
	setHeader(vm, d, "label", label, "description", description, "count", formatCount(s.messages.count, len(keys)))
	vm.Set("body", nodeBody("", "", ""))
	vm.Set("item", item)
	if len(keys) == 0 && !m.only {
		full := m.hasMax && 0 >= m.max
		vm.Set("controls", NewObject("placement", "footer", "label", s.messages.collectionControls, "actions", []*Object{actionModel("add-row", s.messages.addRow, full)}))
	}
	vm.Set("children", rows)
	return vm, nil
}
func buildRow(f FieldTemplate, collectionPath, key string, index, count int, item, label string, m *multiple, s bindState) (*Object, error) {
	msg := s.messages
	rowPath := collectionPath + "." + key
	rd := resolveDesign(read(f.Spec, "design"), s.lookup, parsePath(rowPath))
	sticky := m.header == "sticky"
	rowState := s
	rowState.rows = append(append([]int{}, s.rows...), len(parsePath(collectionPath)))
	rowState.numbers = append(append([]int{}, s.numbers...), index+1)
	if sticky {
		rowState.stickyDepth++
	}
	vm := NewObject("kind", "row", "key", key, "className", "", "hidden", false)
	// Rows that come only from the data have no row controls.
	if !m.only {
		full := m.hasMax && float64(count) >= m.max
		actions := []*Object{}
		if m.sortable {
			actions = append(actions, actionModel("move-up", msg.moveUp, index == 0), actionModel("move-down", msg.moveDown, index == count-1))
		}
		actions = append(actions, actionModel("add-row", msg.addRow, full))
		if m.copy {
			actions = append(actions, actionModel("copy-row", msg.copyRow, full))
		}
		actions = append(actions, actionModel("remove-row", msg.removeRow, m.hasMin && float64(count) <= m.min))
		vm.Set("controls", NewObject("placement", m.controls, "label", msg.rowControls, "actions", actions))
	}
	if sticky {
		vm.Set("sticky", true)
		vm.Set("stickyDepth", s.stickyDepth)
	}
	numbers := make([]string, len(rowState.numbers))
	for i, n := range rowState.numbers {
		numbers[i] = strconv.Itoa(n)
	}
	header := NewObject("className", "")
	if label != "" {
		header.Set("label", label)
	}
	header.Set("number", strings.Join(numbers, "."))
	vm.Set("header", header)
	if item == "field" {
		w, e := makeWidget(f.Spec, getPath(s.data, rowPath), rowPath, rd, rowState)
		if e != nil {
			return nil, e
		}
		vm.Set("body", nodeBody("", "", ""))
		vm.Set("widget", w)
		return vm, nil
	}
	if e := checkGroupData(getPath(s.data, rowPath), rowPath); e != nil {
		return nil, e
	}
	children, e := buildChildren(f.Children, rowPath, rowState)
	if e != nil {
		return nil, e
	}
	summary := msg.collapsed
	nested, total := false, 0
	for _, child := range children {
		if stringAt(child, "kind") == "collection" {
			nested = true
			total += len(objectList(read(child, "children")))
		}
	}
	if nested {
		summary = formatCount(msg.children, total)
	}
	if m.hasTitle {
		v := getPath(s.data, rowPath+"."+m.title)
		if isAbsent(v) || v == nil || v == "" {
			header.Set("title", msg.untitled)
		} else {
			header.Set("title", jsString(v))
		}
	}
	header.Set("summary", summary)
	vm.Set("body", nodeBody(nodeClass(rd, "group"), nodeStyle(rd, "group"), controlID(s.options.IDPrefix, rowPath)+":body"))
	vm.Set("collapsible", true)
	// Server rendering has no view state, so every row is expanded.
	vm.Set("expanded", true)
	vm.Set("toggleLabel", msg.toggleRow)
	vm.Set("children", children)
	return vm, nil
}
func buildLang(spec *Object, path string, d *Object, label, description string, l any, s bindState) (*Object, error) {
	langs := []any{"ko", "en", "ja", "zh"}
	if a := list(read(l, "only")); len(a) > 0 {
		langs = a
	}
	frame := ""
	if read(l, "frame") != false {
		frame = "crudui-node--framed"
	}
	groupClass, _ := read(l, "group_class").(string)
	title := ""
	if truthy(read(l, "title")) {
		title = translate(read(l, "title"), s.language)
	}
	vm := nodeRoot("lang", path, d)
	// A framed language group is a node modifier; the stylesheet draws the frame around its body.
	vm.Set("className", joinClass(frame, stringAt(vm, "className")))
	setHeader(vm, d, "label", label, "description", description, "title", title)
	vm.Set("body", nodeBody(joinClass(groupClass), "", ""))
	children := []*Object{}
	for _, code := range langs {
		p := path + "." + jsString(code)
		ld := resolveDesign(read(spec, "design"), s.lookup, parsePath(p))
		w, e := makeWidget(spec, getPath(s.data, p), p, ld, s)
		if e != nil {
			return nil, e
		}
		children = append(children, NewObject("kind", "lang-item", "lang", code, "className", "", "hidden", false, "header", NewObject("className", "", "label", code), "body", nodeBody("", "", ""), "widget", w))
	}
	vm.Set("children", children)
	return vm, nil
}
