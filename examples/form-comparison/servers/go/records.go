package main

// The customer record resource of the canonical page (docs/spec/form-comparison.md, "Record
// resource"): one store file in the data directory, seeded from the fixture in the public
// directory, and list, detail, save, reset and SSR view routes.

import (
	"errors"
	"fmt"
	"io"
	"math"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode"

	generator "github.com/polyspec/crudui/packages/generator-go"
	"github.com/polyspec/crudui/packages/validator-go/validator/validate"
)

const recordsPerPage = 20

// recordMembers is the member order of a stored record; formMembers are the submitted members.
var (
	recordMembers = []string{"id", "name", "status", "joined", "score", "relation", "avatar", "markup"}
	formMembers   = []string{"id", "name", "status", "joined", "score", "relation", "markup"}
	positiveText  = regexp.MustCompile(`^[1-9][0-9]*$`)
	recordViews   = []string{"list", "detail", "form"}
	selectionKeys = []string{"lang", "server", "framework", "initialization", "mode", "page"}
	selectionSets = map[string][]string{
		"lang":           {"ko", "en"},
		"server":         {"go"},
		"framework":      {"html", "react", "vue", "svelte"},
		"initialization": {"ssr"},
		"mode":           {"bindForm", "createForm"},
	}
)

// statusError is a failure with its HTTP status.
type statusError struct {
	status  int
	message string
}

func (e statusError) Error() string { return e.message }

func fail(status int, message string) error { return statusError{status, message} }

func recordFailure(w http.ResponseWriter, err error) {
	var known statusError
	if errors.As(err, &known) {
		failure(w, known.status, err)
		return
	}
	failure(w, http.StatusInternalServerError, err)
}

func (s server) recordStore() string { return filepath.Join(s.dataDir, "records-go.json") }

// fixtureRecords reads the seeded records from the public directory.
func (s server) fixtureRecords() ([]any, error) {
	encoded, err := os.ReadFile(filepath.Join(s.publicDir, "customer-records.json"))
	if err != nil {
		return nil, err
	}
	value, err := decodeJSON(encoded)
	if err != nil {
		return nil, err
	}
	return checkRecords(value)
}

// checkRecords requires an array of records with the fixture's members, order and types.
func checkRecords(value any) ([]any, error) {
	records, ok := value.([]any)
	if !ok {
		return nil, fmt.Errorf("Expected a records array")
	}
	for _, item := range records {
		stored, ok := item.(*object)
		if !ok || !slices.Equal(stored.Keys(), recordMembers) {
			return nil, fmt.Errorf("Expected stored record members")
		}
		for _, name := range recordMembers {
			value := get(stored, name)
			switch name {
			case "score":
				_, ok = value.(float64)
			case "relation":
				var relation *object
				if relation, ok = value.(*object); ok {
					_, ok = get(relation, "name").(string)
					ok = ok && slices.Equal(relation.Keys(), []string{"name"})
				}
			default:
				_, ok = value.(string)
			}
			if !ok {
				return nil, fmt.Errorf("Expected stored record member: %s", name)
			}
		}
	}
	return records, nil
}

// storeTransaction runs operation on the stored records under the store lock.
func (s server) storeTransaction(operation func([]any) ([]any, any, error)) (any, error) {
	return lockedFile(s.recordStore(), func() (any, error) { return s.fixtureRecords() },
		func(value any) (any, any, error) {
			records, err := checkRecords(value)
			if err != nil {
				return nil, nil, err
			}
			return operation(records)
		})
}

func (s server) storedRecords() ([]any, error) {
	result, err := s.storeTransaction(func(records []any) ([]any, any, error) { return records, records, nil })
	if err != nil {
		return nil, err
	}
	return result.([]any), nil
}

func recordIndex(records []any, id string) int {
	return slices.IndexFunc(records, func(item any) bool { return get(item.(*object), "id") == id })
}

// pageOf returns the records of one page, or 404 beyond the last page.
func pageOf(records []any, text string) (int, []any, error) {
	last := max(1, (len(records)+recordsPerPage-1)/recordsPerPage)
	page, err := strconv.Atoi(text)
	if err != nil || page < 1 || page > last {
		return 0, nil, fail(http.StatusNotFound, "Page not found")
	}
	first := (page - 1) * recordsPerPage
	return page, records[first:min(first+recordsPerPage, len(records))], nil
}

