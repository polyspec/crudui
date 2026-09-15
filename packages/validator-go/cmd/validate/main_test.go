package main

// Go validation CLI stdin/stdout conformance.
//
// The ValidateJSON ENGINE is already pinned by
// validator/model/validate/conformance_test.go. This test owns only the CLI wrapper
// boundary (cmd/validate-model): serialization (stdin JSON → ValidateJSON → stdout
// {valid,errors}), exit code, and the Go-specific LOAD-failure wire. It does NOT
// re-verify rule semantics — it asserts the wrapper streams the engine result
// verbatim and routes a load failure onto the Go wire, never a valid:false
// masquerade.
//
// The test builds the binary in a temporary directory and sends a UTF-8 request
// through stdin from the package root. It fails on a wrong exit code, a missing
// field or a load error reported as a validation result.
//
// Failure wire (identical in every language): a load or input failure exits 2
// with stdout exactly {error, code, at} and no "valid" key. A bad request exits 1
// with {error} and no "code". The CLI must reproduce the fixture output on stdout.

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"
)

type cliCase struct {
	Name     string          `json:"name"`
	Spec     json.RawMessage `json:"spec"`
	Data     json.RawMessage `json:"data"`
	Files    json.RawMessage `json:"files"`
	Basepath string          `json:"basepath"`
	Expected *struct {
		Valid  bool              `json:"valid"`
		Errors []json.RawMessage `json:"errors"`
	} `json:"expected"`
	ExpectFailure *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		At      string `json:"at"`
	} `json:"expectFailure"`
}

// assertFailureWire checks a load or input failure: exit 2 and exactly
// {error, code, at} on stdout.
func assertFailureWire(t *testing.T, run cliRun, message, code, at string) {
	t.Helper()
	if run.exit != 2 {
		t.Fatalf("failure exit: want 2, got %d (stderr: %s)", run.exit, run.stderr)
	}
	var out map[string]any
	if err := json.Unmarshal(run.stdout, &out); err != nil {
		t.Fatalf("failure stdout not JSON: %q (%v)", run.stdout, err)
	}
	want := map[string]any{"error": message, "code": code, "at": at}
	if !reflect.DeepEqual(out, want) {
		t.Fatalf("failure stdout mismatch\n want: %v\n  got: %v", want, out)
	}
}

// cliBin is the compiled CLI built once in TestMain.
var cliBin string

func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "validate-model-cli")
	if err != nil {
		panic("mktemp: " + err.Error())
	}
	defer os.RemoveAll(dir)

	cliBin = filepath.Join(dir, "validate-model")
	// go build the current package (cmd/validate-model) into the temp binary.
	build := exec.Command("go", "build", "-o", cliBin, ".")
	build.Stderr = os.Stderr
	if err := build.Run(); err != nil {
		panic("go build cmd/validate-model: " + err.Error())
	}

	os.Exit(m.Run())
}

func loadCliCases(t *testing.T) []cliCase {
	t.Helper()
	// cmd/validate-model → repo root is four levels up.
	path := filepath.Join("..", "..", "..", "..", "tests", "fixtures", "validate", "cases.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("shared validate fixture not found at %s: %v", path, err)
	}
	var cases []cliCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("fixture json decode: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("fixture is empty")
	}
	return cases
}

type cliRun struct {
	exit   int
	stdout []byte
	stderr []byte
}

// runCli spawns the compiled CLI with the request on stdin (gateway protocol).
func runCli(t *testing.T, input []byte) cliRun {
	t.Helper()
	cmd := exec.Command(cliBin)
	cmd.Stdin = bytes.NewReader(input)
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	err := cmd.Run()
	exit := 0
	if err != nil {
		ee, ok := err.(*exec.ExitError)
		if !ok {
			t.Fatalf("CLI exec failed: %v", err)
		}
		exit = ee.ExitCode()
	}
	return cliRun{exit: exit, stdout: out.Bytes(), stderr: errBuf.Bytes()}
}

