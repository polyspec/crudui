package main

// Go v2 validate CLI — stdin/stdout BOUNDARY conformance.
//
// The ValidateJSON ENGINE is already pinned by
// validator/v2/validate/conformance_test.go. This test owns only the CLI wrapper
// boundary (cmd/validate-v2): serialization (stdin JSON → ValidateJSON → stdout
// {valid,errors}), exit code, and the Go-specific LOAD-failure wire. It does NOT
// re-verify rule semantics — it asserts the wrapper streams the engine result
// verbatim and routes a load failure onto the Go wire, never a valid:false
// masquerade.
//
// It builds the REAL binary (go build into a temp dir) and spawns it exactly as
// the cross-check gateway does: request piped on stdin, utf-8, cwd = package
// root. A wire regression (wrong exit, dropped field, LOAD leaking as valid) turns
// this red — exactly what the gateway hits at runtime.
//
// Go LOAD wire (mirrors JS/Rust on absence of "valid"; carries a trace): exit 1,
// stdout {error, code, trace}, NO "valid" key. A bad request: exit 1, {error}
// with no "code". Do not weaken assertions — the fixture is the JS reference
// engine's own output; the CLI must reproduce it verbatim on stdout.

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
	ExpectLoadError *struct {
		Code string `json:"code"`
	} `json:"expectLoadError"`
}

// cliBin is the compiled CLI built once in TestMain.
var cliBin string

func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "validate-v2-cli")
	if err != nil {
		panic("mktemp: " + err.Error())
	}
	defer os.RemoveAll(dir)

	cliBin = filepath.Join(dir, "validate-v2")
	// go build the current package (cmd/validate-v2) into the temp binary.
	build := exec.Command("go", "build", "-o", cliBin, ".")
	build.Stderr = os.Stderr
	if err := build.Run(); err != nil {
		panic("go build cmd/validate-v2: " + err.Error())
	}

	os.Exit(m.Run())
}

