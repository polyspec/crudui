package main

import (
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"

	generator "github.com/polyspec/crudui/packages/generator-go"
	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
)

// sourceIdentity reads, on every call, the identity of the repository tree the running build
// came from: its commit and the digest of its uncommitted changes, or null.
func (s server) sourceIdentity() (*object, error) {
	encoded, err := os.ReadFile(s.sourceFile)
	if err != nil {
		return nil, err
	}
	value, err := decodeJSON(encoded)
	if err != nil {
		return nil, err
	}
	identity, ok := value.(*object)
	if !ok || strings.Join(identity.Keys(), ",") != "commit,changes" {
		return nil, fmt.Errorf("Expected a source identity with commit and changes")
	}
	return identity, nil
}

// generationInfo identifies the Go generator and the source identity it serves.
func (s server) generationInfo() (*object, error) {
	identity, err := s.sourceIdentity()
	if err != nil {
		return nil, err
	}
	return record("runtime", "go", "source", identity), nil
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
func compileGeneration(request, options, provenance *object) (*object, error) {
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
	return record("template", value, "generator", provenance, "referenceReads", loader.reads), nil
}

// renderGeneration binds a submitted template without loading composition files.
func renderGeneration(request, options, provenance *object) (*object, error) {
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
	return record("data", form.GetData(), "fields", form.Fields(), "html", markup, "revision", form.Revision(), "generator", provenance), nil
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
		s.serveSSRFrame(w, r, renderingPath, framework)
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
	provenance, err := s.generationInfo()
	if err != nil {
		failure(w, http.StatusInternalServerError, err)
		return
	}
	var response *object
	if operation == "compile" {
		response, err = compileGeneration(request, options, provenance)
	} else {
		response, err = renderGeneration(request, options, provenance)
	}
	if err != nil {
		failure(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

// ssrParameters names the query parameters of an SSR frame request with their accepted values.
var ssrParameters = map[string][]string{"lang": {"ko", "en"}, "server": {"go"}, "initialization": {"ssr"}}

// ssrLanguage returns the frame language when the query holds exactly the SSR frame parameters.
func ssrLanguage(rawQuery string) (string, bool) {
	query, err := url.ParseQuery(rawQuery)
	if err != nil || len(query) != len(ssrParameters) {
		return "", false
	}
	for name, accepted := range ssrParameters {
		values, ok := query[name]
		if !ok || len(values) != 1 || !slices.Contains(accepted, values[0]) {
			return "", false
		}
	}
	return query.Get("lang"), true
}

// scriptJSON escapes the characters that could end or alter an inline script element.
var scriptJSON = strings.NewReplacer("<", `\u003c`, ">", `\u003e`, "&", `\u0026`)

// serveSSRFrame renders the framework's stored record into the built interactive frame document.
func (s server) serveSSRFrame(w http.ResponseWriter, r *http.Request, renderingPath, framework string) {
	language, ok := ssrLanguage(r.URL.RawQuery)
	if !ok {
		failure(w, http.StatusBadRequest, fmt.Errorf("Expected lang, server and initialization for this SSR frame"))
		return
	}
	const htmlStart, placeholder, bodyEnd = `<html>`, `<div id="form-view"></div>`, `</body>`
	frame, err := os.ReadFile(filepath.Join(s.specDir, "frames", renderingPath+"-"+framework, "index.html"))
	if err != nil || strings.Count(string(frame), htmlStart) != 1 || strings.Count(string(frame), placeholder) != 1 || strings.Count(string(frame), bodyEnd) != 1 {
		failure(w, http.StatusInternalServerError, fmt.Errorf("The frame document must contain one html start tag, one empty form view and one body end tag"))
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
	form, err := generator.NewForm(template, data, generator.BindOptions{Language: language})
	if err != nil {
		failure(w, http.StatusInternalServerError, err)
		return
	}
	markup, err := generator.RenderForm(form)
	if err != nil {
		failure(w, http.StatusInternalServerError, err)
		return
	}
	provenance, err := s.generationInfo()
	if err != nil {
		failure(w, http.StatusInternalServerError, err)
		return
	}
	payload, err := encodeJSON(record("data", form.GetData(), "generator", provenance))
	if err != nil {
		failure(w, http.StatusInternalServerError, err)
		return
	}
	// Each token occurs once, and the replacer never rescans the text it inserts.
	document := strings.NewReplacer(
		htmlStart, `<html lang="`+language+`">`,
		placeholder, `<div id="form-view">`+markup+`</div>`,
		bodyEnd, `<script type="application/json" id="crudui-ssr">`+scriptJSON.Replace(string(payload))+`</script>`+bodyEnd,
	).Replace(string(frame))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, document)
}
