package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	generator "github.com/polyspec/crudui/packages/generator-go"
)

// ssrRequest reads an SSR frame response.
func ssrRequest(t *testing.T, host *httptest.Server, path string) (int, http.Header, string) {
	t.Helper()
	response, err := host.Client().Get(host.URL + path)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	return response.StatusCode, response.Header, string(body)
}

// ssrFailure asserts an SSR frame request fails with the given status and error.
func ssrFailure(t *testing.T, host *httptest.Server, path string, status int, message string) {
	t.Helper()
	actual, header, body := ssrRequest(t, host, path)
	decoded, err := decodeJSON([]byte(body))
	if err != nil {
		t.Fatalf("%s: %d %s: %v", path, actual, body, err)
	}
	result, ok := decoded.(*object)
	if actual != status || !ok || get(result, "error") != message || header.Get("Content-Type") != "application/json; charset=utf-8" {
		t.Errorf("%s: %d %s", path, actual, body)
	}
}

// testCommit is the commit of the source identity the test servers read.
const testCommit = "0123456789abcdef0123456789abcdef01234567"

func currentServer(t *testing.T) (server, *httptest.Server) {
	t.Helper()
	dataDir, specDir, sourceDir := t.TempDir(), t.TempDir(), t.TempDir()
	sourceFile := filepath.Join(sourceDir, "source.json")
	if err := os.WriteFile(sourceFile, []byte(`{"commit":"`+testCommit+`","changes":null}`), 0600); err != nil {
		t.Fatal(err)
	}
	for name, file := range map[string]string{
		"records.json":       filepath.Join("..", "..", "fixtures", "records.json"),
		"runtime-paths.json": filepath.Join("..", "..", "src", "runtime-paths.json"),
	} {
		contents, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(specDir, name), contents, 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, renderingPath := range matrixRenderingPaths(t) {
		for _, framework := range matrixFrameworks(t) {
			writeFrame(t, specDir, renderingPath, framework, testFrame)
		}
	}
	s, err := newServer(dataDir, specDir, sourceFile)
	if err != nil {
		t.Fatal(err)
	}
	return s, httptest.NewServer(s)
}

// testFrame stands in for a built frame document with one empty form view.
const testFrame = `<!doctype html><html><head><title>frame</title></head><body><main><div id="form-view"></div></main><script type="module" src="./frame.js"></script></body></html>`

// writeFrame stores a frame document where the SSR endpoint reads it.
func writeFrame(t *testing.T, specDir, renderingPath, framework, contents string) {
	t.Helper()
	directory := filepath.Join(specDir, "frames", renderingPath+"-"+framework)
	if err := os.MkdirAll(directory, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, "index.html"), []byte(contents), 0600); err != nil {
		t.Fatal(err)
	}
}

// matrixRenderingPaths returns the rendering paths of the browser matrix.
func matrixRenderingPaths(t *testing.T) []string {
	t.Helper()
	encoded, err := os.ReadFile(filepath.Join("..", "..", "src", "runtime-paths.json"))
	if err != nil {
		t.Fatal(err)
	}
	var matrix struct {
		RenderingPaths []string `json:"renderingPaths"`
	}
	if err := json.Unmarshal(encoded, &matrix); err != nil {
		t.Fatal(err)
	}
	return matrix.RenderingPaths
}

// matrixFrameworks returns the frameworks of the browser matrix.
func matrixFrameworks(t *testing.T) []string {
	t.Helper()
	encoded, err := os.ReadFile(filepath.Join("..", "..", "src", "runtime-paths.json"))
	if err != nil {
		t.Fatal(err)
	}
	var matrix struct {
		Frameworks []string `json:"frameworks"`
	}
	if err := json.Unmarshal(encoded, &matrix); err != nil {
		t.Fatal(err)
	}
	return matrix.Frameworks
}

