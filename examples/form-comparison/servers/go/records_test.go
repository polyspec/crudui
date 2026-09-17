package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// recordServer starts a server whose public directory holds the customer fixture and specs.
func recordServer(t *testing.T) (server, *httptest.Server) {
	t.Helper()
	s, host := currentServer(t)
	t.Cleanup(host.Close)
	for _, name := range []string{"customer-records.json", "customer-specs.json"} {
		contents, err := os.ReadFile(filepath.Join("..", "..", "fixtures", name))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(s.publicDir, name), contents, 0600); err != nil {
			t.Fatal(err)
		}
	}
	return s, host
}

// recordRequest sends one request and returns its status and decoded JSON object.
func recordRequest(t *testing.T, host *httptest.Server, method, path, contentType, body string) (int, *object) {
	t.Helper()
	request, err := http.NewRequest(method, host.URL+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	response, err := host.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var buffer bytes.Buffer
	if _, err := buffer.ReadFrom(response.Body); err != nil {
		t.Fatal(err)
	}
	value, err := decodeJSON(buffer.Bytes())
	result, ok := value.(*object)
	if err != nil || !ok || get(result, "server") != "go" || response.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("%s %s: %d %s", method, path, response.StatusCode, buffer.String())
	}
	return response.StatusCode, result
}

const savedForm = `{"form":{"id":"22","name":"Saved","status":"active","joined":"2027-01-02","score":" 1234567.5 ","relation":{"name":"R"},"markup":"<i>x</i>"}}`

func TestRecordStoreSeedsListsAndSaves(t *testing.T) {
	s, host := recordServer(t)
	status, page := recordRequest(t, host, "GET", "/api/records?page=3", "", "")
	if status != 200 || get(page, "total") != 45.0 || len(get(page, "records").([]any)) != 5 {
		t.Fatalf("page 3: %d %v", status, page.Keys())
	}
	if _, err := os.Stat(s.recordStore()); err != nil {
		t.Fatalf("the first read seeds the store: %v", err)
	}
	status, saved := recordRequest(t, host, "POST", "/api/records/22", "application/json", savedForm)
	stored := get(saved, "record").(*object)
	if status != 200 || get(stored, "score") != 1234567.5 || get(stored, "avatar") == nil || get(stored, "name") != "Saved" {
		t.Fatalf("save: %d", status)
	}
	contents, err := os.ReadFile(s.recordStore())
	if err != nil || !bytes.Contains(contents, []byte(`"score":1234567.5,`)) {
		t.Fatalf("the store writes the number as ECMAScript does: %s", contents)
	}
	status, invalid := recordRequest(t, host, "POST", "/api/records/22", "application/json", strings.Replace(savedForm, `"Saved"`, `""`, 1))
	if status != 422 || get(get(invalid, "validation").(*object), "valid") != false {
		t.Fatalf("invalid save: %d", status)
	}
	after, _ := os.ReadFile(s.recordStore())
	if !bytes.Equal(after, contents) {
		t.Fatal("an invalid save changed the store")
	}
	if status, _ := recordRequest(t, host, "POST", "/api/records/reset", "", ""); status != 200 {
		t.Fatalf("reset: %d", status)
	}
	if _, record := recordRequest(t, host, "GET", "/api/records/22", "", ""); get(get(record, "record").(*object), "name") == "Saved" {
		t.Fatal("reset kept the saved record")
	}
}

func TestRecordStoreKeepsAMalformedFile(t *testing.T) {
	s, host := recordServer(t)
	if err := os.WriteFile(s.recordStore(), []byte(`[{"id":"1"}]`), 0600); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/records?page=1", "/api/records/1"} {
		if status, _ := recordRequest(t, host, "GET", path, "", ""); status != 500 {
			t.Errorf("%s: %d", path, status)
		}
	}
	if contents, _ := os.ReadFile(s.recordStore()); string(contents) != `[{"id":"1"}]` {
		t.Fatalf("the malformed store was replaced: %s", contents)
	}
}

func TestRecordViewsCheckTheQuery(t *testing.T) {
	_, host := recordServer(t)
	query := "lang=en&server=go&framework=html&initialization=ssr&mode=bindForm&page=2"
	cases := map[string]int{
		"/api/records/view/list?" + query:                                                 200,
		"/api/records/view/form?id=22&" + query:                                           200,
		"/api/records/view/list?page=2&" + strings.TrimSuffix(query, "&page=2"):           400,
		"/api/records/view/detail?" + query:                                               400,
		"/api/records/view/detail?id=45&" + strings.Replace(query, "page=2", "page=4", 1): 404,
		"/api/records/view/detail?id=46&" + query:                                         404,
		"/api/records/view/table?" + query:                                                404,
		"/api/records/unknown/path":                                                       404,
	}
	for path, expected := range cases {
		status, body := recordRequest(t, host, "GET", path, "", "")
		if status != expected {
			t.Errorf("%s: %d", path, status)
		}
		if status == 200 && get(body, "view") == "form" &&
			!strings.HasPrefix(get(body, "html").(string), `<form id="record-form" method="post" action="/api/go/records/22" enctype="multipart/form-data">`) {
			t.Errorf("%s: form start", path)
		}
		if status == 200 && get(body, "view") == "list" && !strings.Contains(get(body, "html").(string), "/detail?id=21&amp;"+strings.ReplaceAll(query, "&", "&amp;")) {
			t.Errorf("%s: list links carry the selection", path)
		}
	}
}

func TestNumberTextMatchesECMAScript(t *testing.T) {
	for value, expected := range map[float64]string{0: "0", 42: "42", 1234567.5: "1234567.5", 1e21: "1e+21", 1e20: "100000000000000000000", 0.000001: "0.000001", 1e-7: "1e-7", -2.5e-8: "-2.5e-8"} {
		if actual := numberText(value); actual != expected {
			t.Errorf("%v: %s", value, actual)
		}
	}
}