func requestOf(t *testing.T, c cliCase) []byte {
	t.Helper()
	data := c.Data
	if len(data) == 0 {
		data = json.RawMessage("{}")
	}
	files := c.Files
	if len(files) == 0 {
		files = json.RawMessage("{}")
	}
	req := map[string]json.RawMessage{
		"spec":  c.Spec,
		"data":  data,
		"files": files,
	}
	bp, _ := json.Marshal(c.Basepath)
	req["basepath"] = bp
	b, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	return b
}

// normalizeGeneric canonicalizes a decoded JSON tree (numbers float64, recurse).
func normalizeGeneric(v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, val := range x {
			out[k] = normalizeGeneric(val)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, val := range x {
			out[i] = normalizeGeneric(val)
		}
		return out
	default:
		return v
	}
}

func TestCliBoundaryMatchesFixture(t *testing.T) {
	for _, c := range loadCliCases(t) {
		c := c
		t.Run(c.Name, func(t *testing.T) {
			run := runCli(t, requestOf(t, c))

			if (c.Expected == nil) == (c.ExpectFailure == nil) {
				t.Fatalf("case %q must declare exactly one of expected or expectFailure", c.Name)
			}
			if c.ExpectFailure != nil {
				assertFailureWire(t, run, c.ExpectFailure.Message, c.ExpectFailure.Code, c.ExpectFailure.At)
				return
			}

			// Result case: exit 0, stdout exactly {valid, errors} == expected.
			if run.exit != 0 {
				t.Fatalf("result case exit: want 0, got %d (stderr: %s)", run.exit, run.stderr)
			}
			if c.Expected == nil {
				t.Fatalf("case %q has no expected result", c.Name)
			}
			var out map[string]any
			if err := json.Unmarshal(run.stdout, &out); err != nil {
				t.Fatalf("result stdout not JSON: %q (%v)", run.stdout, err)
			}
			if len(out) != 2 {
				t.Fatalf("stdout must carry exactly {valid, errors}, got keys %v", keysOf(out))
			}
			if _, ok := out["valid"]; !ok {
				t.Fatalf("stdout missing \"valid\": %s", run.stdout)
			}
			if _, ok := out["errors"]; !ok {
				t.Fatalf("stdout missing \"errors\": %s", run.stdout)
			}

			gotValid, _ := out["valid"].(bool)
			if gotValid != c.Expected.Valid {
				t.Errorf("valid mismatch: want %v, got %v (stdout: %s)", c.Expected.Valid, gotValid, run.stdout)
			}

			wantErrs := make([]any, len(c.Expected.Errors))
			for i, raw := range c.Expected.Errors {
				var m any
				if err := json.Unmarshal(raw, &m); err != nil {
					t.Fatalf("expected error decode: %v", err)
				}
				wantErrs[i] = normalizeGeneric(m)
			}
			gotErrsRaw, _ := out["errors"].([]any)
			gotErrs := make([]any, len(gotErrsRaw))
			for i, e := range gotErrsRaw {
				gotErrs[i] = normalizeGeneric(e)
			}
			if !reflect.DeepEqual(wantErrs, gotErrs) {
				t.Errorf("errors mismatch\n want: %v\n  got: %v", wantErrs, gotErrs)
			}
		})
	}
}

// listRequest builds a {"spec", "files", "basepath", "mode":"list"} request. A
// list carries no rows, so "data" is omitted (the list entry ignores it).
func listRequest(t *testing.T, specJSON string, files map[string]string) []byte {
	t.Helper()
	fm := map[string]json.RawMessage{}
	for k, v := range files {
		fm[k] = json.RawMessage(v)
	}
	fb, _ := json.Marshal(fm)
	req := map[string]json.RawMessage{
		"spec":     json.RawMessage(specJSON),
		"files":    fb,
		"basepath": json.RawMessage(`""`),
		"mode":     json.RawMessage(`"list"`),
	}
	b, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal list request: %v", err)
	}
	return b
}

