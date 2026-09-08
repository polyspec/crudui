// The Go server parses, validates and persists the form comparison requests.
package main

import (
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/crudui/crudui/packages/validator-go/validator/validate"
)

var source, sourceCommit string
var route = regexp.MustCompile(`^/api/(load|save|validate|reset)/(corrected|original|original-keyed|keyed)/(react|vue|svelte)$`)

type server struct{ dataDir, specDir string }

func writeJSON(w http.ResponseWriter, status int, body *object) {
	body.Set("server", "go")
	encoded, err := encodeJSON(body)
	if err != nil {
		status = 500
		encoded = []byte(`{"error":"Cannot encode response","server":"go"}`)
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write(encoded)
}
func failure(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, record("error", err.Error()))
}

func repositoryFailure(w http.ResponseWriter, err error) {
	status := 500
	var input inputError
	if errors.As(err, &input) {
		status = 400
	}
	failure(w, status, err)
}

func valueAt(data any, path string) any {
	for _, part := range strings.Split(path, ".") {
		switch current := data.(type) {
		case *object:
			data = get(current, part)
		case []any:
			index, err := strconv.Atoi(part)
			if err != nil || index < 0 || index >= len(current) {
				return nil
			}
			data = current[index]
		default:
			return nil
		}
	}
	return data
}

func (s server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/api/health" {
		writeJSON(w, 200, record("status", "ok", "validatorSource", source, "commit", sourceCommit, "storage", "JSON files", "jsonProcessor", "ordered-json"))
		return
	}
	match := route.FindStringSubmatch(r.URL.Path)
	if match == nil {
		failure(w, 404, fmt.Errorf("Unknown endpoint"))
		return
	}
	action, mode, framework := match[1], match[2], match[3]
	revision := mode
	if mode == "original-keyed" {
		revision = "original"
	}
	if revision != source {
		failure(w, 404, fmt.Errorf("Incorrect validator source"))
		return
	}
	expected := "POST"
	if action == "load" {
		expected = "GET"
	}
	if r.Method != expected {
		failure(w, 405, fmt.Errorf("Method not allowed"))
		return
	}
	dataMode := "keyed"
	if mode == "original" {
		dataMode = "original"
	}
	repo := repository{filepath.Join(s.dataDir, "go-"+mode+"-"+framework+".json"), filepath.Join(s.specDir, "records.json")}
	var body []byte
	var err error
	if action != "load" {
		body, err = io.ReadAll(http.MaxBytesReader(w, r.Body, 2*1024*1024))
		if err != nil {
			failure(w, 413, err)
			return
		}
	}
	if action == "load" || action == "reset" {
		var state *object
		if action == "load" {
			state, err = repo.read()
		} else {
			kind, _, mediaErr := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if mediaErr != nil || kind != "multipart/form-data" && kind != "application/x-www-form-urlencoded" {
				failure(w, 415, fmt.Errorf("Expected a native form"))
				return
			}
			fields, parseErr := parseNative(body, r.Header.Get("Content-Type"))
			if parseErr != nil {
				failure(w, 400, parseErr)
				return
			}
			fixture := "default"
			if fields.Has("fixture") {
				var ok bool
				fixture, ok = get(fields, "fixture").(string)
				if !ok {
					failure(w, 400, fmt.Errorf("Expected fixture name"))
					return
				}
			}
			state, err = repo.reset(fixture)
		}
		if err != nil {
			repositoryFailure(w, err)
			return
		}
		data, err := loadData(state, dataMode)
		if err != nil {
			failure(w, 500, err)
			return
		}
		writeJSON(w, 200, record("storage", state, "data", data))
		return
	}
	kind, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil {
		failure(w, 415, err)
		return
	}
	var received *object
	switch kind {
	case "application/json":
		decoded, err := decodeJSON(body)
		if err != nil {
			failure(w, 400, err)
			return
		}
		root, ok := decoded.(*object)
		if !ok {
			failure(w, 400, fmt.Errorf("Expected request object"))
			return
		}
		received, ok = get(root, "form").(*object)
		if !ok {
			failure(w, 400, fmt.Errorf("Expected form object"))
			return
		}
		if err = checkJSONShape(received, dataMode); err != nil {
			failure(w, 400, err)
			return
		}
	case "application/x-www-form-urlencoded", "multipart/form-data":
		fields, err := parseNative(body, r.Header.Get("Content-Type"))
		if err != nil {
			failure(w, 400, err)
			return
		}
		if get(fields, "_form_complete") != "1" {
			failure(w, 400, fmt.Errorf("Incomplete native form submission"))
			return
		}
		received = record()
		if fields.Has("form") {
			var ok bool
			received, ok = get(fields, "form").(*object)
			if !ok {
				failure(w, 400, fmt.Errorf("Expected form object"))
				return
			}
		}
		if dataMode == "original" {
			if err = nativeArrays(received); err != nil {
				failure(w, 400, err)
				return
			}
		}
	default:
		failure(w, 415, fmt.Errorf("Expected a form or JSON request"))
		return
	}
	data, err := normalize(received, dataMode)
	if err != nil {
		failure(w, 400, err)
		return
	}
	spec, err := readObject(filepath.Join(s.specDir, "spec-"+dataMode+".json"))
	if err != nil {
		failure(w, 500, err)
		return
	}
	result, err := validate.Validate(spec, validatorData(data).(map[string]any), validate.Options{})
	if err != nil {
		failure(w, 500, err)
		return
	}
	errors := []any{}
	for _, item := range result.Errors {
		errors = append(errors, record("path", item.Path, "field", item.Field, "rule", item.Rule, "message", item.Message, "value", valueAt(data, item.Path)))
	}
	response := record("transport", kind, "jsonProcessor", "ordered-json", "validatorSource", source, "received", received, "normalized", data, "validation", record("valid", result.Valid, "errors", errors))
	if action == "validate" {
		writeJSON(w, 200, response)
		return
	}
	if !result.Valid {
		writeJSON(w, 422, response)
		return
	}
	saved, err := repo.save(data, dataMode)
	if err != nil {
		repositoryFailure(w, err)
		return
	}
	for _, key := range saved.Keys() {
		response.Set(key, get(saved, key))
	}
	writeJSON(w, 200, response)
}

func main() {
	if len(os.Args) != 4 || source == "" || sourceCommit == "" {
		log.Fatal("Expected compiled source metadata and arguments: address data-directory spec-directory")
	}
	log.Fatal(http.ListenAndServe(os.Args[1], server{os.Args[2], os.Args[3]}))
}
