package generator

import (
	"errors"
	"strings"
	"testing"

	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
)

// Byte strings that are not UTF-8 are invalid text in every generator input;
// the shared JSON cases run through the native generator suite.
func TestInputTextRejectsInvalidUTF8(t *testing.T) {
	const bad = "\xed\xa0\x80"
	message := func(e error) string {
		if e == nil {
			return ""
		}
		return e.Error()
	}
	loadAt := func(e error) string {
		var load *compose.ComposeLoadError
		if !errors.As(e, &load) || load.Code != compose.InvalidText || load.Message != "Text must be Unicode scalar values" {
			return "not a text load failure: " + message(e)
		}
		return strings.Join(load.Trace, ".")
	}
	spec := parseObject(t, `{"type":"group","properties":{"name":{"type":"text"},"rows":{"type":"group","multiple":true,"properties":{"v":{"type":"text"}}}}}`)
	template := compile(t, `{"type":"group","properties":{"name":{"type":"text"},"rows":{"type":"group","multiple":true,"properties":{"v":{"type":"text"}}}}}`)

	bad1 := parseObject(t, `{"type":"group","properties":{"name":{"type":"text","label":"x"}}}`)
	label, _ := bad1.Get("properties")
	field, _ := object(label).Get("name")
	object(field).Set("label", "x"+bad)
	if _, e := CompileForm(bad1, CompileOptions{}); loadAt(e) != "properties.name.label" {
		t.Errorf("compile label: %v", e)
	}
	if _, e := CompileForm(spec, CompileOptions{Files: map[string]*Object{"b.yml": NewObject("x", NewObject(bad, 1))}}); loadAt(e) != "b.yml.x" {
		t.Errorf("compile file: %v", e)
	}
	loader := compose.NewMemoryLoader(map[string]*Object{"b.yml": NewObject("properties", NewObject("x", NewObject("type", bad)))})
	ref := parseObject(t, `{"type":"group","properties":{"$ref":"b.yml"}}`)
	if _, e := CompileForm(ref, CompileOptions{Loader: loader, Files: map[string]*Object{bad: NewObject()}}); loadAt(e) != "b.yml.properties.x.type" {
		t.Errorf("compile loader: %v", e)
	}
	if _, e := CompileForm(spec, CompileOptions{KeyPrefix: bad}); message(e) != "Text must be Unicode scalar values: options.keyPrefix" {
		t.Errorf("compile key prefix: %v", e)
	}
	if _, e := BindForm(template, NewObject("rows", NewObject("k", NewObject("v", bad))), BindOptions{}); message(e) != "Text must be Unicode scalar values: data.rows.k.v" {
		t.Errorf("bind data: %v", e)
	}
	if _, e := BindButtons(template, nil, BindOptions{Unsupported: bad, Language: bad}); message(e) != "Text must be Unicode scalar values: options.language" {
		t.Errorf("buttons options: %v", e)
	}
	if _, e := NewForm(template, NewObject(bad, 1), BindOptions{}); message(e) != "Text must be Unicode scalar values: data" {
		t.Errorf("new form: %v", e)
	}
	form, e := NewForm(template, NewObject("rows", NewObject("k", NewObject("v", "a"))), BindOptions{})
	if e != nil {
		t.Fatal(e)
	}
	for name, run := range map[string]func() error{
		"path":             func() error { return form.SetValue("name"+bad, "x") },
		"value.1":          func() error { return form.SetValue("name", []any{"ok", bad}) },
		"data.name":        func() error { return form.SetData(NewObject("name", bad)) },
		"options.afterKey": func() error { _, e := form.AddRow("rows", AddRowOptions{AfterKey: bad, Key: bad}); return e },
		"key":              func() error { _, e := form.CopyRow("rows", bad, AddRowOptions{}); return e },
		"newKey":           func() error { return form.RekeyRow("rows", "k", bad) },
	} {
		if message(run()) != "Text must be Unicode scalar values: "+name {
			t.Errorf("%s: %v", name, run())
		}
	}
	if _, e := form.GetValue(bad); message(e) != "Text must be Unicode scalar values: path" {
		t.Errorf("get value: %v", e)
	}
	list := parseObject(t, `{"columns":{"v":{"field":"v"}}}`)
	if _, e := RenderList(list, []*Object{NewObject("v", "a"), NewObject("v", bad)}, ListOptions{Page: 0}); message(e) != "Text must be Unicode scalar values: rows.1.v" {
		t.Errorf("render list rows: %v", e)
	}
	if _, e := BuildList(list, nil, ListOptions{Layout: bad, Data: NewObject("a", bad)}); message(e) != "Text must be Unicode scalar values: options.data.a" {
		t.Errorf("list options: %v", e)
	}
	detail := parseObject(t, `{"fields":{"v":{"field":"v"}}}`)
	if _, e := RenderDetail(detail, NewObject("v", bad), DetailOptions{}); message(e) != "Text must be Unicode scalar values: record.v" {
		t.Errorf("detail record: %v", e)
	}
	// A value that contains itself is beyond the value limits, found by the same walk.
	cyclic := []any{nil}
	cyclic[0] = cyclic
	if e := form.SetValue("name", cyclic); message(e) != "Recursive or excessively nested value: value" {
		t.Errorf("cyclic value: %v", e)
	}
}