func (s server) serveRecords(w http.ResponseWriter, r *http.Request) {
	// Path segments are compared as written, without percent-decoding.
	path := r.URL.EscapedPath()
	allowed := []string{http.MethodGet}
	switch {
	case path == "/api/records":
	case path == "/api/records/reset":
		allowed = []string{http.MethodPost}
	case strings.HasPrefix(path, "/api/records/view/"):
	case strings.Count(path, "/") == 3 && path != "/api/records/":
		allowed = []string{http.MethodGet, http.MethodPost}
	default:
		failure(w, http.StatusNotFound, fmt.Errorf("Unknown endpoint"))
		return
	}
	if !slices.Contains(allowed, r.Method) {
		w.Header().Set("Allow", strings.Join(allowed, ", "))
		failure(w, http.StatusMethodNotAllowed, fmt.Errorf("Method not allowed"))
		return
	}
	var response *object
	var err error
	switch {
	case path == "/api/records":
		response, err = s.listRecords(r.URL.RawQuery)
	case path == "/api/records/reset":
		response, err = s.resetRecords(r)
	case strings.HasPrefix(path, "/api/records/view/"):
		response, err = s.recordView(strings.TrimPrefix(path, "/api/records/view/"), r.URL.RawQuery)
	case r.Method == http.MethodGet:
		response, err = s.recordByID(strings.TrimPrefix(path, "/api/records/"))
	default:
		response, err = s.saveRecord(w, r, strings.TrimPrefix(path, "/api/records/"))
	}
	if err != nil {
		recordFailure(w, err)
		return
	}
	status := http.StatusOK
	if validation, ok := get(response, "validation").(*object); ok && get(validation, "valid") == false {
		status = http.StatusUnprocessableEntity
	}
	writeJSON(w, status, response)
}

func (s server) listRecords(rawQuery string) (*object, error) {
	query, err := url.ParseQuery(rawQuery)
	if err != nil || len(query) != 1 || len(query["page"]) != 1 || !positiveText.MatchString(query.Get("page")) {
		return nil, fail(http.StatusBadRequest, "Expected one page parameter")
	}
	records, err := s.storedRecords()
	if err != nil {
		return nil, err
	}
	page, items, err := pageOf(records, query.Get("page"))
	if err != nil {
		return nil, err
	}
	return record("page", page, "perPage", recordsPerPage, "total", len(records), "records", items), nil
}

func (s server) recordByID(id string) (*object, error) {
	records, err := s.storedRecords()
	if err != nil {
		return nil, err
	}
	index := recordIndex(records, id)
	if index < 0 {
		return nil, fail(http.StatusNotFound, "Record not found")
	}
	return record("record", records[index]), nil
}

func (s server) resetRecords(r *http.Request) (*object, error) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1))
	if err != nil || len(body) != 0 || r.ContentLength > 0 {
		return nil, fail(http.StatusBadRequest, "Reset takes no request body")
	}
	fixture, err := s.fixtureRecords()
	if err != nil {
		return nil, err
	}
	if _, err = s.storeTransaction(func([]any) ([]any, any, error) { return fixture, nil, nil }); err != nil {
		return nil, err
	}
	return record("total", len(fixture)), nil
}

