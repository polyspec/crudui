package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"time"

	generator "github.com/polyspec/crudui/packages/generator-go"
	"github.com/polyspec/crudui/packages/validator-go/validator/validate"
)

const specification = `{"type":"group","properties":{"name":{"type":"text","label":{"en":"Name","ko":"이름"},"validate":{"required":true,"minlength":2}},"email":{"type":"email","label":{"en":"Email","ko":"이메일"},"validate":{"required":true,"email":true}}}}`

type server struct {
	spec     *generator.Object
	template *generator.FormTemplate
	file     string
	mu       sync.Mutex
}

func main() {
	address := flag.String("listen", "127.0.0.1:8087", "HTTP listen address")
	file := flag.String("data", "", "Explicit JSON record file path")
	flag.Parse()
	if *file == "" {
		log.Fatal("-data must specify the JSON record file")
	}
	decoded, e := generator.DecodeJSON([]byte(specification))
	if e != nil {
		log.Fatal(e)
	}
	spec := decoded.(*generator.Object)
	template, e := generator.CompileForm(spec, generator.CompileOptions{KeyPrefix: "profile"})
	if e != nil {
		log.Fatal(e)
	}
	app := &server{spec: spec, template: template, file: *file}
	mux := http.NewServeMux()
	mux.HandleFunc("/", app.form)
	mux.HandleFunc("/data", app.data)
	mux.HandleFunc("/template", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, http.StatusOK, template)
	})
	httpServer := &http.Server{Addr: *address, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	log.Printf("Go form example: http://%s", *address)
	log.Fatal(httpServer.ListenAndServe())
}
func (s *server) load() (*generator.Object, error) {
	b, e := os.ReadFile(s.file)
	if os.IsNotExist(e) {
		return generator.NewObject(), nil
	}
	if e != nil {
		return nil, e
	}
	v, e := generator.DecodeJSON(b)
	if e != nil {
		return nil, e
	}
	o, ok := v.(*generator.Object)
	if !ok {
		return nil, fmt.Errorf("Stored record must be an object")
	}
	return o, nil
}
func (s *server) save(data *generator.Object) error {
	b, e := json.MarshalIndent(data, "", "  ")
	if e != nil {
		return e
	}
	f, e := os.CreateTemp(filepath.Dir(s.file), "crudui-record-*.json")
	if e != nil {
		return e
	}
	name := f.Name()
	defer os.Remove(name)
	if _, e = f.Write(append(b, '\n')); e != nil {
		f.Close()
		return e
	}
	if e = f.Close(); e != nil {
		return e
	}
	return os.Rename(name, s.file)
}
func (s *server) form(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodGet:
		s.mu.Lock()
		data, e := s.load()
		s.mu.Unlock()
		if e != nil {
			http.Error(w, e.Error(), http.StatusInternalServerError)
			return
		}
		form, e := generator.NewForm(s.template, data, generator.BindOptions{Language: "en"})
		if e != nil {
			http.Error(w, e.Error(), http.StatusInternalServerError)
			return
		}
		html, e := generator.RenderForm(form)
		if e != nil {
			http.Error(w, e.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, `<!doctype html><html lang="en"><meta charset="utf-8"><title>CRUDUI Go form</title><style>body{max-width:42rem;margin:3rem auto;font-family:system-ui}input{padding:.6rem;width:95%}h6{font-size:1rem;margin-bottom:.5rem}button{margin-top:1rem;padding:.6rem}</style><h1>CRUDUI Go form</h1><form method="post">`+html+`<button type="submit">Save</button></form><p><a href="/data">Stored JSON</a> · <a href="/template">Compiled template</a></p></html>`)
	case http.MethodPost:
		s.submit(w, r)
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
func (s *server) data(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	data, e := s.load()
	if e != nil {
		http.Error(w, e.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, data)
}
func (s *server) submit(w http.ResponseWriter, r *http.Request) {
	body, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if e != nil {
		http.Error(w, e.Error(), http.StatusBadRequest)
		return
	}
	contentType, _, e := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if e != nil {
		http.Error(w, "Content-Type is required", http.StatusUnsupportedMediaType)
		return
	}
	var data *generator.Object
	switch contentType {
	case "application/json":
		value, err := generator.DecodeJSON(body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		data, _ = value.(*generator.Object)
		if data == nil {
			http.Error(w, "Record must be an object", http.StatusBadRequest)
			return
		}
	case "application/x-www-form-urlencoded":
		values, err := url.ParseQuery(string(body))
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		data = generator.NewObject()
		for _, name := range []string{"name", "email"} {
			input := "profile[" + name + "]"
			if values.Has(input) {
				if len(values[input]) != 1 {
					http.Error(w, "A field must have one value", http.StatusBadRequest)
					return
				}
				data.Set(name, values.Get(input))
			}
		}
	default:
		http.Error(w, "Use form or JSON content", http.StatusUnsupportedMediaType)
		return
	}
	encoded, e := json.Marshal(data)
	if e != nil {
		http.Error(w, e.Error(), http.StatusBadRequest)
		return
	}
	lookup := map[string]any{}
	if e = json.Unmarshal(encoded, &lookup); e != nil {
		http.Error(w, e.Error(), http.StatusBadRequest)
		return
	}
	result, e := validate.Validate(s.spec, lookup, validate.Options{})
	if e != nil {
		http.Error(w, e.Error(), http.StatusInternalServerError)
		return
	}
	if !result.Valid {
		writeJSON(w, http.StatusUnprocessableEntity, result)
		return
	}
	s.mu.Lock()
	e = s.save(data)
	s.mu.Unlock()
	if e != nil {
		http.Error(w, e.Error(), http.StatusInternalServerError)
		return
	}
	if contentType == "application/json" {
		writeJSON(w, http.StatusOK, data)
	} else {
		http.Redirect(w, r, "/", http.StatusSeeOther)
	}
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if e := enc.Encode(value); e != nil {
		log.Printf("JSON response failed: %v", e)
	}
}
