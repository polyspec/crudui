package main

import (
	"encoding/json"
	"testing"

	gen "github.com/crudui/crudui/packages/generator-go"
)

func TestRejectedRowActionsHaveNoResultAndPreserveState(t *testing.T) {
	template, err := gen.CompileForm(gen.NewObject("type", "group", "properties", gen.NewObject("rows", gen.NewObject("type", "text", "multiple", gen.NewObject("max", 1)))), gen.CompileOptions{})
	if err != nil {
		t.Fatal(err)
	}
	request := gen.NewObject("operation", "form", "template", template, "data", gen.NewObject("rows", gen.NewObject("first", "kept")))
	before, err := run(request)
	if err != nil {
		t.Fatal(err)
	}
	request.Set("actions", []any{
		gen.NewObject("method", "addRow", "args", []any{"rows", gen.NewObject("key", "second")}),
		gen.NewObject("method", "copyRow", "args", []any{"rows", "first"}),
		gen.NewObject("method", "getValue", "args", []any{"rows.first"}),
	})
	response, err := run(request)
	if err != nil {
		t.Fatal(err)
	}
	steps := val(obj(response), "steps").([]*gen.Object)
	for _, step := range steps[:2] {
		if val(step, "result") != nil {
			t.Fatalf("rejected action returned %#v", val(step, "result"))
		}
		if str(val(obj(val(step, "error")), "code")) != "INVALID_FORM_INPUT" {
			t.Fatalf("unexpected error: %#v", val(step, "error"))
		}
		for _, key := range []string{"data", "fields", "html", "revision"} {
			got, _ := json.Marshal(val(step, key))
			want, _ := json.Marshal(val(obj(before), key))
			if string(got) != string(want) {
				t.Errorf("rejected action changed %s", key)
			}
		}
	}
	if val(steps[2], "result") != "kept" || val(steps[2], "error") != nil {
		t.Fatal("successful action after failure did not return its value")
	}
}

func TestSnapshotPropagatesRenderError(t *testing.T) {
	if _, err := snapshot(nil); err == nil {
		t.Fatal("snapshot accepted a missing form")
	}
}
