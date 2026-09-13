package main

import (
	"encoding/json"
	"fmt"
	"html"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"regexp"

	generator "github.com/polyspec/crudui/packages/generator-go"
	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
)

var generationRoute = regexp.MustCompile(`^/api/(compile|render|ssr)/(bindForm|createForm)/(react|vue|svelte)$`)

// generationInfo identifies the library compiled into the Go HTTP process.
func generationInfo() *object {
	return record("runtime", "go", "commit", sourceCommit)
}

// generationStrings reads optional string settings from the request options.
func generationStrings(options *object, names ...string) (map[string]string, error) {
	values := make(map[string]string, len(names))
	for _, name := range names {
		if !options.Has(name) {
			continue
		}
		value, ok := get(options, name).(string)
		if !ok {
			return nil, fmt.Errorf("Expected string option: %s", name)
		}
		values[name] = value
	}
	return values, nil
}

// countingLoader records actual compiler reads while delegating composition.
type countingLoader struct {
	loader compose.FileLoader
	reads  int
}

func (loader *countingLoader) Normalize(path, basepath string) string {
	return loader.loader.Normalize(path, basepath)
}

func (loader *countingLoader) Load(path string) (*compose.OMap, error) {
	loader.reads++
	return loader.loader.Load(path)
}

// compileGeneration prepares serializable structure without record data.
func compileGeneration(request, options *object) (*object, error) {
	spec, ok := get(request, "spec").(*object)
	if !ok {
		return nil, fmt.Errorf("Expected specification object")
	}
	values, err := generationStrings(options, "keyPrefix", "basepath")
	if err != nil {
		return nil, err
	}
	settings := generator.CompileOptions{KeyPrefix: values["keyPrefix"], KeyPrefixProvided: options.Has("keyPrefix"), Basepath: values["basepath"]}
	if options.Has("files") {
		files, ok := get(options, "files").(*object)
		if !ok {
			return nil, fmt.Errorf("Expected composition files object")
		}
		settings.Files = make(map[string]*generator.Object, len(files.Keys()))
		for _, name := range files.Keys() {
			file, ok := get(files, name).(*object)
			if !ok {
				return nil, fmt.Errorf("Expected composition file object: %s", name)
			}
			settings.Files[name] = file
		}
	}
	loader := &countingLoader{loader: compose.NewMemoryLoader(settings.Files)}
	settings.Loader = loader
	template, err := generator.CompileForm(spec, settings)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(template)
	if err != nil {
		return nil, err
	}
	value, err := decodeJSON(encoded)
	if err != nil {
		return nil, err
	}
	return record("template", value, "generator", generationInfo(), "referenceReads", loader.reads), nil
}

// renderGeneration binds a submitted template without loading composition files.
func renderGeneration(request, options *object) (*object, error) {
	structure, ok := get(request, "template").(*object)
	if !ok {
		return nil, fmt.Errorf("Expected template object")
	}
	data, ok := get(request, "data").(*object)
	if !ok {
		return nil, fmt.Errorf("Expected data object")
	}
	for _, key := range []string{"files", "loader", "basepath"} {
		if options.Has(key) {
			return nil, fmt.Errorf("Composition option is not valid for rendering: %s", key)
		}
	}
	values, err := generationStrings(options, "idPrefix", "language", "keyPrefix", "unsupported")
	if err != nil {
		return nil, err
	}
	encoded, err := encodeJSON(structure)
	if err != nil {
		return nil, err
	}
	var template generator.FormTemplate
	if err := json.Unmarshal(encoded, &template); err != nil {
		return nil, err
	}
	// An absent option is nil so the generator applies its default.
	option := func(name string) any {
		if options.Has(name) {
			return values[name]
		}
		return nil
	}
	form, err := generator.NewForm(&template, data, generator.BindOptions{IDPrefix: option("idPrefix"), Language: option("language"), KeyPrefix: option("keyPrefix"), Unsupported: option("unsupported")})
	if err != nil {
		return nil, err
	}
	markup, err := generator.RenderForm(form)
	if err != nil {
		return nil, err
	}
	return record("data", form.GetData(), "fields", form.Fields(), "html", markup, "revision", form.Revision(), "generator", generationInfo()), nil
}