func generationRequest(t *testing.T, client *http.Client, endpoint string, body *object) (int, *object) {
	t.Helper()
	encoded, err := encodeJSON(body)
	if err != nil {
		t.Fatal(err)
	}
	response, err := client.Post(endpoint, "application/json", bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	data, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := decodeJSON(data)
	if err != nil {
		t.Fatalf("response %d: %s: %v", response.StatusCode, data, err)
	}
	result, ok := decoded.(*object)
	if !ok {
		t.Fatalf("response is not an object: %s", data)
	}
	return response.StatusCode, result
}

func TestCompileAndRenderUseCachedStructure(t *testing.T) {
	s, host := currentServer(t)
	defer host.Close()
	schema := record("type", "group", "properties", record("name", record("type", "text", "label", "Name"), "notes", record("type", "textarea")))
	request := record("spec", record("type", "group", "properties", record("$ref", "field-schema.json")), "options", record("keyPrefix", "form", "files", record("field-schema.json", schema)))
	status, compiled := generationRequest(t, host.Client(), host.URL+"/api/compile/createForm/react", request)
	if status != 200 {
		t.Fatalf("compile: %d %#v", status, compiled)
	}
	provenance := get(compiled, "generator").(*object)
	identity, ok := get(provenance, "source").(*object)
	if get(provenance, "runtime") != "go" || !ok || strings.Join(identity.Keys(), ",") != "commit,changes" || get(identity, "commit") != testCommit || get(identity, "changes") != nil {
		t.Fatal("incorrect generation provenance")
	}
	if get(compiled, "referenceReads") != float64(1) {
		t.Fatalf("compile did not report actual reference reads: %#v", get(compiled, "referenceReads"))
	}
	status, direct := generationRequest(t, host.Client(), host.URL+"/api/compile/bindForm/react", record("spec", schema))
	if status != 200 || get(direct, "referenceReads") != float64(0) {
		t.Fatalf("inline compilation did not report zero actual reads: %d %#v", status, get(direct, "referenceReads"))
	}
	template := get(compiled, "template").(*object)
	if get(template, "kind") != "crudui/form-template" {
		t.Fatal("incorrect template kind")
	}
	before, err := encodeJSON(template)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(s.specDir); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Ada", "", "Grace", "Ada"} {
		status, rendered := generationRequest(t, host.Client(), host.URL+"/api/render/createForm/react", record("template", template, "data", record("name", name, "notes", "<notes> & text"), "options", record("idPrefix", "cached", "language", "en")))
		if status != 200 {
			t.Fatalf("render: %d %#v", status, rendered)
		}
		if get(get(rendered, "data").(*object), "name") != name {
			t.Fatal("render changed the record")
		}
		fields := get(rendered, "fields").([]any)
		attrs := get(get(fields[0].(*object), "widget").(*object), "attrs").(*object)
		if get(attrs, "name") != "form[name]" || get(attrs, "value") != name || get(attrs, "id") != "cached:name" {
			t.Fatal("bound control differs from supplied data or options")
		}
		if !strings.Contains(get(rendered, "html").(string), "&lt;notes&gt; &amp; text") {
			t.Fatal("rendered textarea is missing")
		}
		if get(rendered, "revision") != float64(0) {
			t.Fatal("new instance has an incorrect revision")
		}
		if get(get(rendered, "generator").(*object), "runtime") != "go" {
			t.Fatal("render provenance is missing")
		}
	}
	after, err := encodeJSON(template)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(before, after) {
		t.Fatal("data binding changed the cached template")
	}
	if _, err := os.Stat(s.specDir); !os.IsNotExist(err) {
		t.Fatal("render recreated the composition directory")
	}
}

