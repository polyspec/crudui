package generator

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/polyspec/crudui/packages/validator/go/validator/compose"
)

// normalizeScript prints the normalized layout of each HTML text of a request, using the shared normalizer of the
// form-render suite; it runs under node with the tsx loader from the repository root.
const normalizeScript = `import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const request = JSON.parse(readFileSync(0, 'utf8'));
const { normalizeHtml } = await import(pathToFileURL(request.module).href);
process.stdout.write(JSON.stringify(request.html.map((html) => normalizeHtml(html))));`

// TestFormRenderSuite runs every case of the shared form-render suite through the Go generator. A result case
// compiles, binds and renders, and its HTML is compared with the recorded HTML as the normalized layout of
// tests/fixtures/form-render/normalize.mts, as the Rust, PHP and Python runners do; a failure case must raise the
// recorded code.
func TestFormRenderSuite(t *testing.T) {
	repository, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}
	source, err := os.ReadFile(filepath.Join(repository, "tests/fixtures/form-render/cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	v, err := DecodeJSON(source)
	if err != nil {
		t.Fatal(err)
	}
	cases, ok := v.([]any)
	if !ok {
		t.Fatal("the form-render cases must be a list")
	}
	var results, failures []*Object
	for _, raw := range cases {
		c := object(raw)
		if c == nil {
			t.Fatal("a form-render case must be an object")
		}
		switch {
		case has(c, "expectError"):
			failures = append(failures, c)
		case has(c, "expected_html"):
			results = append(results, c)
		default:
			t.Fatalf("form-render case %s records neither a result nor a failure", stringAt(c, "name"))
		}
	}
	if len(results) != 137 || len(failures) != 51 {
		t.Fatalf("form-render has %d result and %d failure cases, want 137 and 51", len(results), len(failures))
	}

	actual := make([]string, len(results))
	renderErrors := make([]error, len(results))
	for i, c := range results {
		actual[i], renderErrors[i] = renderFormCase(c)
	}
	expected := make([]string, len(results))
	for i, c := range results {
		expected[i] = stringAt(c, "expected_html")
	}
	normalized := normalizeLayouts(t, repository, append(append([]string{}, actual...), expected...))
	half := len(results)
	for i, c := range results {
		t.Run(stringAt(c, "name"), func(t *testing.T) {
			if renderErrors[i] != nil {
				t.Fatalf("render failed: %v", renderErrors[i])
			}
			if normalized[i] != normalized[half+i] {
				t.Fatalf("layout differs %s", firstDifference(normalized[i], normalized[half+i]))
			}
		})
	}
	for _, c := range failures {
		t.Run(stringAt(c, "name"), func(t *testing.T) {
			want := stringAt(object(read(c, "expectError")), "code")
			_, err := renderFormCase(c)
			if err == nil {
				t.Fatalf("want the error %s, but the case rendered", want)
			}
			if got := failureCode(err); got != want {
				t.Fatalf("code %s, want %s: %v", got, want, err)
			}
		})
	}
}

// renderFormCase compiles, binds and renders one case with the options of the case; a second instance over the same
// template and data must render the same form.
func renderFormCase(c *Object) (string, error) {
	options := object(read(c, "options"))
	if has(c, "data") && object(read(c, "data")) == nil {
		return "", fmt.Errorf("case data must be an object")
	}
	basepath, err := caseText(options, "basepath")
	if err != nil {
		return "", err
	}
	keyPrefix, err := caseText(options, "keyPrefix")
	if err != nil {
		return "", err
	}
	files := map[string]*Object{}
	if f := object(optionValue(options, "files")); f != nil {
		for _, name := range f.Keys() {
			files[name] = object(read(f, name))
		}
	}
	template, err := CompileForm(object(read(c, "spec")), CompileOptions{Files: files, Basepath: basepath, KeyPrefix: keyPrefix, KeyPrefixProvided: options != nil && options.Has("keyPrefix")})
	if err != nil {
		return "", err
	}
	bind := BindOptions{IDPrefix: optionValue(options, "idPrefix"), Language: optionValue(options, "language"), KeyPrefix: optionValue(options, "keyPrefix"), Unsupported: optionValue(options, "unsupported")}
	form, err := NewForm(template, object(read(c, "data")), bind)
	if err != nil {
		return "", err
	}
	html, err := RenderForm(form, nil)
	if err != nil {
		return "", err
	}
	again, err := NewForm(template, object(read(c, "data")), bind)
	if err != nil {
		return "", err
	}
	repeat, err := RenderForm(again, nil)
	if err != nil {
		return "", err
	}
	if repeat != html {
		return "", fmt.Errorf("a new instance over the same template and data renders a different form")
	}
	return html, nil
}

// optionValue returns the value of a member of a case option object, nil when the member is absent.
func optionValue(options *Object, key string) any {
	if options == nil {
		return nil
	}
	v, _ := options.Get(key)
	return v
}

// caseText reads a text option of a case; an absent option is "", and any other type is an error.
func caseText(options *Object, key string) (string, error) {
	v := optionValue(options, key)
	if v == nil {
		return "", nil
	}
	s, ok := v.(string)
	if !ok {
		return "", fmt.Errorf("%s must be a string", key)
	}
	return s, nil
}

// failureCode is the code of a generation failure, as the native program reports it: the code of a composition or an
// unsupported field, and INVALID_FORM_INPUT for every other input error.
func failureCode(err error) string {
	code := "INVALID_FORM_INPUT"
	var loadErr *compose.ComposeLoadError
	if errors.As(err, &loadErr) {
		code = string(loadErr.Code)
	}
	var fieldErr *UnsupportedFieldTypeError
	if errors.As(err, &fieldErr) {
		code = fieldErr.Code()
	}
	return code
}

// normalizeLayouts returns the normalized layout of each HTML text, in order.
func normalizeLayouts(t *testing.T, repository string, htmls []string) []string {
	t.Helper()
	request, err := json.Marshal(map[string]any{"module": filepath.Join(repository, "tests/fixtures/form-render/normalize.mts"), "html": htmls})
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("node", "--import", "tsx/esm", "--input-type=module", "-e", normalizeScript)
	cmd.Dir = repository
	cmd.Stdin = bytes.NewReader(request)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		t.Fatalf("the shared normalizer failed: %v: %s", err, stderr.String())
	}
	var out []string
	if err := json.Unmarshal(stdout.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out) != len(htmls) {
		t.Fatalf("the shared normalizer returned %d layouts for %d texts", len(out), len(htmls))
	}
	return out
}

// firstDifference describes the first byte where two layouts differ, with the text around it.
func firstDifference(got, want string) string {
	i := 0
	for i < len(got) && i < len(want) && got[i] == want[i] {
		i++
	}
	return fmt.Sprintf("at byte %d: got %q, want %q", i, around(got, i), around(want, i))
}

func around(s string, i int) string {
	start, end := max(0, i-60), min(len(s), i+60)
	return s[start:end]
}
