package main

import (
	"encoding/json"
	"strings"
	"testing"

	gen "github.com/polyspec/crudui/packages/generator-go"
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

func TestListInputRulesUseDecodedTypes(t *testing.T) {
	cases := map[string]string{
		`{"operation":"renderList","spec":[],"rows":[1]}`:                                                "List specification must be an object",
		`{"operation":"renderList","spec":"list"}`:                                                       "List specification must be an object",
		`{"operation":"renderList","spec":{},"rows":{}}`:                                                 "List rows must be an array",
		`{"operation":"renderList","spec":{},"rows":[[]]}`:                                               "List rows must be objects",
		`{"operation":"renderList","spec":{},"rows":[],"options":{"data":[]}}`:                           "List context must be an object",
		`{"operation":"renderList","spec":{},"rows":[],"options":{"data":"s"}}`:                          "List context must be an object",
		`{"operation":"renderList","spec":{},"rows":[],"options":{"data":[],"page":0}}`:                  "List context must be an object",
		`{"operation":"renderList","spec":{},"rows":[],"options":{"page":"2"}}`:                          "List page must be a positive integer",
		`{"operation":"renderList","spec":{},"rows":[],"options":{"page":0,"total":-1,"layout":"grid"}}`: "List page must be a positive integer",
		`{"operation":"renderList","spec":{},"rows":[],"options":{"page":1.5}}`:                          "List page must be a positive integer",
		`{"operation":"renderList","spec":{},"rows":[],"options":{"page":9007199254740992}}`:             "List page must be a positive integer",
		`{"operation":"renderList","spec":{},"rows":[],"options":{"total":-1,"layout":"grid"}}`:          "List total must be a nonnegative integer",
		`{"operation":"renderList","spec":{},"rows":[],"options":{"total":2.5}}`:                         "List total must be a nonnegative integer",
		`{"operation":"renderList","spec":{},"rows":[],"options":{"total":true}}`:                        "List total must be a nonnegative integer",
		`{"operation":"renderList","spec":{},"rows":[],"options":{"pageMeta":[]}}`:                       "",
		`{"operation":"renderList","spec":{},"rows":[],"options":{"page":9007199254740991,"total":-0}}`:  "",
		`{"operation":"renderList","spec":{},"rows":[],"options":{"page":null,"total":null}}`:            "",
		`{"operation":"renderList","spec":{},"rows":[],"options":{"layout":"grid"}}`:                     "List layout must be table or card",
		`{"operation":"renderList","spec":{},"rows":[],"options":{"layout":5}}`:                          "List layout must be table or card",
		`{"operation":"renderList","spec":{},"rows":[],"options":{"data":null,"layout":null}}`:           "",
	}
	cases[`{"operation":"renderDetail","spec":{"fields":{"v":{"field":"v"}}},"record":{},"options":{"data":[]}}`] = "Detail context must be an object"
	cases[`{"operation":"buildDetail","spec":{"fields":{"v":{"field":"v"}}},"record":{},"options":{"data":"s"}}`] = "Detail context must be an object"
	cases[`{"operation":"renderDetail","spec":{"fields":{"v":{"field":"v"}}},"record":{},"options":{"data":null}}`] = ""
	for input, want := range cases {
		v, err := gen.DecodeJSON([]byte(input))
		if err != nil {
			t.Fatal(err)
		}
		_, err = run(obj(v))
		if (want == "" && err != nil) || (want != "" && (err == nil || err.Error() != want)) {
			t.Errorf("%s: got %v, want %q", input, err, want)
		}
	}
}

func TestSnapshotPropagatesRenderError(t *testing.T) {
	if _, err := snapshot(nil); err == nil {
		t.Fatal("snapshot accepted a missing form")
	}
}

func TestButtonOperationsMatchJavaScript(t *testing.T) {
	spec, err := gen.DecodeJSON([]byte(`{"type":"group","buttons":[{"type":"link","text":{"ko":"목록","en":"List"},"href":"../?a=1&b=\"2\""},{"type":"submit","name":"__submitted__","value":"go","design":{"class":{"name == \"a\"":"primary","true":"plain"},"style":"color: red; width: 5px"}},{"type":"button","text":"Back <now>","behavior":{"onclick":{"label":"x","script":"history.back()"}}}],"properties":{"name":{"type":"text"}}}`))
	if err != nil {
		t.Fatal(err)
	}
	declared, err := gen.CompileForm(obj(spec), gen.CompileOptions{})
	if err != nil {
		t.Fatal(err)
	}
	plain, err := gen.CompileForm(gen.NewObject("type", "group", "properties", gen.NewObject()), gen.CompileOptions{})
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		request          *gen.Object
		wantVM, wantHTML string
	}{
		{gen.NewObject("operation", "bindButtons", "template", declared, "data", gen.NewObject("name", "a"), "options", gen.NewObject("language", "en")),
			`[{"type":"link","tag":"a","text":"List","attrs":{"class":"crudui-action crudui-action--text","href":"../?a=1&b=\"2\""}},{"type":"submit","tag":"button","text":"Save","attrs":{"type":"submit","class":"crudui-action crudui-action--text primary","style":"color: red; width: 5px","name":"__submitted__","value":"go"}},{"type":"button","tag":"button","text":"Back <now>","attrs":{"type":"button","class":"crudui-action crudui-action--text","onclick":"history.back()"}}]`,
			`<a class="crudui-action crudui-action--text" href="../?a=1&amp;b=&quot;2&quot;">List</a><button type="submit" class="crudui-action crudui-action--text primary" style="color: red; width: 5px" name="__submitted__" value="go">Save</button><button type="button" class="crudui-action crudui-action--text" onclick="history.back()">Back &lt;now&gt;</button>`},
		{gen.NewObject("operation", "bindButtons", "template", plain),
			`[{"type":"submit","tag":"button","text":"저장","attrs":{"type":"submit","class":"crudui-action crudui-action--text"}}]`,
			`<button type="submit" class="crudui-action crudui-action--text">저장</button>`},
	} {
		// Round-trip through JSON as the command does, so decoded values reach both operations.
		buttons := roundTrip(t, c.request)
		if got := plainJSON(t, buttons); got != c.wantVM {
			t.Fatalf("%s\n%s", got, c.wantVM)
		}
		html := roundTrip(t, gen.NewObject("operation", "formButtonsHtml", "buttons", buttons))
		if html != c.wantHTML {
			t.Fatalf("%v\n%s", html, c.wantHTML)
		}
	}
	for source, message := range map[string]string{
		`{"operation":"bindButtons","template":{"kind":"x"}}`:                                                                      "Unsupported form template",
		`{"operation":"bindButtons","template":{"kind":"crudui/form-template","fields":[],"buttons":[]},"data":[]}`:                "Form data must be an object",
		`{"operation":"bindButtons","template":{"kind":"crudui/form-template","fields":[],"buttons":[]},"options":[]}`:             "Options must be an object",
		`{"operation":"bindButtons","template":{"kind":"crudui/form-template","fields":[],"buttons":[]},"options":{"language":1}}`: "Language must be a string",
		`{"operation":"formButtonsHtml"}`:                                                       "Form buttons must be a list",
		`{"operation":"formButtonsHtml","buttons":{}}`:                                          "Form buttons must be a list",
		`{"operation":"formButtonsHtml","buttons":"x"}`:                                         "Form buttons must be a list",
		`{"operation":"formButtonsHtml","buttons":[1]}`:                                         "Form buttons must be evaluated button objects",
		`{"operation":"formButtonsHtml","buttons":[null]}`:                                      "Form buttons must be evaluated button objects",
		`{"operation":"formButtonsHtml","buttons":[{"tag":"div","text":"x","attrs":{}}]}`:       "Form buttons must be evaluated button objects",
		`{"operation":"formButtonsHtml","buttons":[{"tag":"a","text":1,"attrs":{}}]}`:           "Form buttons must be evaluated button objects",
		`{"operation":"formButtonsHtml","buttons":[{"tag":"a","text":"x","attrs":[]}]}`:         "Form buttons must be evaluated button objects",
		`{"operation":"formButtonsHtml","buttons":[{"tag":"a","text":"x","attrs":{"id":"i"}}]}`: "Form buttons must be evaluated button objects",
		`{"operation":"formButtonsHtml","buttons":[{"tag":"a","text":"x","attrs":{"href":1}}]}`: "Form buttons must be evaluated button objects",
	} {
		v, err := gen.DecodeJSON([]byte(source))
		if err != nil {
			t.Fatal(err)
		}
		_, err = run(obj(v))
		if err == nil || err.Error() != message {
			t.Errorf("%s: %v", source, err)
			continue
		}
		if e := errorObject(err); str(val(e, "code")) != "INVALID_FORM_INPUT" || val(e, "at") != "" {
			t.Errorf("%s: %v", source, e)
		}
	}
}

// roundTrip encodes a request as JSON, decodes it and runs it, returning the decoded result.
func roundTrip(t *testing.T, request *gen.Object) any {
	t.Helper()
	b, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	v, err := gen.DecodeJSON(b)
	if err != nil {
		t.Fatal(err)
	}
	result, err := run(obj(v))
	if err != nil {
		t.Fatal(err)
	}
	out, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := gen.DecodeJSON(out)
	if err != nil {
		t.Fatal(err)
	}
	return decoded
}

// plainJSON encodes a value as JavaScript JSON.stringify does; ordered objects escape HTML characters internally, so those escapes are undone.
func plainJSON(t *testing.T, v any) string {
	t.Helper()
	var b strings.Builder
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		t.Fatal(err)
	}
	return strings.NewReplacer(`\u0026`, "&", `\u003c`, "<", `\u003e`, ">").Replace(strings.TrimSuffix(b.String(), "\n"))
}