func TestGenerationRejectsMalformedRequests(t *testing.T) {
	_, host := currentServer(t)
	defer host.Close()
	for _, item := range []struct {
		operation string
		body      *object
	}{
		{"compile", record("spec", record(), "options", []any{})},
		{"compile", record("spec", record("type", "group", "properties", record()), "options", record("files", []any{}))},
		{"render", record("template", record("kind", "wrong"), "data", record())},
		{"render", record("template", record(), "data", nil)},
		{"render", record("template", record(), "data", record(), "options", record("files", record()))},
	} {
		status, _ := generationRequest(t, host.Client(), host.URL+"/api/"+item.operation+"/createForm/react", item.body)
		if status != 400 {
			t.Errorf("%s accepted malformed input: %d", item.operation, status)
		}
	}
	response, err := host.Client().Get(host.URL + "/api/compile/createForm/react")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 405 || response.Header.Get("Allow") != "POST" {
		t.Fatal("compile accepted GET")
	}
	response, err = host.Client().Post(host.URL+"/api/compile/createForm/react", "text/plain", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 415 {
		t.Fatal("compile accepted a non-JSON request")
	}
}

func TestSSRUsesFrameworkStorageAndNormalSubmission(t *testing.T) {
	s, host := currentServer(t)
	defer host.Close()
	spec := record("type", "group", "properties", record("companies", record("type", "group", "multiple", true, "properties", record("name", record("type", "text", "validate", record("required", true))))),
		"buttons", []any{record("type", "submit", "name", "_form_complete", "value", "1")})
	encoded, err := encodeJSON(spec)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(s.specDir, "spec.json"), encoded, 0600); err != nil {
		t.Fatal(err)
	}
	for _, framework := range matrixFrameworks(t) {
		renderingPath := "createForm"
		repo := repository{filepath.Join(s.dataDir, "go-"+renderingPath+"-"+framework+".json"), filepath.Join(s.specDir, "records.json")}
		state, err := repo.fixture("default")
		if err != nil {
			t.Fatal(err)
		}
		get(state, "companies").([]any)[0].(*object).Set("name", framework+" <company> & co")
		data, err := encodeJSON(state)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(repo.file, data, 0600); err != nil {
			t.Fatal(err)
		}
		template, err := generator.CompileForm(spec, generator.CompileOptions{KeyPrefix: "form"})
		if err != nil {
			t.Fatal(err)
		}
		bound, err := loadData(state)
		if err != nil {
			t.Fatal(err)
		}
		form, err := generator.NewForm(template, bound, generator.BindOptions{Language: "en"})
		if err != nil {
			t.Fatal(err)
		}
		expectedMarkup, err := generator.RenderForm(form)
		if err != nil {
			t.Fatal(err)
		}
		expectedData, err := encodeJSON(form.GetData())
		if err != nil {
			t.Fatal(err)
		}
		status, header, markup := ssrRequest(t, host, "/api/ssr/"+renderingPath+"/"+framework+"?lang=en&server=go&initialization=ssr")
		if status != 200 || header.Get("Content-Type") != "text/html; charset=utf-8" || header.Get("Cache-Control") != "no-store" {
			t.Fatalf("SSR: %d %v %s", status, header, markup)
		}
		viewStart, viewEnd := `<div id="form-view">`, `</div></main>`
		if strings.Count(markup, `<html lang="en">`) != 1 || strings.Contains(markup, `<html>`) || strings.Count(markup, viewStart) != 1 || !strings.HasSuffix(markup, `</script></body></html>`) {
			t.Fatalf("SSR did not keep the frame document: %s", markup)
		}
		view := markup[strings.Index(markup, viewStart)+len(viewStart):]
		if !strings.Contains(view, viewEnd) || view[:strings.LastIndex(view, viewEnd)] != expectedMarkup || !strings.Contains(expectedMarkup, `name="form[companies][__0000000000001__][name]"`) {
			t.Fatalf("SSR form view differs from RenderForm: %s", markup)
		}
		scriptStart, scriptEnd := `<script type="application/json" id="crudui-ssr">`, `</script></body></html>`
		if strings.Count(markup, scriptStart) != 1 || !strings.Contains(markup, `<script type="module" src="./frame.js"></script>`+scriptStart) {
			t.Fatalf("SSR payload is not placed before the body end: %s", markup)
		}
		payload := markup[strings.Index(markup, scriptStart)+len(scriptStart) : len(markup)-len(scriptEnd)]
		preserved := strings.NewReplacer(`<html>`, `<html lang="en">`, `<div id="form-view"></div>`, viewStart+expectedMarkup+`</div>`, `</body>`, scriptStart+payload+`</script></body>`).Replace(testFrame)
		if markup != preserved {
			t.Fatalf("SSR changed the frame template beyond the three insertions: %s", markup)
		}
		if strings.ContainsAny(payload, "<>&") || !strings.Contains(payload, `\u003ccompany\u003e \u0026 co`) {
			t.Fatalf("SSR payload is not escaped for a script element: %s", payload)
		}
		decoded, err := decodeJSON([]byte(payload))
		if err != nil {
			t.Fatal(err)
		}
		ssr, ok := decoded.(*object)
		if !ok || strings.Join(ssr.Keys(), ",") != "data,generator" {
			t.Fatalf("SSR payload members: %s", payload)
		}
		actualData, err := encodeJSON(get(ssr, "data"))
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(actualData, expectedData) || valueAt(get(ssr, "data"), "companies.__0000000000001__.name") != framework+" <company> & co" {
			t.Fatalf("SSR payload data differs: %s", actualData)
		}
		provenance, ok := get(ssr, "generator").(*object)
		identity, identityOK := get(provenance, "source").(*object)
		if !ok || !identityOK || strings.Join(provenance.Keys(), ",") != "runtime,source" || get(provenance, "runtime") != "go" || get(identity, "commit") != testCommit {
			t.Fatalf("SSR payload generator differs: %s", payload)
		}
		formBody := fmt.Sprintf("form[companies][__0000000000001__][name]=%s+saved&_form_complete=1", framework)
		saved, err := host.Client().Post(host.URL+"/api/save/"+renderingPath+"/"+framework, "application/x-www-form-urlencoded", strings.NewReader(formBody))
		if err != nil {
			t.Fatal(err)
		}
		result, err := io.ReadAll(saved.Body)
		saved.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		if saved.StatusCode != 200 {
			t.Fatalf("native submit: %d %s", saved.StatusCode, result)
		}
		stored, err := readObject(repo.file)
		if err != nil {
			t.Fatal(err)
		}
		if get(get(stored, "companies").([]any)[0].(*object), "name") != framework+" saved" {
			t.Fatal("normal form submission did not update storage")
		}
	}
}