// TestCliListModeCleanIsValid: mode:list over a clean list-spec returns the
// {valid:true, errors:[]} result shape (no rows → no DATA pass → no field errors),
// exit 0 — identical wire to a clean form result.
func TestCliListModeCleanIsValid(t *testing.T) {
	run := runCli(t, listRequest(t, `{"columns":{"name":{"field":".name","label":"Name"}}}`, nil))
	if run.exit != 0 {
		t.Fatalf("clean list exit: want 0, got %d (stderr: %s)", run.exit, run.stderr)
	}
	var out map[string]any
	if err := json.Unmarshal(run.stdout, &out); err != nil {
		t.Fatalf("list result stdout not JSON: %q (%v)", run.stdout, err)
	}
	if len(out) != 2 {
		t.Fatalf("list stdout must carry exactly {valid, errors}, got keys %v", keysOf(out))
	}
	if v, _ := out["valid"].(bool); !v {
		t.Fatalf("clean list must be valid:true, got %s", run.stdout)
	}
	errs, ok := out["errors"].([]any)
	if !ok || len(errs) != 0 {
		t.Fatalf("clean list must carry an empty errors array, got %s", run.stdout)
	}
}

// TestCliListModeForbiddenKeyLoadWire: mode:list over a list-spec carrying a §6
// forbidden meta key uses the same failure wire as the form path — exit 2,
// stdout exactly {error, code: FORBIDDEN_META_KEY, at}.
func TestCliListModeForbiddenKeyLoadWire(t *testing.T) {
	run := runCli(t, listRequest(t, `{"columns":{"name":{"field":".name"},"display_switch":{"field":".x"}}}`, nil))
	var out map[string]any
	if err := json.Unmarshal(run.stdout, &out); err != nil {
		t.Fatalf("failure stdout not JSON: %q (%v)", run.stdout, err)
	}
	message, _ := out["error"].(string)
	at, _ := out["at"].(string)
	if message == "" || at == "" {
		t.Fatalf("forbidden-key failure must name the key and its location: %s", run.stdout)
	}
	assertFailureWire(t, run, message, "FORBIDDEN_META_KEY", at)
}

// TestCliListModeUnresolvedRefLoadWire: an unresolved $ref in a list is a load
// failure (never a silent empty table) — exit 2, exactly {error, code, at}.
func TestCliListModeUnresolvedRefLoadWire(t *testing.T) {
	run := runCli(t, listRequest(t, `{"columns":{"$ref":"missing-columns.yml"}}`, nil))
	assertFailureWire(t, run, "$ref file not found: missing-columns.yml", "REF_FILE_NOT_FOUND", "missing-columns.yml")
}

// TestCliListModeRefResolvesAndScansClean: a list whose columns $ref points at a
// supplied clean file composes + scans clean through the CLI (compose reuse wire).
func TestCliListModeRefResolvesAndScansClean(t *testing.T) {
	run := runCli(t, listRequest(t,
		`{"columns":{"$ref":"base.yml","$patch":{"extra":{"field":".extra"}}}}`,
		map[string]string{"base.yml": `{"properties":{"id":{"field":".id"}}}`},
	))
	if run.exit != 0 {
		t.Fatalf("resolved-$ref list exit: want 0, got %d (stderr: %s)", run.exit, run.stderr)
	}
	var out map[string]any
	if err := json.Unmarshal(run.stdout, &out); err != nil {
		t.Fatalf("result stdout not JSON: %q (%v)", run.stdout, err)
	}
	if v, _ := out["valid"].(bool); !v {
		t.Fatalf("resolved+clean list must be valid:true, got %s", run.stdout)
	}
}

