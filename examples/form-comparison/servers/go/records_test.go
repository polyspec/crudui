package main

import (
	"bytes"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
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

const savedCompanies = `{"__0000000000002__":{"name":"C","stores":{"__00000000000a1__":{"name":"S","enabled":"","detail":"Hidden notes","title":{"ko":"K","en":"A"},"departments":{}}}},"__0000000000001__":{"name":"D","stores":{}}}`

const savedForm = `{"form":{"id":"22","name":"Saved","status":"active","joined":"2027-01-02","score":" 1234567.5 ","relation":{"name":"R"},"markup":"<i>x</i>","companies":` + savedCompanies + `}}`

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
	if companies, _ := encodeJSON(get(stored, "companies")); string(companies) != savedCompanies {
		t.Fatalf("save keeps the rows, their keys and order and the hidden notes: %s", companies)
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
	fixture, err := s.fixtureRecords()
	if err != nil {
		t.Fatal(err)
	}
	withoutCompanies := record()
	for _, name := range recordMembers[:len(recordMembers)-1] {
		withoutCompanies.Set(name, get(fixture[0].(*object), name))
	}
	missing, _ := encodeJSON(append([]any{withoutCompanies}, fixture[1:]...))
	for _, malformed := range []string{`[{"id":"1"}]`, string(missing)} {
		if err := os.WriteFile(s.recordStore(), []byte(malformed), 0600); err != nil {
			t.Fatal(err)
		}
		for _, request := range [][]string{{"GET", "/api/records?page=1", ""}, {"GET", "/api/records/1", ""},
			{"POST", "/api/records/1", "application/json"}} {
			body := strings.Replace(savedForm, `"id":"22"`, `"id":"1"`, 1)
			if status, _ := recordRequest(t, host, request[0], request[1], request[2], body); status != 500 {
				t.Errorf("%s %s: %d", request[0], request[1], status)
			}
		}
		if contents, _ := os.ReadFile(s.recordStore()); string(contents) != malformed {
			t.Fatalf("the malformed store was replaced: %s", contents)
		}
	}
	// Reset replaces a malformed store with the fixture.
	if status, _ := recordRequest(t, host, "POST", "/api/records/reset", "", ""); status != 200 {
		t.Fatalf("reset over a malformed store: %d", status)
	}
	stored, err := s.storedRecords()
	expected, _ := encodeJSON(fixture)
	if actual, _ := encodeJSON(stored); err != nil || !bytes.Equal(actual, expected) {
		t.Fatalf("reset did not restore the fixture: %v", err)
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

// shapeValue decodes JSON text for a shape test; parseNative builds the same objects.
func shapeValue(t *testing.T, text string) any {
	t.Helper()
	value, err := decodeJSON([]byte(text))
	if err != nil {
		t.Fatal(err)
	}
	return value
}

func TestShapedCompletesAbsentFields(t *testing.T) {
	// Form data leaves out a field that holds no value; the result has every member in shape
	// order and keeps the submitted row order and keys.
	submitted := `{"__0000000000002__":{"stores":{"__00000000000a1__":{"title":{"en":"A","ko":"K"},"detail":"Kept","name":"S"},` +
		`"__00000000000a2__":{"enabled":"1","departments":{"__00000000000b1__":{}}}},"name":"C"},"__0000000000001__":{}}`
	expected := `{"__0000000000002__":{"name":"C","stores":{"__00000000000a1__":{"name":"S","enabled":"","detail":"Kept","title":{"ko":"K","en":"A"},"departments":{}},` +
		`"__00000000000a2__":{"name":"","enabled":"1","detail":"","title":{"ko":"","en":""},"departments":{"__00000000000b1__":{"name":""}}}}},` +
		`"__0000000000001__":{"name":"","stores":{}}}`
	value, err := shaped(shapeValue(t, submitted), companiesShape, "companies")
	if err != nil {
		t.Fatal(err)
	}
	if encoded, _ := encodeJSON(value); string(encoded) != expected {
		t.Fatalf("completed companies: %s", encoded)
	}
	form, err := shaped(shapeValue(t, `{"id":"22"}`), formShape, "form")
	if err != nil {
		t.Fatal(err)
	}
	const completeForm = `{"id":"22","name":"","status":"","joined":"","score":"","relation":{"name":""},"markup":"","companies":{}}`
	if encoded, _ := encodeJSON(form); string(encoded) != completeForm {
		t.Fatalf("completed form: %s", encoded)
	}
	if _, err := shaped(shapeValue(t, `{"name":"N"}`), formShape, "form"); err == nil {
		t.Fatal("a form without id is rejected")
	}
	if value, err := shaped(shapeValue(t, `{}`), scenarioShape, "form"); err != nil || len(get(value.(*object), "companies").(*object).Keys()) != 0 {
		t.Fatalf("an absent collection has no rows: %v", err)
	}
}

func TestShapedRejectsCompanyShapes(t *testing.T) {
	store := func(members string) string {
		return `{"__0000000000001__":{"name":"C","stores":{"__0000000000002__":{` + members + `}}}}`
	}
	const complete = `"name":"S","enabled":"1","detail":"","title":{"ko":"","en":""},"departments":{}`
	cases := []struct{ name, companies string }{
		{"companies is text", `"x"`},
		{"companies is a list", `[]`},
		{"row key is not a row key", `{"first":{"name":"C","stores":{}}}`},
		{"row key has upper case letters", `{"__000000000000A__":{"name":"C","stores":{}}}`},
		{"row key is too short", `{"__000000000001__":{"name":"C","stores":{}}}`},
		{"row is text", `{"__0000000000001__":"C"}`},
		{"company has another member", `{"__0000000000001__":{"name":"C","stores":{},"extra":"x"}}`},
		{"stores is null", `{"__0000000000001__":{"name":"C","stores":null}}`},
		{"store has another member", store(complete + `,"extra":"x"`)},
		{"enabled is not a checkbox value", store(`"name":"S","enabled":"yes","detail":"","title":{"ko":"","en":""}`)},
		{"enabled is a number", store(`"name":"S","enabled":1,"detail":"","title":{"ko":"","en":""},"departments":{}`)},
		{"title language is missing", store(`"name":"S","enabled":"1","detail":"","title":{"ko":"x"},"departments":{}`)},
		{"title has another language", store(`"name":"S","enabled":"1","detail":"","title":{"ko":"","en":"","ja":""},"departments":{}`)},
		{"title is text", store(`"name":"S","enabled":"1","detail":"","title":"x","departments":{}`)},
		{"department name is a number", store(`"name":"S","enabled":"1","detail":"","title":{"ko":"","en":""},"departments":{"__0000000000003__":{"name":1}}`)},
		{"department name is null", store(`"name":"S","enabled":"1","detail":"","title":{"ko":"","en":""},"departments":{"__0000000000003__":{"name":null}}`)},
	}
	for _, item := range cases {
		_, err := shaped(shapeValue(t, item.companies), companiesShape, "companies")
		var known statusError
		if !errors.As(err, &known) || known.status != 400 {
			t.Errorf("%s: %v", item.name, err)
		}
	}
	if _, err := shaped(shapeValue(t, store(complete)), companiesShape, "companies"); err != nil {
		t.Fatalf("a complete store is accepted: %v", err)
	}
	for name, relation := range map[string]string{"relation misses name": `{}`, "relation has another member": `{"name":"R","extra":"x"}`} {
		if _, err := shaped(shapeValue(t, `{"id":"22","relation":`+relation+`}`), formShape, "form"); err == nil {
			t.Errorf("%s is accepted", name)
		}
	}
}

func TestStoredCompaniesAreComplete(t *testing.T) {
	const complete = `{"__0000000000001__":{"name":"C","stores":{"__0000000000002__":{"name":"S","enabled":"1","detail":"","title":{"ko":"","en":""},"departments":{}}}}}`
	if !completeCompanies(shapeValue(t, complete)) {
		t.Fatal("complete stored companies are accepted")
	}
	for name, companies := range map[string]string{
		"a store misses a member": `{"__0000000000001__":{"name":"C","stores":{"__0000000000002__":{"name":"S","enabled":"1","title":{"ko":"","en":""},"departments":{}}}}}`,
		"a company misses stores": `{"__0000000000001__":{"name":"C"}}`,
		"members out of order":    `{"__0000000000001__":{"stores":{},"name":"C"}}`,
		"a row key is invalid":    `{"first":{"name":"C","stores":{}}}`,
	} {
		if completeCompanies(shapeValue(t, companies)) {
			t.Errorf("%s is accepted", name)
		}
	}
}

func TestRecordStoreRejectsCompanyShapes(t *testing.T) {
	s, host := recordServer(t)
	recordRequest(t, host, "GET", "/api/records/22", "", "")
	before, _ := os.ReadFile(s.recordStore())
	for _, companies := range []string{`"x"`, `{"first":{"name":"C","stores":{}}}`} {
		body := strings.Replace(savedForm, savedCompanies, companies, 1)
		if status, _ := recordRequest(t, host, "POST", "/api/records/22", "application/json", body); status != 400 {
			t.Errorf("%s: %d", companies, status)
		}
	}
	native := url.Values{"form[id]": {"22"}, "form[name]": {"N"}, "form[status]": {"active"}, "form[joined]": {"2027-01-02"},
		"form[score]": {"1"}, "form[relation][name]": {"R"}, "form[markup]": {""}, "_form_complete": {"1"}}
	repeated := url.Values{}
	for name, values := range native {
		repeated[name] = values
	}
	repeated["form[name]"] = []string{"N", "M"}
	if status, _ := recordRequest(t, host, "POST", "/api/records/22", "application/x-www-form-urlencoded", repeated.Encode()); status != 400 {
		t.Errorf("a repeated native field: %d", status)
	}
	if after, _ := os.ReadFile(s.recordStore()); !bytes.Equal(before, after) {
		t.Fatal("a rejected save changed the store")
	}
	// A native form without companies rows posts no companies field and stores no rows.
	status, saved := recordRequest(t, host, "POST", "/api/records/22", "application/x-www-form-urlencoded", native.Encode())
	if companies, _ := encodeJSON(get(get(saved, "record").(*object), "companies")); status != 200 || string(companies) != "{}" {
		t.Fatalf("native save without companies: %d %s", status, companies)
	}
}

func TestBenchmarkUsesTheCompaniesShape(t *testing.T) {
	s, host := recordServer(t)
	specs, err := readObject(filepath.Join(s.publicDir, "customer-specs.json"))
	if err != nil {
		t.Fatal(err)
	}
	companies := get(get(get(specs, "form").(*object), "properties").(*object), "companies")
	encoded, err := encodeJSON(record("type", "group", "properties", record("companies", companies)))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(s.publicDir, "spec.json"), encoded, 0600); err != nil {
		t.Fatal(err)
	}
	const path = "/api/validate/createForm/html"
	status, completed := recordRequest(t, host, "POST", path, "application/x-www-form-urlencoded",
		"form[companies][__0000000000001__][name]=C&form[companies][__0000000000001__][stores][__0000000000002__][name]=S"+
			"&form[companies][__0000000000001__][stores][__0000000000002__][detail]=Kept"+
			"&form[companies][__0000000000001__][stores][__0000000000002__][title][ko]=K"+
			"&form[companies][__0000000000001__][stores][__0000000000002__][title][en]=E&_form_complete=1")
	normalized, _ := encodeJSON(get(completed, "normalized"))
	const expected = `{"companies":{"__0000000000001__":{"name":"C","stores":{"__0000000000002__":{"name":"S","enabled":"","detail":"Kept","title":{"ko":"K","en":"E"},"departments":{}}}}}}`
	if status != 200 || string(normalized) != expected {
		t.Fatalf("native completion: %d %s", status, normalized)
	}
	for name, companies := range map[string]string{
		"company has another member":  `{"__0000000000001__":{"name":"C","stores":{},"extra":"x"}}`,
		"company name is null":        `{"__0000000000001__":{"name":null,"stores":{}}}`,
		"row key is not a row key":    `{"first":{"name":"C","stores":{}}}`,
		"companies is a list of rows": `[]`,
	} {
		if status, _ := recordRequest(t, host, "POST", path, "application/json", `{"form":{"companies":`+companies+`}}`); status != 400 {
			t.Errorf("%s: %d", name, status)
		}
	}
	// JSON data of a newly added row completes as the native form does.
	status, completed = recordRequest(t, host, "POST", path, "application/json",
		`{"form":{"companies":{"__0000000000001__":{"name":"C","stores":{"__0000000000002__":{"name":"S","enabled":"1","departments":{"__0000000000003__":{}}}}}}}}`)
	normalized, _ = encodeJSON(get(completed, "normalized"))
	const added = `{"companies":{"__0000000000001__":{"name":"C","stores":{"__0000000000002__":{"name":"S","enabled":"1","detail":"","title":{"ko":"","en":""},"departments":{"__0000000000003__":{"name":""}}}}}}}`
	if status != 200 || string(normalized) != added {
		t.Fatalf("JSON completion: %d %s", status, normalized)
	}
	status, completed = recordRequest(t, host, "POST", path, "application/json", `{"form":{}}`)
	if normalized, _ = encodeJSON(get(completed, "normalized")); status != 200 || string(normalized) != `{"companies":{}}` {
		t.Errorf("an absent collection has no rows: %d %s", status, normalized)
	}
}
