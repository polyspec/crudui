package generator

import (
	"encoding/json"
	"os"
	"testing"
)

// TestOutlineFixture checks that BuildOutline reproduces the rows of the shared structure map cases for the nodes that
// BindForm returns.
func TestOutlineFixture(t *testing.T) {
	source, err := os.ReadFile("../../../tests/fixtures/form-outline/cases.json")
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := DecodeJSON(source)
	if err != nil {
		t.Fatal(err)
	}
	cases := list(decoded)
	if len(cases) == 0 {
		t.Fatal("form-outline cases are empty")
	}
	for _, item := range cases {
		name := stringAt(item, "name")
		template, err := CompileForm(object(read(item, "spec")), CompileOptions{})
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		options := object(read(item, "options"))
		nodes, err := BindForm(template, object(read(item, "data")), BindOptions{Language: read(options, "language")})
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		actual, err := json.Marshal(BuildOutline(nodes))
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		expected, err := json.Marshal(read(item, "expected_outline_rows"))
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if string(actual) != string(expected) {
			t.Errorf("%s:\nactual   %s\nexpected %s", name, actual, expected)
		}
	}
}
