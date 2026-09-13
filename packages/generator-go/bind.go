package generator

import (
	"fmt"
	"strings"
)

type bindState struct {
	data    *Object
	lookup  map[string]any
	options BindOptions
	rows    []int
}

// BindForm creates complete field models without changing the template or record.
func BindForm(template *FormTemplate, data *Object, options BindOptions) ([]*Object, error) {
	if e := checkOrderedValue(data); e != nil {
		return nil, e
	}
	if template == nil || template.Kind != "crudui/form-template" {
		return nil, fmt.Errorf("Unsupported form template")
	}
	if data == nil {
		data = NewObject()
	}
	if options.IDPrefix == "" {
		options.IDPrefix = "crudui"
	}
	if options.Language == "" {
		options.Language = "ko"
	}
	if options.KeyPrefix == "" && !options.KeyPrefixProvided {
		options.KeyPrefix = template.KeyPrefix
	}
	if options.Unsupported == "" {
		options.Unsupported = "throw"
	}
	s := bindState{data: data, lookup: plainLookup(data).(map[string]any), options: options}
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
	return read(f.Spec, "multiple") == true || object(read(f.Spec, "multiple")) != nil
}
func multipleSettings(spec *Object) *Object {
	v := read(spec, "multiple")
	if v == true {
		return NewObject("show", true)
	}
	o := object(v)
	if o == nil {
		return nil
	}
	s := NewObject("show", true)
	for _, k := range []string{"min", "max"} {
		if _, ok := asNumber(read(o, k)); ok {
			s.Set(k, read(o, k))
		}
	}
	s.Set("copy", read(o, "copy") == true)
	s.Set("sortable", read(o, "sortable") == true)
	return s
}
func makeWidget(spec *Object, value any, path string, design *Object, s bindState) (*Object, error) {
	w := evalWidget(widgetContext{spec: spec, value: value, path: path, design: design, state: s})
	if w != nil {
		return w, nil
	}
	if s.options.Unsupported == "marker" {
		return NewObject("unsupported", true, "type", stringAt(spec, "type")), nil
	}
	return nil, &UnsupportedFieldTypeError{Type: stringAt(spec, "type"), Path: path}
}
func buildField(f FieldTemplate, path string, s bindState) (*Object, error) {
	spec := f.Spec
	typ := stringAt(spec, "type")
	d := resolveDesign(read(spec, "design"), s.lookup, parsePath(path))
	wrapper := strings.ReplaceAll(path, "[]", ".*") + "-layer"
	if s.options.KeyPrefix != "" {
		wrapper = s.options.KeyPrefix + "." + wrapper
	}
	vm := NewObject("shape", "leaf", "type", typ, "path", path, "wrapperName", wrapper, "uniqid", elementID("", path), "design", d)
	if truthy(read(spec, "label")) {
		vm.Set("label", translate(read(spec, "label"), s.options.Language))
	}
	vm.Set("omitLabel", typ == "hidden")
	if desc := translate(read(spec, "description"), s.options.Language); desc != "" {
		vm.Set("description", desc)
	}
	value := getPath(s.data, path)
	if m := multipleSettings(spec); m != nil {
		shape := "multiple-leaf"
		if typ == "group" {
			shape = "multiple-group"
		}
		vm.Set("shape", shape)
		vm.Set("multiple", m)
		rows := []*Object{}
		rowState := s
		rowState.rows = append(append([]int{}, s.rows...), len(parsePath(path)))
		var rowKeys []string
		switch {
		case isAbsent(value):
			rowKeys = []string{"__0000000000000__"}
		case object(value) != nil:
			rowKeys = object(value).Keys()
		default:
			return nil, fmt.Errorf("Repeated data must be a keyed object: %s", path)
		}
		for i, key := range rowKeys {
			p := path + "." + key
			rd := resolveDesign(read(spec, "design"), s.lookup, parsePath(p))
			clone := ""
			if i > 0 {
				clone = "clone-element"
			}
			row := NewObject("uniqid", key, "wrapperClass", joinClass("input-group-wrapper", clone, nodeClass(rd, "wrapper")))
			if typ == "group" {
				if e := checkGroupData(getPath(s.data, p), p); e != nil {
					return nil, e
				}
				children, e := buildChildren(f.Children, p, rowState)
				if e != nil {
					return nil, e
				}
				row.Set("groupClass", joinClass("form-group", nodeClass(rd, "group")))
				row.Set("children", children)
			} else {
				w, e := makeWidget(spec, getPath(s.data, p), p, rd, rowState)
				if e != nil {
					return nil, e
				}
				row.Set("widget", w)
			}
			rows = append(rows, row)
		}
		vm.Set("rows", rows)
		return vm, nil
	}
	if typ == "group" {
		if e := checkGroupData(value, path); e != nil {
			return nil, e
		}
		vm.Set("shape", "group")
		vm.Set("omitLabel", false)
		vm.Set("groupClass", joinClass("form-group", nodeClass(d, "group")))
		if st := styleString(nodeStyle(d, "group")); st != "" {
			vm.Set("groupStyle", st)
		}
		children, e := buildChildren(f.Children, path, s)
		if e != nil {
			return nil, e
		}
		vm.Set("children", children)
		return vm, nil
	}
	l := read(spec, "lang")
	if l == true || object(l) != nil {
		vm.Set("shape", "lang")
		langs := []any{"ko", "en", "ja", "zh"}
		if a := list(read(l, "only")); len(a) > 0 {
			langs = a
		}
		frame := "lang-group"
		if read(l, "frame") == false {
			frame = "lang-group p-0 border-0"
		}
		lang := NewObject("groupClass", joinClass(frame, stringAt(l, "group_class")))
		if title := translate(read(l, "title"), s.options.Language); title != "" {
			lang.Set("title", title)
		}
		children := []*Object{}
		for _, code := range langs {
			p := path + "." + jsString(code)
			ld := resolveDesign(read(spec, "design"), s.lookup, parsePath(p))
			w, e := makeWidget(spec, getPath(s.data, p), p, ld, s)
			if e != nil {
				return nil, e
			}
			children = append(children, NewObject("code", code, "widget", w))
		}
		lang.Set("children", children)
		vm.Set("lang", lang)
		return vm, nil
	}
	if typ == "checkbox" || typ == "switcher" {
		effective := value
		if isAbsent(effective) {
			effective = read(spec, "default")
		}
		checked := effective == true || effective == float64(1) || effective == 1 || effective == "1"
		vm.Set("checkbox", true)
		vm.Set("checkboxId", controlID(s.options.IDPrefix, path))
		vm.Set("checkboxName", bracketName(path, s.options.KeyPrefix))
		vm.Set("checkboxClass", joinClass("valid-target", nodeClass(d, "main")))
		vm.Set("checkboxChecked", checked)
		return vm, nil
	}
	w, e := makeWidget(spec, value, path, d, s)
	if e != nil {
		return nil, e
	}
	vm.Set("widget", w)
	return vm, nil
}