func loadCliCases(t *testing.T) []cliCase {
	t.Helper()
	// cmd/validate-v2 → repo root is four levels up.
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

			if c.ExpectLoadError != nil {
				// Go LOAD wire: exit 1, {error, code, trace}, NO "valid" key.
				if run.exit != 1 {
					t.Fatalf("LOAD case exit: want 1, got %d (stderr: %s)", run.exit, run.stderr)
				}
				var out map[string]any
				if err := json.Unmarshal(run.stdout, &out); err != nil {
					t.Fatalf("LOAD stdout not JSON: %q (%v)", run.stdout, err)
				}
				if _, hasValid := out["valid"]; hasValid {
					t.Fatalf("LOAD failure must not carry a \"valid\" key: %s", run.stdout)
				}
				if got, _ := out["code"].(string); got != c.ExpectLoadError.Code {
					t.Fatalf("LOAD code: want %s, got %v", c.ExpectLoadError.Code, out["code"])
				}
				if msg, _ := out["error"].(string); msg == "" {
					t.Fatalf("LOAD failure must carry a non-empty error message: %s", run.stdout)
				}
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
// forbidden meta key routes onto the SAME Go LOAD wire the form path uses — exit
// 1, stdout {error, code: FORBIDDEN_META_KEY, trace}, NO "valid" key.
func TestCliListModeForbiddenKeyLoadWire(t *testing.T) {
	run := runCli(t, listRequest(t, `{"columns":{"name":{"field":".name"},"display_switch":{"field":".x"}}}`, nil))
	if run.exit != 1 {
		t.Fatalf("forbidden-key list exit: want 1, got %d (stderr: %s)", run.exit, run.stderr)
	}
	var out map[string]any
	if err := json.Unmarshal(run.stdout, &out); err != nil {
		t.Fatalf("LOAD stdout not JSON: %q (%v)", run.stdout, err)
	}
	if _, hasValid := out["valid"]; hasValid {
		t.Fatalf("LOAD failure must not carry a \"valid\" key: %s", run.stdout)
	}
	if got, _ := out["code"].(string); got != "FORBIDDEN_META_KEY" {
		t.Fatalf("LOAD code: want FORBIDDEN_META_KEY, got %v", out["code"])
	}
	if msg, _ := out["error"].(string); msg == "" {
		t.Fatalf("LOAD failure must carry a non-empty error message: %s", run.stdout)
	}
	if _, hasTrace := out["trace"]; !hasTrace {
		t.Fatalf("LOAD failure must carry a trace: %s", run.stdout)
	}
}

// TestCliListModeUnresolvedRefLoadWire: an unresolved $ref in a list is a LOAD
// failure (never a silent empty table) — exit 1, {error, code, trace}, no "valid".
func TestCliListModeUnresolvedRefLoadWire(t *testing.T) {
	run := runCli(t, listRequest(t, `{"columns":{"$ref":"missing-columns.yml"}}`, nil))
	if run.exit != 1 {
		t.Fatalf("unresolved-$ref list exit: want 1, got %d (stderr: %s)", run.exit, run.stderr)
	}
	var out map[string]any
	if err := json.Unmarshal(run.stdout, &out); err != nil {
		t.Fatalf("LOAD stdout not JSON: %q (%v)", run.stdout, err)
	}
	if _, hasValid := out["valid"]; hasValid {
		t.Fatalf("LOAD failure must not carry a \"valid\" key: %s", run.stdout)
	}
	if got, _ := out["code"].(string); got != "REF_FILE_NOT_FOUND" {
		t.Fatalf("LOAD code: want REF_FILE_NOT_FOUND, got %v", out["code"])
	}
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

// TestCliUnknownModeIsBadRequest: an unknown mode is a bad request — exit 1,
// {error} with NO "code" (it is not a compose load failure), NO "valid".
func TestCliUnknownModeIsBadRequest(t *testing.T) {
	req := map[string]json.RawMessage{
		"spec": json.RawMessage(`{"columns":{"name":{"field":".name"}}}`),
		"mode": json.RawMessage(`"grid"`),
	}
	b, _ := json.Marshal(req)
	run := runCli(t, b)
	if run.exit != 1 {
		t.Fatalf("unknown mode exit: want 1, got %d (stderr: %s)", run.exit, run.stderr)
	}
	var out map[string]any
	if err := json.Unmarshal(run.stdout, &out); err != nil {
		t.Fatalf("unknown-mode stdout not JSON: %q (%v)", run.stdout, err)
	}
	if _, ok := out["error"]; !ok {
		t.Fatalf("unknown mode must carry an {error}: %s", run.stdout)
	}
	if _, ok := out["valid"]; ok {
		t.Fatalf("unknown mode must not carry \"valid\": %s", run.stdout)
	}
	if _, ok := out["code"]; ok {
		t.Fatalf("unknown mode is a bad request, not a compose load failure — must carry no \"code\": %s", run.stdout)
	}
}

func TestCliMalformedEmptyStdinExits1(t *testing.T) {
	run := runCli(t, []byte(""))
	if run.exit != 1 {
		t.Fatalf("empty stdin exit: want 1, got %d", run.exit)
	}
	var out map[string]any
	if err := json.Unmarshal(run.stdout, &out); err != nil {
		t.Fatalf("malformed stdout not JSON: %q", run.stdout)
	}
	if _, ok := out["error"]; !ok {
		t.Fatalf("malformed request must carry an {error}: %s", run.stdout)
	}
	if _, ok := out["valid"]; ok {
		t.Fatalf("malformed request must not carry \"valid\": %s", run.stdout)
	}
}

func TestCliMalformedBadJsonExits1(t *testing.T) {
	run := runCli(t, []byte("{not json"))
	if run.exit != 1 {
		t.Fatalf("bad JSON exit: want 1, got %d", run.exit)
	}
	var out map[string]any
	if err := json.Unmarshal(run.stdout, &out); err != nil {
		t.Fatalf("bad-JSON stdout not JSON: %q", run.stdout)
	}
	if _, ok := out["error"]; !ok {
		t.Fatalf("bad JSON must carry an {error}: %s", run.stdout)
	}
}

func keysOf(m map[string]any) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	return ks
}
