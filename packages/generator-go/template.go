// Package generator compiles, binds and renders CRUDUI forms and lists in Go.
package generator

import (
	"encoding/json"
	"fmt"
	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
	"slices"
	"strconv"
)

// FieldTemplate stores one resolved field specification and its ordered children.
type FieldTemplate struct {
	Name     string          `json:"name"`
	Spec     *Object         `json:"spec"`
	Children []FieldTemplate `json:"children"`
}

// FormTemplate stores reusable structure without record data.
type FormTemplate struct {
	Kind      string          `json:"kind"`
	KeyPrefix string          `json:"keyPrefix,omitempty"`
	Fields    []FieldTemplate `json:"fields"`
	// Buttons lists the form buttons in declaration order; one submit button when the spec declares none.
	Buttons []*Object `json:"buttons"`
	// Action is the submission target declared by the spec, kept for the application.
	Action            *Object `json:"action,omitempty"`
	keyPrefixProvided bool
}

// CompileOptions supplies composition files and the optional form-name prefix.
type CompileOptions struct {
	Files             map[string]*Object
	Loader            compose.FileLoader
	Basepath          string
	KeyPrefix         string
	KeyPrefixProvided bool
}

// BindOptions selects control IDs, content and interface language, form-name prefix and unsupported-field handling.
// Each option is nil for its default; decoded JSON of another type or value is rejected.
type BindOptions struct {
	// IDPrefix defaults to crudui.
	IDPrefix any
	// Language defaults to ko and must be ko, en, ja or zh, so an empty string is rejected.
	Language any
	// KeyPrefix defaults to the template prefix; an empty string removes it.
	KeyPrefix any
	// Unsupported is throw (default) or marker, which renders unsupported fields as markers.
	Unsupported any
}

// CompileForm resolves field composition without binding record data.
func CompileForm(spec *Object, options CompileOptions) (*FormTemplate, error) {
	if e := checkOrderedValue(spec); e != nil {
		return nil, e
	}
	if spec == nil || stringAt(spec, "type") != "group" || object(read(spec, "properties")) == nil {
		return nil, fmt.Errorf("A form spec must be a group with properties")
	}
	if e := checkFormDeclarations(spec); e != nil {
		return nil, e
	}
	loader := options.Loader
	if loader == nil {
		loader = compose.NewMemoryLoader(options.Files)
	}
	p, e := compose.ComposeProperties(object(read(spec, "properties")), loader, compose.ComposeOptions{Basepath: options.Basepath})
	if e != nil {
		return nil, e
	}
	fields, e := compileFields(p, "")
	if e != nil {
		return nil, e
	}
	buttons := []*Object{NewObject("type", "submit")}
	if declared, ok := read(spec, "buttons").([]any); ok {
		buttons = []*Object{}
		for _, button := range declared {
			buttons = append(buttons, copyValue(button).(*Object))
		}
	}
	var action *Object
	if declared := object(read(spec, "action")); declared != nil {
		action = copyValue(declared).(*Object)
	}
	return &FormTemplate{Kind: "crudui/form-template", KeyPrefix: options.KeyPrefix, keyPrefixProvided: options.KeyPrefixProvided || options.KeyPrefix != "", Fields: fields, Buttons: buttons, Action: action}, nil
}

// checkFormDeclarations rejects a wrong root action or buttons declaration.
func checkFormDeclarations(spec *Object) error {
	fail := func(key, expected string) error {
		return fmt.Errorf("Invalid %s at form: expected %s", key, expected)
	}
	if spec.Has("action") {
		action := object(read(spec, "action"))
		if action == nil {
			return fail("action", "an object")
		}
		for _, key := range []string{"method", "url", "enctype"} {
			if _, ok := read(action, key).(string); action.Has(key) && !ok {
				return fail("action."+key, "a string")
			}
		}
	}
	if !spec.Has("buttons") {
		return nil
	}
	declared, ok := read(spec, "buttons").([]any)
	if !ok {
		return fail("buttons", "a list of buttons")
	}
	for index, value := range declared {
		key := "buttons." + strconv.Itoa(index)
		button := object(value)
		if button == nil {
			return fail(key, "an object")
		}
		kind, _ := read(button, "type").(string)
		if !formButtonTypes[kind] {
			return fail(key+".type", "submit, reset, button or link")
		}
		for _, name := range []string{"name", "value", "href"} {
			if _, ok := read(button, name).(string); button.Has(name) && !ok {
				return fail(key+"."+name, "a string")
			}
		}
		// A button type without interface text needs declared text.
		if buttonText(messageTables["ko"], kind) == "" && !button.Has("text") {
			return fail(key+".text", "content for this button type")
		}
		if kind == "link" && !button.Has("href") {
			return fail(key+".href", "a link target")
		}
		if e := checkDeclarations(button, "form."+key); e != nil {
			return e
		}
	}
	return nil
}
func compileFields(p *Object, parent string) ([]FieldTemplate, error) {
	out := []FieldTemplate{}
	if p == nil {
		return out, nil
	}
	for _, name := range p.Keys() {
		raw := object(read(p, name))
		if raw == nil {
			continue
		}
		path := name
		if parent != "" {
			path = parent + "." + name
		}
		if e := checkDeclarations(raw, path); e != nil {
			return nil, e
		}
		children, e := compileFields(object(read(raw, "properties")), path)
		if e != nil {
			return nil, e
		}
		s := copyValue(raw).(*Object)
		s.Delete("properties")
		out = append(out, FieldTemplate{Name: name, Spec: s, Children: children})
	}
	return out, nil
}