// serveGeneration handles the current compilation, binding and server HTML endpoints.
func (s server) serveGeneration(w http.ResponseWriter, r *http.Request, operation, renderingPath, framework string) {
	method := http.MethodPost
	if operation == "ssr" {
		method = http.MethodGet
	}
	if r.Method != method {
		w.Header().Set("Allow", method)
		failure(w, http.StatusMethodNotAllowed, fmt.Errorf("Method not allowed"))
		return
	}
	if operation == "ssr" {
		s.serveGeneratedDocument(w, r, renderingPath, framework)
		return
	}
	kind, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || kind != "application/json" {
		failure(w, http.StatusUnsupportedMediaType, fmt.Errorf("Expected a JSON generation request"))
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 2*1024*1024))
	if err != nil {
		failure(w, http.StatusRequestEntityTooLarge, err)
		return
	}
	value, err := decodeJSON(body)
	if err != nil {
		failure(w, http.StatusBadRequest, err)
		return
	}
	request, ok := value.(*object)
	if !ok {
		failure(w, http.StatusBadRequest, fmt.Errorf("Expected request object"))
		return
	}
	options := record()
	if request.Has("options") {
		options, ok = get(request, "options").(*object)
		if !ok {
			failure(w, http.StatusBadRequest, fmt.Errorf("Expected options object"))
			return
		}
	}
	var response *object
	if operation == "compile" {
		response, err = compileGeneration(request, options)
	} else {
		response, err = renderGeneration(request, options)
	}
	if err != nil {
		failure(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

// serveGeneratedDocument renders the framework's stored record as a normal form.
func (s server) serveGeneratedDocument(w http.ResponseWriter, r *http.Request, renderingPath, framework string) {
	language := r.URL.Query().Get("language")
	if language == "" {
		language = "ko"
	}
	if language != "ko" && language != "en" {
		failure(w, http.StatusBadRequest, fmt.Errorf("Expected language ko or en"))
		return
	}
	spec, err := readObject(filepath.Join(s.specDir, "spec.json"))
	if err != nil {
		failure(w, http.StatusInternalServerError, err)
		return
	}
	template, err := generator.CompileForm(spec, generator.CompileOptions{KeyPrefix: "form"})
	if err != nil {
		failure(w, http.StatusInternalServerError, err)
		return
	}
	repo := repository{filepath.Join(s.dataDir, "go-"+renderingPath+"-"+framework+".json"), filepath.Join(s.specDir, "records.json")}
	state, err := repo.read()
	if err != nil {
		repositoryFailure(w, err)
		return
	}
	data, err := loadData(state)
	if err != nil {
		failure(w, http.StatusInternalServerError, err)
		return
	}
	form, err := generator.NewForm(template, data, generator.BindOptions{IDPrefix: "crudui", Language: language})
	if err != nil {
		failure(w, http.StatusInternalServerError, err)
		return
	}
	markup, err := generator.RenderForm(form)
	if err != nil {
		failure(w, http.StatusInternalServerError, err)
		return
	}
	interactive := "Open interactive form"
	if language == "ko" {
		interactive = "입력 화면 열기"
	}
	document := fmt.Sprintf(`<!doctype html><html lang="%s" data-language="%s"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CRUDUI</title><link rel="stylesheet" href="/crudui.css"><link rel="stylesheet" href="/comparison.css"></head><body class="frame"><header><h1>CRUDUI</h1><a href="/frames/%s-%s/?server=go&amp;lang=%s&amp;initialization=data">%s</a></header><form id="form" method="post" action="/api/go/save/%s/%s" data-generator-runtime="go" data-generator-commit="%s"><div id="view">%s</div></form></body></html>`, language, language, renderingPath, framework, language, interactive, renderingPath, framework, html.EscapeString(sourceCommit), markup)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, document)
}
