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
	return &FormTemplate{Kind: "crudui/form-template", KeyPrefix: options.KeyPrefix, keyPrefixProvided: options.KeyPrefixProvided || options.KeyPrefix != "", Fields: compileFields(p)}, nil
}
func compileFields(p *Object) []FieldTemplate {
	out := []FieldTemplate{}
	if p == nil {
		return out
	}
	for _, name := range p.Keys() {
		raw := object(read(p, name))
		if raw == nil {
			continue
		}
		s := copyValue(raw).(*Object)
		s.Delete("properties")
		out = append(out, FieldTemplate{Name: name, Spec: s, Children: compileFields(object(read(raw, "properties")))})
	}
	return out
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