// conditionValue reports a string or a condition map, which is a non-empty object.
func conditionValue(v any) bool {
	if _, ok := v.(string); ok {
		return true
	}
	o := object(v)
	return o != nil && len(o.Keys()) > 0
}

// scalarChild reports a child that renders one scalar value: not repeated, not a group and not a language field.
func scalarChild(v any) bool {
	child := object(v)
	if child == nil {
		return false
	}
	multiple, lang := read(child, "multiple"), read(child, "lang")
	repeated := multiple == true || object(multiple) != nil
	language := lang == true || object(lang) != nil
	return stringAt(child, "type") != "group" && !child.Has("properties") && !repeated && !language
}

// closedKeys lists the keys each closed declaration bucket allows.
var closedKeys = map[string][]string{
	"multiple":    {"min", "max", "copy", "sortable", "title", "controls", "header", "onclick"},
	"lang":        {"mode", "only", "name", "key", "frame", "title", "group_class"},
	"design":      {"show", "class", "style", "label", "wrapper", "group", "prepend"},
	"design node": {"class", "style"},
	"behavior":    {"onchange", "onclick", "onload"},
}

// unknownKey returns the first key of o, in declaration order, that the bucket does not allow.
func unknownKey(o *Object, bucket string) (string, bool) {
	for _, key := range o.Keys() {
		if !slices.Contains(closedKeys[bucket], key) {
			return key, true
		}
	}
	return "", false
}

// checkDeclarations rejects a wrong value type or an unknown key in one field's closed declarations.
func checkDeclarations(spec *Object, path string) error {
	fail := func(key, expected string) error {
		return fmt.Errorf("Invalid %s at %s: expected %s", key, path, expected)
	}
	unknown := func(key string) error {
		return fmt.Errorf("Invalid %s at %s: unknown key", key, path)
	}
	// Buttons and the submission target belong to the form, not to a field.
	for _, key := range []string{"buttons", "action"} {
		if spec.Has(key) {
			return fail(key, "the form root")
		}
	}
	if spec.Has("multiple") {
		multiple := read(spec, "multiple")
		_, isBool := multiple.(bool)
		settings := object(multiple)
		if !isBool && settings == nil {
			return fail("multiple", "a boolean or an object")
		}
		if settings != nil {
			if key, found := unknownKey(settings, "multiple"); found {
				return unknown("multiple." + key)
			}
			for _, key := range []string{"min", "max"} {
				if _, ok := asNumber(read(settings, key)); settings.Has(key) && !ok {
					return fail("multiple."+key, "a number")
				}
			}
			for _, key := range []string{"copy", "sortable"} {
				if _, ok := read(settings, key).(bool); settings.Has(key) && !ok {
					return fail("multiple."+key, "a boolean")
				}
			}
			if settings.Has("title") {
				if stringAt(spec, "type") != "group" {
					return fail("multiple.title", "a repeated group")
				}
				title, ok := read(settings, "title").(string)
				properties := object(read(spec, "properties"))
				if !ok || !has(properties, title) || !scalarChild(read(properties, title)) {
					return fail("multiple.title", "the name of a direct child field without multiple, properties or lang")
				}
			}
			if c, _ := read(settings, "controls").(string); settings.Has("controls") && c != "header" && c != "footer" && c != "outline" {
				return fail("multiple.controls", "header, footer or outline")
			}
			if h, _ := read(settings, "header").(string); settings.Has("header") && h != "static" && h != "sticky" {
				return fail("multiple.header", "static or sticky")
			}
		}
	}
	if spec.Has("lang") {
		if _, isBool := read(spec, "lang").(bool); !isBool && object(read(spec, "lang")) == nil {
			return fail("lang", "a boolean or an object")
		}
		if lang := object(read(spec, "lang")); lang != nil {
			if key, found := unknownKey(lang, "lang"); found {
				return unknown("lang." + key)
			}
		}
	}
	if lang := object(read(spec, "lang")); lang != nil && lang.Has("only") {
		only := read(lang, "only")
		codes, isList := only.([]any)
		for _, code := range codes {
			if _, ok := code.(string); !ok {
				isList = false
			}
		}
		if !isList && object(only) == nil {
			return fail("lang.only", "a list of language codes or an object")
		}
	}
	if spec.Has("design") {
		design := read(spec, "design")
		_, isBool := design.(bool)
		d := object(design)
		if !isBool && d == nil {
			return fail("design", "a boolean or an object")
		}
	}
	if d := object(read(spec, "design")); d != nil {
		if key, found := unknownKey(d, "design"); found {
			return unknown("design." + key)
		}
		if show := read(d, "show"); d.Has("show") {
			if _, ok := show.(bool); !ok && !conditionValue(show) {
				return fail("design.show", "an expression, a boolean or a condition map")
			}
		}
		for _, key := range []string{"class", "style"} {
			if d.Has(key) && !conditionValue(read(d, key)) {
				return fail("design."+key, "a string or a condition map")
			}
		}
		for _, node := range []string{"label", "wrapper", "group", "prepend"} {
			if !d.Has(node) {
				continue
			}
			n := object(read(d, node))
			if n == nil {
				return fail("design."+node, "an object")
			}
			if key, found := unknownKey(n, "design node"); found {
				return unknown("design." + node + "." + key)
			}
			for _, key := range []string{"class", "style"} {
				if n.Has(key) && !conditionValue(read(n, key)) {
					return fail("design."+node+"."+key, "a string or a condition map")
				}
			}
		}
	}
	if behavior := object(read(spec, "behavior")); behavior != nil {
		if key, found := unknownKey(behavior, "behavior"); found {
			return unknown("behavior." + key)
		}
	}
	return nil
}

