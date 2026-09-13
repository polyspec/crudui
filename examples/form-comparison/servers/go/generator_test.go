package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func currentServer(t *testing.T) (server, *httptest.Server) {
	t.Helper()
	previousSource, previousCommit := source, sourceCommit
	source, sourceCommit = "current", "current-library-test"
	t.Cleanup(func() { source, sourceCommit = previousSource, previousCommit })
	s := server{dataDir: t.TempDir(), specDir: t.TempDir()}
	fixture, err := os.ReadFile(filepath.Join("..", "..", "fixtures", "records.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(s.specDir, "records.json"), fixture, 0600); err != nil {
		t.Fatal(err)
	}
	return s, httptest.NewServer(s)
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
	if get(provenance, "runtime") != "go" || get(provenance, "commit") != sourceCommit {
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
	for _, framework := range []string{"react", "vue", "svelte"} {
		renderingPath := "createForm"
		repo := repository{filepath.Join(s.dataDir, "go-"+renderingPath+"-"+framework+".json"), filepath.Join(s.specDir, "records.json")}
		state, err := repo.fixture("default")
		if err != nil {
			t.Fatal(err)
		}
		get(state, "companies").([]any)[0].(*object).Set("name", framework+" company")
		data, err := encodeJSON(state)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(repo.file, data, 0600); err != nil {
			t.Fatal(err)
		}
		response, err := host.Client().Get(host.URL + "/api/ssr/" + renderingPath + "/" + framework + "?language=en")
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		if response.StatusCode != 200 || response.Header.Get("Content-Type") != "text/html; charset=utf-8" {
			t.Fatalf("SSR: %d %s", response.StatusCode, body)
		}
		markup := string(body)
		for _, expected := range []string{`name="form[companies][__0000000000001__][name]"`, `value="` + framework + ` company"`, `action="/api/go/save/createForm/` + framework + `"`, `name="_form_complete" value="1"`, `/frames/createForm-` + framework + `/?server=go&amp;lang=en`, `data-generator-commit="current-library-test"`} {
			if !strings.Contains(markup, expected) {
				t.Errorf("SSR omitted %q", expected)
			}
		}
		if strings.Contains(markup, `type="hidden"`) || strings.Contains(markup, "<script") {
			t.Fatal("SSR requires scripts or hidden controls")
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