// modeRequest builds a {"spec", "files", "basepath", "mode"} request with a raw
// mode value, so non-string modes can be sent.
func modeRequest(t *testing.T, specJSON string, files map[string]string, rawMode string) []byte {
	t.Helper()
	fm := map[string]json.RawMessage{}
	for k, v := range files {
		fm[k] = json.RawMessage(v)
	}
	fb, _ := json.Marshal(fm)
	req := map[string]json.RawMessage{
		"spec":     json.RawMessage(specJSON),
		"files":    fb,
		"basepath": json.RawMessage(`""`),
		"mode":     json.RawMessage(rawMode),
	}
	b, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	return b
}

// TestCliDetailModeRefResolvesAndIsValid: mode:detail composes the fields map
// and returns exactly {valid:true, errors:[]} with exit 0.
func TestCliDetailModeRefResolvesAndIsValid(t *testing.T) {
	run := runCli(t, modeRequest(t,
		`{"fields":{"$ref":"base.yml","$patch":{"extra":{"field":".extra"}}}}`,
		map[string]string{"base.yml": `{"properties":{"name":{"field":".name"}}}`},
		`"detail"`,
	))
	if run.exit != 0 {
		t.Fatalf("detail exit: want 0, got %d (stdout: %s, stderr: %s)", run.exit, run.stdout, run.stderr)
	}
	var out map[string]any
	if err := json.Unmarshal(run.stdout, &out); err != nil {
		t.Fatalf("detail stdout not JSON: %q (%v)", run.stdout, err)
	}
	want := map[string]any{"valid": true, "errors": []any{}}
	if !reflect.DeepEqual(out, want) {
		t.Fatalf("detail stdout mismatch\n want: %v\n  got: %v", want, out)
	}
}

// TestCliDetailModeForbiddenKeyLoadWire: a forbidden key in a detail field is a
// load failure — exit 2, exactly {error, code, at}.
func TestCliDetailModeForbiddenKeyLoadWire(t *testing.T) {
	run := runCli(t, modeRequest(t, `{"fields":{"name":{"field":".name","show_if":".admin"}}}`, nil, `"detail"`))
	var out map[string]any
	if err := json.Unmarshal(run.stdout, &out); err != nil {
		t.Fatalf("failure stdout not JSON: %q (%v)", run.stdout, err)
	}
	message, _ := out["error"].(string)
	if message == "" {
		t.Fatalf("detail load failure must carry a message: %s", run.stdout)
	}
	assertFailureWire(t, run, message, "FORBIDDEN_META_KEY", "fields.name.show_if")
}