// submittedForm reads the submitted form object of a native or JSON save request.
func submittedForm(w http.ResponseWriter, r *http.Request) (*object, error) {
	kind, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	native := kind == "multipart/form-data" || kind == "application/x-www-form-urlencoded"
	if err != nil || !native && kind != "application/json" {
		return nil, fail(http.StatusUnsupportedMediaType, "Expected a form or JSON request")
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 2*1024*1024))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		return nil, fail(http.StatusRequestEntityTooLarge, "Request body exceeds 2 MiB")
	}
	if err != nil {
		return nil, fail(http.StatusBadRequest, err.Error())
	}
	var root *object
	expected := []string{"form"}
	if native {
		root, err = parseNative(body, r.Header.Get("Content-Type"))
		expected = []string{"form", "_form_complete"}
	} else {
		var value any
		value, err = decodeJSON(body)
		root, _ = value.(*object)
	}
	if err != nil || root == nil {
		return nil, fail(http.StatusBadRequest, "Expected a form request object")
	}
	if native && get(root, "_form_complete") != "1" {
		return nil, fail(http.StatusBadRequest, "Incomplete native form submission")
	}
	if !sameMembers(root.Keys(), expected) {
		return nil, fail(http.StatusBadRequest, "Expected only the form submission fields")
	}
	form, ok := get(root, "form").(*object)
	if !ok || !sameMembers(form.Keys(), formMembers) {
		return nil, fail(http.StatusBadRequest, "Expected the record form members")
	}
	for _, name := range formMembers {
		value := get(form, name)
		if name == "relation" {
			relation, ok := value.(*object)
			if !ok || !sameMembers(relation.Keys(), []string{"name"}) {
				return nil, fail(http.StatusBadRequest, "Expected the relation name member")
			}
			value = get(relation, "name")
		}
		if _, ok := value.(string); !ok {
			return nil, fail(http.StatusBadRequest, "Expected text member: "+name)
		}
	}
	return form, nil
}

func sameMembers(keys, expected []string) bool {
	return len(keys) == len(expected) && !slices.ContainsFunc(keys, func(key string) bool { return !slices.Contains(expected, key) })
}

func (s server) recordSpec(name string) (*object, error) {
	specs, err := readObject(filepath.Join(s.publicDir, "customer-specs.json"))
	if err != nil {
		return nil, err
	}
	spec, ok := get(specs, name).(*object)
	if !ok {
		return nil, fmt.Errorf("Expected the %s specification", name)
	}
	return spec, nil
}

func (s server) saveRecord(w http.ResponseWriter, r *http.Request, id string) (*object, error) {
	records, err := s.storedRecords()
	if err != nil {
		return nil, err
	}
	if recordIndex(records, id) < 0 {
		return nil, fail(http.StatusNotFound, "Record not found")
	}
	form, err := submittedForm(w, r)
	if err != nil {
		return nil, err
	}
	if get(form, "id") != id {
		return nil, fail(http.StatusBadRequest, "The submitted id differs from the record id")
	}
	spec, err := s.recordSpec("form")
	if err != nil {
		return nil, err
	}
	result, err := validate.Validate(spec, validatorData(form), validate.Options{})
	if err != nil {
		return nil, err
	}
	errorList := []any{}
	for _, item := range result.Errors {
		errorList = append(errorList, record("path", item.Path, "field", item.Field, "rule", item.Rule, "message", item.Message, "value", item.Value))
	}
	validation := record("valid", result.Valid, "errors", errorList)
	if !result.Valid {
		return record("validation", validation), nil
	}
	score, err := strconv.ParseFloat(strings.TrimFunc(get(form, "score").(string), func(r rune) bool { return unicode.Is(unicode.White_Space, r) }), 64)
	if err != nil && !errors.Is(err, strconv.ErrRange) || math.IsInf(score, 0) {
		return nil, fail(http.StatusBadRequest, "Expected a finite score")
	}
	saved, err := s.storeTransaction(func(records []any) ([]any, any, error) {
		index := recordIndex(records, id)
		if index < 0 {
			return nil, nil, fail(http.StatusNotFound, "Record not found")
		}
		previous := records[index].(*object)
		next := record()
		for _, name := range recordMembers {
			value := get(form, name)
			switch name {
			case "id", "avatar":
				value = get(previous, name)
			case "score":
				value = score
			case "relation":
				value = record("name", get(get(form, "relation").(*object), "name"))
			}
			next.Set(name, value)
		}
		changed := slices.Clone(records)
		changed[index] = next
		return changed, next, nil
	})
	if err != nil {
		return nil, err
	}
	return record("record", saved, "validation", validation), nil
}

