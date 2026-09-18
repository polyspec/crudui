package validate

// Input text conformance verifies the Go validator against the validation
// families of tests/fixtures/text-validity. The fixture JSON text carries
// unpaired surrogate escapes; compose.DecodeOrdered keeps them as text that is
// not valid UTF-8, so the JSON entry points and the value entry points report
// the failure the fixture declares.

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
	"github.com/polyspec/crudui/packages/validator-go/validator/internal/conformance"
)

// textCase holds the raw JSON text of each member of one fixture case.
type textCase map[string][]byte

func loadTextCases(t *testing.T, feature string) []textCase {
	t.Helper()
	path := filepath.Join("..", "..", "..", "..", "tests", "fixtures", "text-validity", feature, "cases.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("shared text-validity fixture not found at %s: %v", path, err)
	}
	// json.RawMessage keeps each case's text exactly as written.
	var items []json.RawMessage
	if err := json.Unmarshal(raw, &items); err != nil {
		t.Fatalf("fixture json decode: %v", err)
	}
	cases := make([]textCase, 0, len(items))
	for _, item := range items {
		members, err := compose.DecodeRawMembers(item)
		if err != nil {
			t.Fatalf("fixture case decode: %v", err)
		}
		c := textCase{}
		for _, m := range members {
			c[m.Name] = m.Value
		}
		cases = append(cases, c)
	}
	if len(cases) == 0 {
		t.Fatal("fixture is empty")
	}
	return cases
}

func (c textCase) name(t *testing.T) string {
	var name string
	if err := json.Unmarshal(c["name"], &name); err != nil {
		t.Fatalf("case name: %v", err)
	}
	return name
}

// jsonInputs returns the raw files and the decoded base path of a case.
func (c textCase) jsonInputs(t *testing.T) (map[string][]byte, string) {
	t.Helper()
	files := map[string][]byte{}
	if raw, ok := c["files"]; ok {
		members, err := compose.DecodeRawMembers(raw)
		if err != nil {
			t.Fatal(err)
		}
		for _, m := range members {
			files[m.Name] = m.Value
		}
	}
	basepath := ""
	if raw, ok := c["options"]; ok {
		options, err := compose.DecodeOrdered(raw)
		if err != nil {
			t.Fatal(err)
		}
		if value, found := options.(*compose.OMap).Get("basepath"); found {
			basepath = value.(string)
		}
	}
	return files, basepath
}

// valueInputs returns the decoded specification and options of a case.
func (c textCase) valueInputs(t *testing.T) (*compose.OMap, Options) {
	t.Helper()
	spec, err := compose.DecodeOrdered(c["spec"])
	if err != nil {
		t.Fatal(err)
	}
	files, basepath := c.jsonInputs(t)
	opts := Options{Files: FileSet{}, Basepath: basepath}
	for name, raw := range files {
		doc, err := compose.DecodeOrdered(raw)
		if err != nil {
			t.Fatal(err)
		}
		opts.Files[name] = doc.(*compose.OMap)
	}
	return spec.(*compose.OMap), opts
}

// textOutcome is the failure {code, message, at} or the validation result.
func textOutcome(result ValidationResult, err error) any {
	var load *compose.ComposeLoadError
	if errors.As(err, &load) {
		return map[string]any{"code": string(load.Code), "message": load.Message, "at": strings.Join(load.Trace, ".")}
	}
	var input *FormInputError
	if errors.As(err, &input) {
		return map[string]any{"code": input.Code(), "message": input.Message, "at": ""}
	}
	if err != nil {
		return err.Error()
	}
	encoded, _ := json.Marshal(result)
	var out map[string]any
	_ = json.Unmarshal(encoded, &out)
	if out["errors"] == nil {
		out["errors"] = []any{}
	}
	return out
}

func checkTextOutcome(t *testing.T, c textCase, label string, got any) {
	t.Helper()
	var want any
	if err := json.Unmarshal(c["expect"], &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("%s: got %#v, want %#v", label, got, want)
	}
}