// TestCliRequestRules pins every shared request rule, in order: each failure
// exits 1 with stdout exactly {"error": <message>}. Several cases break more
// than one rule to pin that the earlier rule wins.
func TestCliRequestRules(t *testing.T) {
	const (
		spec = `{"properties":{"name":{"type":"text"}}}`
	)
	cases := []struct {
		name    string
		input   string
		message string
	}{
		{"empty stdin", ``, "Request must be valid JSON"},
		{"bad json", `{not json`, "Request must be valid JSON"},
		{"trailing garbage", `{"spec":{}} x`, "Request must be valid JSON"},
		{"array request", `[{"spec":{}}]`, "Request must be an object"},
		{"null request", `null`, "Request must be an object"},
		{"string request", `"spec"`, "Request must be an object"},
		{"no spec", `{"data":{}}`, "Request spec must be an object"},
		{"null spec", `{"spec":null}`, "Request spec must be an object"},
		{"array spec", `{"spec":[]}`, "Request spec must be an object"},
		{"no spec before bad mode", `{"mode":"grid"}`, "Request spec must be an object"},
		{"mode grid", `{"spec":` + spec + `,"mode":"grid"}`, "Unsupported validation mode"},
		{"mode empty string", `{"spec":` + spec + `,"mode":""}`, "Unsupported validation mode"},
		{"mode number", `{"spec":` + spec + `,"mode":1}`, "Unsupported validation mode"},
		{"mode null", `{"spec":` + spec + `,"mode":null}`, "Unsupported validation mode"},
		{"mode case", `{"spec":` + spec + `,"mode":"Form"}`, "Unsupported validation mode"},
		{"bad mode before bad files", `{"spec":` + spec + `,"mode":"grid","files":[]}`, "Unsupported validation mode"},
		{"files array", `{"spec":` + spec + `,"files":[]}`, "Request files must be an object"},
		{"files string", `{"spec":` + spec + `,"files":"x"}`, "Request files must be an object"},
		{"bad files before bad basepath", `{"spec":` + spec + `,"files":1,"basepath":1}`, "Request files must be an object"},
		{"files member string", `{"spec":` + spec + `,"files":{"a.yml":"x"}}`, "Request files must contain objects"},
		{"files member null", `{"spec":` + spec + `,"files":{"a.yml":null}}`, "Request files must contain objects"},
		{"bad file member before bad basepath", `{"spec":` + spec + `,"files":{"a.yml":[]},"basepath":1}`, "Request files must contain objects"},
		{"basepath number", `{"spec":` + spec + `,"basepath":1}`, "Request basepath must be a string"},
		{"basepath object", `{"spec":` + spec + `,"basepath":{}}`, "Request basepath must be a string"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			run := runCli(t, []byte(c.input))
			if run.exit != 1 {
				t.Fatalf("exit: want 1, got %d (stdout: %s, stderr: %s)", run.exit, run.stdout, run.stderr)
			}
			var out map[string]any
			if err := json.Unmarshal(run.stdout, &out); err != nil {
				t.Fatalf("stdout not JSON: %q (%v)", run.stdout, err)
			}
			want := map[string]any{"error": c.message}
			if !reflect.DeepEqual(out, want) {
				t.Fatalf("stdout mismatch\n want: %v\n  got: %v", want, out)
			}
		})
	}
}

// TestCliNullFilesAndBasepathMeanNone: null files and basepath are accepted as
// none and the request validates normally.
func TestCliNullFilesAndBasepathMeanNone(t *testing.T) {
	run := runCli(t, []byte(`{"spec":{"fields":{"name":{"field":".name"}}},"mode":"detail","files":null,"basepath":null}`))
	if run.exit != 0 {
		t.Fatalf("exit: want 0, got %d (stdout: %s)", run.exit, run.stdout)
	}
	var out map[string]any
	if err := json.Unmarshal(run.stdout, &out); err != nil {
		t.Fatalf("stdout not JSON: %q (%v)", run.stdout, err)
	}
	want := map[string]any{"valid": true, "errors": []any{}}
	if !reflect.DeepEqual(out, want) {
		t.Fatalf("stdout mismatch\n want: %v\n  got: %v", want, out)
	}
}

// TestCliFormDataRule: after the request rules, form data that is present and
// not an object (null included) is the exit-2 input failure; absent data is {}.
func TestCliFormDataRule(t *testing.T) {
	spec := `{"properties":{"name":{"type":"text"}}}`
	for _, data := range []string{`null`, `[]`, `"x"`, `1`} {
		t.Run(data, func(t *testing.T) {
			run := runCli(t, []byte(`{"spec":`+spec+`,"data":`+data+`}`))
			assertFailureWire(t, run, "Form data must be an object", "INVALID_FORM_INPUT", "")
		})
	}
	t.Run("absent", func(t *testing.T) {
		run := runCli(t, []byte(`{"spec":`+spec+`}`))
		if run.exit != 0 {
			t.Fatalf("absent data exit: want 0, got %d (stdout: %s)", run.exit, run.stdout)
		}
	})
	t.Run("list ignores data", func(t *testing.T) {
		run := runCli(t, []byte(`{"spec":{"columns":{"name":{"field":".name"}}},"mode":"list","data":null}`))
		if run.exit != 0 {
			t.Fatalf("list with null data exit: want 0, got %d (stdout: %s)", run.exit, run.stdout)
		}
	})
}

func keysOf(m map[string]any) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	return ks
}
