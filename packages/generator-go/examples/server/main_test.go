package main

import (
	"encoding/json"
	generator "github.com/crudui/crudui/packages/generator-go"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestServerGeneratesValidatesSavesAndReloadsBothTransports(t *testing.T) {
	raw, e := generator.DecodeJSON([]byte(specification))
	if e != nil {
		t.Fatal(e)
	}
	spec := raw.(*generator.Object)
	template, e := generator.CompileForm(spec, generator.CompileOptions{KeyPrefix: "profile"})
	if e != nil {
		t.Fatal(e)
	}
	s := &server{spec: spec, template: template, file: filepath.Join(t.TempDir(), "record.json")}
	requests := []struct{ body, contentType, name string }{{`{"name":"Ada","email":"ada@example.test"}`, "application/json", "Ada"}, {"profile%5Bname%5D=Grace&profile%5Bemail%5D=grace%40example.test", "application/x-www-form-urlencoded", "Grace"}}
	for _, input := range requests {
		r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(input.body))
		r.Header.Set("Content-Type", input.contentType)
		w := httptest.NewRecorder()
		s.form(w, r)
		if w.Code != http.StatusOK && w.Code != http.StatusSeeOther {
			t.Fatalf("Save failed: %d %s", w.Code, w.Body.String())
		}
		stored, e := os.ReadFile(s.file)
		if e != nil {
			t.Fatal(e)
		}
		var record map[string]any
		if e = json.Unmarshal(stored, &record); e != nil {
			t.Fatal(e)
		}
		if record["name"] != input.name {
			t.Fatal(record)
		}
		get := httptest.NewRecorder()
		s.form(get, httptest.NewRequest(http.MethodGet, "/", nil))
		if get.Code != http.StatusOK || !strings.Contains(get.Body.String(), `value="`+input.name+`"`) {
			t.Fatal("Saved data not rendered by Go", get.Body.String())
		}
	}
	before, e := os.ReadFile(s.file)
	if e != nil {
		t.Fatal(e)
	}
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"","email":"invalid"}`))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.form(w, r)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatal("Invalid data accepted", w.Code)
	}
	after, e := os.ReadFile(s.file)
	if e != nil {
		t.Fatal(e)
	}
	if string(before) != string(after) {
		t.Fatal("Invalid submission changed stored record")
	}
}