func TestInputTextMatchesFixture(t *testing.T) {
	type entry struct {
		json  func(c textCase, files map[string][]byte, basepath string) (ValidationResult, error)
		value func(spec *compose.OMap, data any, opts Options) (ValidationResult, error)
	}
	decodeData := func(t *testing.T, c textCase) (json.RawMessage, any) {
		raw, ok := c["data"]
		if !ok {
			return nil, map[string]any{}
		}
		decoded, err := compose.DecodeOrdered(raw)
		if err != nil {
			t.Fatal(err)
		}
		return raw, plainValue(decoded)
	}
	features := map[string]entry{
		"validate": {
			json: func(c textCase, files map[string][]byte, basepath string) (ValidationResult, error) {
				return ValidateJSON(c["spec"], c["data"], files, basepath)
			},
			value: Validate,
		},
		"validateList": {
			json: func(c textCase, files map[string][]byte, basepath string) (ValidationResult, error) {
				return ValidateListJSON(c["spec"], files, basepath)
			},
			value: func(spec *compose.OMap, _ any, opts Options) (ValidationResult, error) {
				return ValidateList(spec, opts)
			},
		},
		"validateDetail": {
			json: func(c textCase, files map[string][]byte, basepath string) (ValidationResult, error) {
				return ValidateDetailJSON(c["spec"], files, basepath)
			},
			value: func(spec *compose.OMap, _ any, opts Options) (ValidationResult, error) {
				return ValidateDetail(spec, opts)
			},
		},
	}
	for _, feature := range []string{"validate", "validateList", "validateDetail"} {
		run := features[feature]
		fixture := "tests/fixtures/text-validity/" + feature + "/cases.json"
		for _, c := range loadTextCases(t, feature) {
			c := c
			name := c.name(t)
			t.Run(feature+"/"+name, func(t *testing.T) {
				conformance.Record(t, feature, fixture, name)
				files, basepath := c.jsonInputs(t)
				checkTextOutcome(t, c, "JSON text", textOutcome(run.json(c, files, basepath)))
				spec, opts := c.valueInputs(t)
				_, data := decodeData(t, c)
				checkTextOutcome(t, c, "values", textOutcome(run.value(spec, data, opts)))
			})
		}
	}
}

// Byte strings that are not UTF-8 cannot be written in JSON text; they are
// invalid text in Go values and inside JSON strings.
func TestInvalidUTF8Bytes(t *testing.T) {
	spec := func(label string) *compose.OMap {
		field := compose.NewOMap()
		field.Set("type", "text")
		field.Set("label", label)
		properties := compose.NewOMap()
		properties.Set("name", field)
		root := compose.NewOMap()
		root.Set("type", "group")
		root.Set("properties", properties)
		return root
	}
	for name, bytes := range map[string]string{
		"lone byte":          "\xff",
		"continuation":       "a\x80",
		"truncated":          "\xe2\x82",
		"overlong":           "\xc0\xaf",
		"encoded surrogate":  "\xed\xa0\x80",
		"above U+10FFFF":     "\xf4\x90\x80\x80",
		"five-byte sequence": "\xf8\x88\x80\x80\x80",
	} {
		_, err := Validate(spec("A"+bytes), map[string]any{}, Options{})
		var load *compose.ComposeLoadError
		if !errors.As(err, &load) || load.Code != compose.InvalidText || strings.Join(load.Trace, ".") != "properties.name.label" {
			t.Errorf("%s in a label: %v", name, err)
		}
		_, err = Validate(spec("A"), map[string]any{"rows": []any{"ok", map[string]any{bytes: 1}}}, Options{})
		var input *FormInputError
		if !errors.As(err, &input) || input.Message != "Text must be Unicode scalar values: data.rows.1" {
			t.Errorf("%s in a data member name: %v", name, err)
		}
		_, err = Validate(spec("A"), map[string]any{}, Options{Basepath: bytes})
		if !errors.As(err, &input) || input.Message != "Text must be Unicode scalar values: options.basepath" {
			t.Errorf("%s in the base path: %v", name, err)
		}
		// A raw byte inside a JSON string is kept, not replaced.
		_, err = ValidateJSON([]byte(`{"type":"group","properties":{}}`), []byte(`{"name":"`+bytes+`"}`), nil, "")
		if !errors.As(err, &input) || input.Message != "Text must be Unicode scalar values: data.name" {
			t.Errorf("%s in JSON data: %v", name, err)
		}
		_, err = ValidateListJSON([]byte(`{"columns":{}}`), map[string][]byte{"x" + bytes: []byte(`{}`)}, "")
		if !errors.As(err, &load) || load.Code != compose.InvalidText || len(load.Trace) != 0 {
			t.Errorf("%s in a file name: %v", name, err)
		}
	}
}