// UnmarshalJSON preserves declaration order inside field specifications.
func (t *FormTemplate) UnmarshalJSON(data []byte) error {
	v, e := DecodeJSON(data)
	if e != nil {
		return e
	}
	o := object(v)
	if o == nil || stringAt(o, "kind") != "crudui/form-template" {
		return fmt.Errorf("Unsupported form template")
	}
	a, ok := read(o, "fields").([]any)
	if !ok {
		return fmt.Errorf("Form template fields must be an array")
	}
	fields, e := decodeFields(a)
	if e != nil {
		return e
	}
	declared, ok := read(o, "buttons").([]any)
	if !ok {
		return fmt.Errorf("Form template buttons must be an array")
	}
	buttons := []*Object{}
	for _, value := range declared {
		button := object(value)
		if button == nil {
			return fmt.Errorf("Malformed form button template")
		}
		buttons = append(buttons, button)
	}
	*t = FormTemplate{Kind: "crudui/form-template", KeyPrefix: stringAt(o, "keyPrefix"), keyPrefixProvided: o.Has("keyPrefix"), Fields: fields, Buttons: buttons, Action: object(read(o, "action"))}
	return nil
}
func decodeFields(a []any) ([]FieldTemplate, error) {
	out := []FieldTemplate{}
	for _, v := range a {
		o := object(v)
		s := object(read(o, "spec"))
		name, ok := read(o, "name").(string)
		ch, childrenOK := read(o, "children").([]any)
		if !ok || s == nil || !childrenOK {
			return nil, fmt.Errorf("Malformed form field template")
		}
		c, e := decodeFields(ch)
		if e != nil {
			return nil, e
		}
		out = append(out, FieldTemplate{Name: name, Spec: s, Children: c})
	}
	return out, nil
}
func cloneTemplate(t *FormTemplate) (*FormTemplate, error) {
	if t == nil || t.Kind != "crudui/form-template" {
		return nil, fmt.Errorf("Unsupported form template")
	}
	b, e := json.Marshal(t)
	if e != nil {
		return nil, e
	}
	var out FormTemplate
	e = json.Unmarshal(b, &out)
	return &out, e
}

// UnsupportedFieldTypeError identifies a field type that has no supported widget.
type UnsupportedFieldTypeError struct {
	Type string
	Path string
}

// Error returns the unsupported type and its structural field path.
func (e *UnsupportedFieldTypeError) Error() string {
	return "Unsupported field type \"" + e.Type + "\" at \"" + e.Path + "\""
}

// Code returns the shared unsupported-field error code.
func (e *UnsupportedFieldTypeError) Code() string { return "UNSUPPORTED_FIELD_TYPE" }

// MarshalJSON retains specification order and an explicitly empty form-name prefix.
func (t FormTemplate) MarshalJSON() ([]byte, error) {
	o := NewObject("kind", t.Kind)
	if t.keyPrefixProvided || t.KeyPrefix != "" {
		o.Set("keyPrefix", t.KeyPrefix)
	}
	o.Set("fields", t.Fields)
	o.Set("buttons", t.Buttons)
	if t.Action != nil {
		o.Set("action", t.Action)
	}
	return json.Marshal(o)
}