func TestRemovedModePathReturnsNotFound(t *testing.T) {
	_, host := currentServer(t)
	defer host.Close()
	response, err := host.Client().Get(host.URL + "/api/load/keyed/react")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("removed mode path returned %d", response.StatusCode)
	}
}

func TestSSRRejectsWrongParametersAndFrames(t *testing.T) {
	s, host := currentServer(t)
	defer host.Close()
	if err := os.WriteFile(filepath.Join(s.specDir, "spec.json"), []byte(`{"type":"group","properties":{"name":{"type":"text"}}}`), 0600); err != nil {
		t.Fatal(err)
	}
	const parameters = "Expected lang, server and initialization for this SSR frame"
	for _, query := range []string{
		"",
		"?language=en",
		"?server=go&initialization=ssr",
		"?lang=en&initialization=ssr",
		"?lang=en&server=go",
		"?lang=fr&server=go&initialization=ssr",
		"?lang=en&server=rust&initialization=ssr",
		"?lang=en&server=go&initialization=interactive",
		"?lang=en&lang=en&server=go&initialization=ssr",
		"?lang=en&server=go&initialization=ssr&initialization=ssr",
		"?lang=en&server=go&initialization=ssr&language=en",
		"?lang=en&server=go&initialization=ssr&extra",
		"?lang=%zz&server=go&initialization=ssr",
	} {
		ssrFailure(t, host, "/api/ssr/createForm/react"+query, 400, parameters)
	}
	const frame = "The frame document must contain one html start tag, one empty form view and one body end tag"
	valid := "?lang=ko&server=go&initialization=ssr"
	for _, contents := range []string{
		`<!doctype html><html lang="en"><body><div id="form-view"></div></body></html>`,
		`<!doctype html><html><html><body><div id="form-view"></div></body></html>`,
		`<!doctype html><html><body><main></main></body></html>`,
		`<!doctype html><html><body><div id="form-view"></div><div id="form-view"></div></body></html>`,
		`<!doctype html><html><body><div id="form-view"><p></p></div></body></html>`,
		`<!doctype html><html><body><div id="form-view"></div></html>`,
		`<!doctype html><html><body><div id="form-view"></div></body></body></html>`,
	} {
		writeFrame(t, s.specDir, "createForm", "react", contents)
		ssrFailure(t, host, "/api/ssr/createForm/react"+valid, 500, frame)
	}
	if err := os.RemoveAll(filepath.Join(s.specDir, "frames", "createForm-react")); err != nil {
		t.Fatal(err)
	}
	ssrFailure(t, host, "/api/ssr/createForm/react"+valid, 500, frame)
	writeFrame(t, s.specDir, "createForm", "react", testFrame)
	status, _, body := ssrRequest(t, host, "/api/ssr/createForm/react"+valid)
	if status != 200 || !strings.Contains(body, `<html lang="ko">`) || !strings.Contains(body, `<div id="form-view"><`) {
		t.Fatalf("restored frame: %d %s", status, body)
	}
	response, err := host.Client().Post(host.URL+"/api/ssr/createForm/react"+valid, "text/plain", strings.NewReader(""))
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 405 || response.Header.Get("Allow") != "GET" {
		t.Fatal("SSR accepted POST")
	}
}