func TestDecodeOrderedKeepsText(t *testing.T) {
	for input, want := range map[string]string{
		`"😀"`:                  "\U0001F600",
		`"\ud800"`:             "\xed\xa0\x80",
		`"\udc00\ud800"`:       "\xed\xb0\x80\xed\xa0\x80",
		`"\ud800A"`:            "\xed\xa0\x80A",
		`"a\"\\\/\b\f\n\r\tz"`: "a\"\\/\b\f\n\r\tz",
		`"é中"`:                 "é中",
		"\"\xff\"":             "\xff",
	} {
		got, err := compose.DecodeOrdered([]byte(input))
		if err != nil || got != want {
			t.Errorf("%s: got %q, %v", input, got, err)
		}
	}
	for _, input := range []string{`1e400`, `{"a":1,}`, `"\ud80"`, `[1] 2`} {
		if _, err := compose.DecodeOrdered([]byte(input)); err == nil {
			t.Errorf("accepted %s", input)
		}
	}
	got, err := compose.DecodeOrdered([]byte(` {"b" : [1, -2.5e1, true, false, null, {}], "a":"x", "b":0} `))
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(got)
	if string(encoded) != `{"b":0,"a":"x"}` {
		t.Errorf("got %s", encoded)
	}
	members, err := compose.DecodeRawMembers([]byte(`{"\ud800" : [1, "\udc00"] , "b":{"c":2}}`))
	if err != nil || len(members) != 2 || members[0].Name != "\xed\xa0\x80" || string(members[0].Value) != `[1, "\udc00"]` || string(members[1].Value) != `{"c":2}` {
		t.Errorf("raw members: %#v, %v", members, err)
	}
	if _, err := compose.DecodeRawMembers([]byte(`[]`)); err == nil {
		t.Error("accepted an array as members")
	}
}

// graphCase is one case of tests/fixtures/text-validity/value-graphs.json.
type graphCase struct {
	Name  string          `json:"name"`
	Spec  json.RawMessage `json:"spec"`
	Files json.RawMessage `json:"files"`
	Data  json.RawMessage `json:"data"`
	Graph json.RawMessage `json:"graph"`
	Want  json.RawMessage `json:"expect"`
}

// buildGraph builds the value graph of a case with shared slices and maps.
func buildGraph(t *testing.T, raw json.RawMessage) ([]string, any) {
	t.Helper()
	decoded, err := compose.DecodeOrdered(raw)
	if err != nil {
		t.Fatal(err)
	}
	graph := decoded.(*compose.OMap)
	at, _ := graph.Get("at")
	var path []string
	for _, segment := range at.([]any) {
		path = append(path, segment.(string))
	}
	shape, _ := graph.Get("shape")
	if shape == "self-twice" {
		loop := map[string]any{}
		loop["self"] = loop
		loop["again"] = loop
		return path, loop
	}
	sizeValue, _ := graph.Get("size")
	size := int(sizeValue.(float64))
	leaf, _ := graph.Get("leaf")
	if shape == "flat" {
		items := make([]any, size)
		for i := range items {
			items[i] = leaf
		}
		return path, items
	}
	value := leaf
	for i := 0; i < size; i++ {
		if shape == "doubled" {
			value = []any{value, value}
		} else {
			value = []any{value}
		}
	}
	return path, value
}

// graphCaseLimit bounds each value graph case; a walk that grows with the tree
// a value denotes does not complete in it.
const graphCaseLimit = 2 * time.Second

// TestValueGraphsMatchFixture runs the value limit cases, whose values share
// slices and maps or contain themselves, as Go values can.
func TestValueGraphsMatchFixture(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "tests", "fixtures", "text-validity", "value-graphs.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases []graphCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) == 0 {
		t.Fatal("fixture is empty")
	}
	for _, c := range cases {
		c := c
		t.Run(c.Name, func(t *testing.T) {
			decode := func(raw json.RawMessage) *compose.OMap {
				value, err := compose.DecodeOrdered(raw)
				if err != nil {
					t.Fatal(err)
				}
				return value.(*compose.OMap)
			}
			spec := decode(c.Spec)
			opts := Options{Files: FileSet{}}
			if c.Files != nil {
				files := decode(c.Files)
				for _, name := range files.Keys() {
					file, _ := files.Get(name)
					opts.Files[name] = file.(*compose.OMap)
				}
			}
			data := plainValue(decode(c.Data)).(map[string]any)
			path, graph := buildGraph(t, c.Graph)
			member := path[len(path)-1]
			switch path[0] {
			case "spec":
				spec.Set(member, graph)
			case "files":
				opts.Files[path[1]].Set(member, graph)
			default:
				data[member] = graph
			}
			started := time.Now()
			got := textOutcome(Validate(spec, data, opts))
			if elapsed := time.Since(started); elapsed >= graphCaseLimit {
				t.Errorf("took %v", elapsed)
			}
			var want any
			if err := json.Unmarshal(c.Want, &want); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("got %#v, want %#v", got, want)
			}
		})
	}
}
