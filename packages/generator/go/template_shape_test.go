package generator

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// The cases of tests/fixtures/template-shape (CURT-092). A template is decoded from its JSON text first, which refuses a
// shape that is not the compiled one; the operation of the case then runs on the decoded template.
func TestTemplateShapeCases(t *testing.T) {
	const want = 42
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "tests", "fixtures", "template-shape", "cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	var items []map[string]json.RawMessage
	if err := json.Unmarshal(raw, &items); err != nil {
		t.Fatal(err)
	}
	if len(items) != want {
		t.Fatalf("the fixture holds %d cases, want %d", len(items), want)
	}
	for _, item := range items {
		var name string
		if err := json.Unmarshal(item["name"], &name); err != nil {
			t.Fatal(err)
		}
		t.Run(name, func(t *testing.T) {
			got, err := json.Marshal(outcomeOf(runTemplateShapeCase(t, item)))
			if err != nil {
				t.Fatal(err)
			}
			expect, err := DecodeJSON(item["expect"])
			if err != nil {
				t.Fatal(err)
			}
			want, err := json.Marshal(expect)
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != string(want) {
				t.Errorf("got %s\nwant %s", got, want)
			}
		})
	}
}

// runTemplateShapeCase decodes the template of a case and runs its operation with the case data and default options.
func runTemplateShapeCase(t *testing.T, item map[string]json.RawMessage) error {
	t.Helper()
	var operation string
	if err := json.Unmarshal(item["operation"], &operation); err != nil {
		t.Fatal(err)
	}
	var template FormTemplate
	if err := json.Unmarshal(item["template"], &template); err != nil {
		return err
	}
	value, err := DecodeJSON(item["data"])
	if err != nil {
		t.Fatal(err)
	}
	data, ok := value.(*Object)
	if !ok {
		t.Fatalf("the data of the case is %T, not an object", value)
	}
	switch operation {
	case "bindForm":
		_, err = BindForm(&template, data, BindOptions{})
	case "bindButtons":
		_, err = BindButtons(&template, data, BindOptions{})
	case "createForm":
		_, err = NewForm(&template, data, BindOptions{})
	default:
		t.Fatalf("unknown template operation %s", operation)
	}
	return err
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
