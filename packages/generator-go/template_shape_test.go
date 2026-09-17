package generator

import (
	"encoding/json"
	"strings"
	"testing"
)

// A template that is not exactly the compiled shape is rejected when it is decoded.
func TestTemplateShapeIsRejected(t *testing.T) {
	named := `{"kind":"crudui/form-template","fields":[{"name":"name","spec":{"type":"text"},"children":[]}],"buttons":[{"type":"submit"}]}`
	for _, text := range []string{
		`{"kind":"crudui/form-template","buttons":[]}`,
		`{"kind":"crudui/form-template","fields":{},"buttons":[]}`,
		`{"kind":"crudui/form-template","fields":["name"],"buttons":[]}`,
		`{"kind":"crudui/form-template","fields":[{"name":"name","spec":{}}],"buttons":[]}`,
		`{"kind":"crudui/form-template","fields":[{"name":"name","spec":{},"children":[],"label":"x"}],"buttons":[]}`,
		`{"kind":"crudui/form-template","fields":[]}`,
		`{"kind":"crudui/form-template","fields":[],"buttons":{}}`,
		`{"kind":"crudui/form-template","fields":[],"buttons":[[]]}`,
		`{"kind":"crudui/form-template","fields":[],"buttons":[],"version":1}`,
		`{"kind":"other","fields":[],"buttons":[]}`,
		`{"kind":"crudui/form-template","fields":[],"buttons":[],"keyPrefix":null}`,
		`{"kind":"crudui/form-template","fields":[],"buttons":[],"action":"/save"}`,
	} {
		var template FormTemplate
		if e := json.Unmarshal([]byte(text), &template); e == nil || e.Error() != "Unsupported form template" {
			t.Fatalf("%s: %v", text, e)
		}
	}
	var template FormTemplate
	declared := strings.Replace(named, `"buttons"`, `"keyPrefix":"p","action":{"url":"/save"},"buttons"`, 1)
	if e := json.Unmarshal([]byte(declared), &template); e != nil || template.KeyPrefix != "p" {
		t.Fatal(e)
	}
}

// Widget model members follow one output order.
func TestWidgetMemberOrder(t *testing.T) {
	template := compile(t, `{"type":"group","properties":{"memo":{"type":"textarea","prepend":"P"},"note":{"type":"dummy"},"go":{"type":"button"},"pick":{"type":"choice","options":{"a":"A"}}}}`)
	nodes, e := BindForm(template, NewObject(), BindOptions{})
	if e != nil {
		t.Fatal(e)
	}
	position := map[string]int{}
	for index, key := range widgetMembers {
		position[key] = index
	}
	for _, node := range nodes {
		keys := object(read(node, "widget")).Keys()
		for index := 1; index < len(keys); index++ {
			if position[keys[index-1]] >= position[keys[index]] {
				t.Fatalf("widget members out of order: %v", keys)
			}
		}
	}
}