// viewQuery reads the selection of an SSR view request: id first for detail and form, then the
// selection members in order, each once.
func viewQuery(view, rawQuery string) (map[string]string, error) {
	keys := selectionKeys
	if view != "list" {
		keys = append([]string{"id"}, selectionKeys...)
	}
	pairs := strings.Split(rawQuery, "&")
	if rawQuery == "" || len(pairs) != len(keys) {
		return nil, fail(http.StatusBadRequest, "Expected the view selection query")
	}
	values := map[string]string{}
	for index, pair := range pairs {
		rawName, rawValue, _ := strings.Cut(pair, "=")
		name, nameErr := url.QueryUnescape(rawName)
		value, valueErr := url.QueryUnescape(rawValue)
		accepted, listed := selectionSets[name]
		valid := nameErr == nil && valueErr == nil && name == keys[index]
		if listed {
			valid = valid && slices.Contains(accepted, value)
		} else {
			valid = valid && positiveText.MatchString(value)
		}
		if !valid {
			return nil, fail(http.StatusBadRequest, "Expected the view selection query")
		}
		values[name] = value
	}
	return values, nil
}

// selectionText is the selection query every generated link carries.
func selectionText(values map[string]string) string {
	parts := make([]string, len(selectionKeys))
	for index, name := range selectionKeys {
		parts[index] = url.QueryEscape(name) + "=" + url.QueryEscape(values[name])
	}
	return strings.Join(parts, "&")
}

// appendHref appends the selection query to the link format at the given member path.
func appendHref(spec *object, query string, path ...string) error {
	current := spec
	for _, name := range path {
		next, ok := get(current, name).(*object)
		if !ok {
			return fmt.Errorf("Expected specification member: %s", name)
		}
		current = next
	}
	href, ok := get(current, "href").(string)
	if !ok {
		return fmt.Errorf("Expected a link format")
	}
	current.Set("href", href+"&"+query)
	return nil
}

// formText is the form data of one stored record: every member as text, without the avatar.
func formText(stored *object) *object {
	relation := get(stored, "relation").(*object)
	return record("id", get(stored, "id"), "name", get(stored, "name"), "status", get(stored, "status"),
		"joined", get(stored, "joined"), "score", numberText(get(stored, "score").(float64)),
		"relation", record("name", get(relation, "name")), "markup", get(stored, "markup"))
}

func (s server) recordView(view, rawQuery string) (*object, error) {
	if !slices.Contains(recordViews, view) {
		return nil, fail(http.StatusNotFound, "View not found")
	}
	values, err := viewQuery(view, rawQuery)
	if err != nil {
		return nil, err
	}
	records, err := s.storedRecords()
	if err != nil {
		return nil, err
	}
	page, items, err := pageOf(records, values["page"])
	if err != nil {
		return nil, err
	}
	var stored *object
	if view != "list" {
		index := recordIndex(records, values["id"])
		if index < 0 {
			return nil, fail(http.StatusNotFound, "Record not found")
		}
		stored = records[index].(*object)
	}
	spec, err := s.recordSpec(view)
	if err != nil {
		return nil, err
	}
	language, query := values["lang"], selectionText(values)
	var html string
	var data *object
	switch view {
	case "list":
		if err = appendHref(spec, query, "columns", "name", "format"); err != nil {
			return nil, err
		}
		rows := make([]*generator.Object, len(items))
		for index, item := range items {
			rows[index] = item.(*object)
		}
		html, err = generator.RenderList(spec, rows, generator.ListOptions{Language: language, Layout: "table", Page: page, Total: len(records)})
		data = record("page", page, "perPage", recordsPerPage, "total", len(records), "records", items)
	case "detail":
		if err = appendHref(spec, query, "fields", "id", "format"); err != nil {
			return nil, err
		}
		html, err = generator.RenderDetail(spec, stored, generator.DetailOptions{Language: language})
		data = record("record", stored)
	default:
		var template *generator.FormTemplate
		template, err = generator.CompileForm(spec, generator.CompileOptions{KeyPrefix: "form", KeyPrefixProvided: true})
		if err != nil {
			return nil, err
		}
		var form *generator.Form
		form, err = generator.NewForm(template, formText(stored), generator.BindOptions{Language: language})
		if err != nil {
			return nil, err
		}
		html, err = generator.RenderForm(form)
		html = `<form id="record-form" method="post" action="/api/go/records/` + values["id"] +
			`" enctype="multipart/form-data">` + html + `</form>`
		data = record("record", stored)
	}
	if err != nil {
		return nil, err
	}
	return record("view", view, "html", html, "data", data), nil
}
