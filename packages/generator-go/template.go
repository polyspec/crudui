// Package generator compiles, binds and renders CRUDUI forms and lists in Go.
package generator

import (
	"encoding/json"
	"fmt"
	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
)

// FieldTemplate stores one resolved field specification and its ordered children.
type FieldTemplate struct {
	Name     string          `json:"name"`
	Spec     *Object         `json:"spec"`
	Children []FieldTemplate `json:"children"`
}

// FormTemplate stores reusable structure without record data.
type FormTemplate struct {
	Kind              string          `json:"kind"`
	KeyPrefix         string          `json:"keyPrefix,omitempty"`
	Fields            []FieldTemplate `json:"fields"`
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

// BindOptions selects control IDs, language, form-name prefix and unsupported-field handling.
type BindOptions struct {
	IDPrefix          string
	Language          string
	KeyPrefix         string
	Unsupported       string
	KeyPrefixProvided bool
}

// CompileForm resolves field composition without binding record data.
func CompileForm(spec *Object, options CompileOptions) (*FormTemplate, error) {
	if e := checkOrderedValue(spec); e != nil {
		return nil, e
	}
	if spec == nil || stringAt(spec, "type") != "group" || object(read(spec, "properties")) == nil {
		return nil, fmt.Errorf("A form spec must be a group with properties")
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
	return &FormTemplate{Kind: "crudui/form-template", KeyPrefix: options.KeyPrefix, keyPrefixProvided: options.KeyPrefixProvided || options.KeyPrefix != "", Fields: fields}, nil
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

// checkDeclarations rejects a wrong value type in one field's multiple and design declarations.
func checkDeclarations(spec *Object, path string) error {
	fail := func(key, expected string) error {
		return fmt.Errorf("Invalid %s at %s: expected %s", key, path, expected)
	}
	if spec.Has("multiple") {
		multiple := read(spec, "multiple")
		_, isBool := multiple.(bool)
		settings := object(multiple)
		if !isBool && settings == nil {
			return fail("multiple", "a boolean or an object")
		}
		if settings != nil {
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
		}
	}
	if spec.Has("design") {
		design := read(spec, "design")
		_, isBool := design.(bool)
		d := object(design)
		if !isBool && d == nil {
			return fail("design", "a boolean or an object")
		}
		if d == nil {
			return nil
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
			for _, key := range []string{"class", "style"} {
				if n.Has(key) && !conditionValue(read(n, key)) {
					return fail("design."+node+"."+key, "a string or a condition map")
				}
			}
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
	*t = FormTemplate{Kind: "crudui/form-template", KeyPrefix: stringAt(o, "keyPrefix"), keyPrefixProvided: o.Has("keyPrefix"), Fields: fields}
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
	return json.Marshal(o)
}
