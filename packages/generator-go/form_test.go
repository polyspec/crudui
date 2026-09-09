package generator

import (
	"encoding/json"
	"reflect"
	"regexp"
	"strings"
	"testing"
)

func parseObject(t *testing.T, source string) *Object {
	t.Helper()
	v, e := DecodeJSON([]byte(source))
	if e != nil {
		t.Fatal(e)
	}
	o := object(v)
	if o == nil {
		t.Fatal("Expected object")
	}
	return o
}
func compile(t *testing.T, source string) *FormTemplate {
	t.Helper()
	v, e := CompileForm(parseObject(t, source), CompileOptions{KeyPrefix: "form"})
	if e != nil {
		t.Fatal(e)
	}
	return v
}
func encode(t *testing.T, v any) string {
	t.Helper()
	b, e := json.Marshal(v)
	if e != nil {
		t.Fatal(e)
	}
	return string(b)
}
func newForm(t *testing.T, template *FormTemplate, data *Object) *Form {
	t.Helper()
	f, e := NewForm(template, data, BindOptions{Language: "en"})
	if e != nil {
		t.Fatal(e)
	}
	return f
}

const companySpec = `{"type":"group","properties":{"companies":{"type":"group","multiple":{"copy":true,"sortable":true},"properties":{"name":{"type":"text","default":"New company"},"stores":{"type":"group","multiple":true,"properties":{"name":{"type":"text","default":"New store"},"active":{"type":"checkbox"}}}}}}}`

func companyData(t *testing.T) *Object {
	return parseObject(t, `{"companies":{"__0000000000005__":{"name":"Five","stores":{"__0000000000005__":{"name":"Store five","active":true}}},"__0000000000007__":{"name":"Seven","stores":{}},"__0000000000001__":{"name":"One","stores":{}}}}`)
}
func TestTemplateCacheAndDataReplacement(t *testing.T) {
	template := compile(t, companySpec)
	before := encode(t, template)
	var restored FormTemplate
	if e := json.Unmarshal([]byte(before), &restored); e != nil {
		t.Fatal(e)
	}
	data := companyData(t)
	initial := newForm(t, template, data)
	injected := newForm(t, &restored, NewObject("companies", NewObject()))
	if e := injected.SetData(data); e != nil {
		t.Fatal(e)
	}
	a, _ := RenderForm(initial)
	b, _ := RenderForm(injected)
	if a != b {
		t.Fatal("Initial data and later injection must produce identical raw HTML")
	}
	if encode(t, initial.GetData()) != encode(t, injected.GetData()) {
		t.Fatal("Submission data differs")
	}
	if e := injected.SetData(data); e != nil {
		t.Fatal(e)
	}
	again, _ := RenderForm(injected)
	if a != again {
		t.Fatal("Repeated injection changed HTML")
	}
	if e := injected.SetData(NewObject("companies", NewObject())); e != nil {
		t.Fatal(e)
	}
	if e := injected.SetData(data); e != nil {
		t.Fatal(e)
	}
	again, _ = RenderForm(injected)
	if a != again {
		t.Fatal("Restoring record changed HTML")
	}
	if before != encode(t, template) {
		t.Fatal("Template changed")
	}
}
func TestScopedRowsAndDocumentOrder(t *testing.T) {
	f := newForm(t, compile(t, companySpec), companyData(t))
	rows := object(read(f.GetData(), "companies"))
	if !reflect.DeepEqual(rows.Keys(), []string{"__0000000000005__", "__0000000000007__", "__0000000000001__"}) {
		t.Fatal(rows.Keys())
	}
	p := "companies.__0000000000005__.stores"
	k, e := f.AddRow(p, AddRowOptions{Key: "__abc0123456789__", AfterKey: "__0000000000005__", Value: NewObject("name", "Added")})
	if e != nil {
		t.Fatal(e)
	}
	if k != "__abc0123456789__" {
		t.Fatal(k)
	}
	data := f.GetData()
	if !reflect.DeepEqual(object(read(data, "companies")).Keys(), rows.Keys()) {
		t.Fatal("Nested addition changed company order")
	}
	if e = f.RekeyRow(p, k, "__0000000000042__"); e != nil {
		t.Fatal(e)
	}
	html, _ := RenderForm(f)
	if !strings.Contains(html, `name="form[companies][__0000000000005__][stores][__0000000000042__][name]"`) {
		t.Fatal("Rekey did not update descendant input names")
	}
	if !strings.Contains(html, `data-rule-name="companies[][stores][][name]"`) {
		t.Fatal("Rule path depends on row encoding")
	}
	if e = f.MoveRow("companies", "__0000000000001__", 0); e != nil {
		t.Fatal(e)
	}
	if object(read(f.GetData(), "companies")).Keys()[0] != "__0000000000001__" {
		t.Fatal("Move did not preserve requested order")
	}
}
func TestNestedCopyRegeneratesIdentities(t *testing.T) {
	f := newForm(t, compile(t, companySpec), companyData(t))
	key, e := f.CopyRow("companies", "__0000000000005__", AddRowOptions{Key: "__copy00000000__"})
	if e != nil {
		t.Fatal(e)
	}
	data := f.GetData()
	copied := read(read(data, "companies"), key)
	stores := object(read(copied, "stores"))
	if stores.Len() != 1 {
		t.Fatal("Copy lost nested rows")
	}
	newKey := stores.Keys()[0]
	if newKey == "__0000000000005__" || !regexp.MustCompile(`^__[a-f0-9]{13}__$`).MatchString(newKey) {
		t.Fatal(newKey)
	}
	if stringAt(read(stores, newKey), "name") != "Store five" {
		t.Fatal("Copy lost current values")
	}
	if original := object(getPath(data, "companies.__0000000000005__.stores")); !original.Has("__0000000000005__") {
		t.Fatal("Copy modified original row")
	}
}
func TestRejectedOperationsAreAtomic(t *testing.T) {
	f := newForm(t, compile(t, companySpec), companyData(t))
	before, fields, rev := encode(t, f.GetData()), encode(t, f.Fields()), f.Revision()
	operations := []func() error{func() error { _, e := f.AddRow("companies", AddRowOptions{Key: "__0000000000005__"}); return e }, func() error { _, e := f.AddRow("companies", AddRowOptions{Key: "5"}); return e }, func() error { _, e := f.AddRow("companies", AddRowOptions{Key: "new", AfterKey: "missing"}); return e }, func() error { return f.RemoveRow("companies", "missing") }, func() error { return f.MoveRow("companies", "__0000000000005__", 9) }, func() error { return f.RekeyRow("companies", "__0000000000005__", "__0000000000007__") }, func() error { return f.SetValue("companies", []any{}) }, func() error { return f.SetValue("__proto__.companies", NewObject()) }, func() error { _, e := f.AddRow("companies", AddRowOptions{ValueProvided: true, Value: nil}); return e }}
	for i, op := range operations {
		if e := op(); e == nil {
			t.Errorf("Operation %d unexpectedly succeeded", i)
		}
		if before != encode(t, f.GetData()) || fields != encode(t, f.Fields()) || rev != f.Revision() {
			t.Fatalf("Operation %d changed state after failure", i)
		}
	}
}
func TestEmptyMissingNullAndArrayValues(t *testing.T) {
	template := compile(t, `{"type":"group","properties":{"tags":{"type":"text","multiple":true,"default":"new"}}}`)
	empty := newForm(t, template, NewObject("tags", NewObject()))
	html, _ := RenderForm(empty)
	if !strings.Contains(html, `aria-label="+"`) || strings.Contains(html, `name="form[tags]`) {
		t.Fatal("Empty collection must retain only its add control")
	}
	missing := newForm(t, template, nil)
	if object(read(missing.GetData(), "tags")).Len() != 1 {
		t.Fatal("Missing collection must create one row")
	}
	if _, e := NewForm(template, NewObject("tags", nil), BindOptions{}); e == nil {
		t.Fatal("Null collection accepted")
	}
	if _, e := NewForm(template, NewObject("tags", []any{}), BindOptions{}); e == nil {
		t.Fatal("Array collection accepted")
	}
	if _, e := empty.AddRow("tags", AddRowOptions{Key: "null_row", ValueProvided: true, Value: nil}); e != nil {
		t.Fatal(e)
	}
	if v := getPath(empty.GetData(), "tags.null_row"); v != nil {
		t.Fatalf("Explicit null changed: %#v", v)
	}
	if e := empty.RemoveRow("tags", "null_row"); e != nil {
		t.Fatal(e)
	}
	if _, e := empty.AddRow("tags", AddRowOptions{Key: "new_row"}); e != nil {
		t.Fatal(e)
	}
	if v := getPath(empty.GetData(), "tags.new_row"); v != "new" {
		t.Fatal(v)
	}
}
func TestDetachedDataAndFields(t *testing.T) {
	f := newForm(t, compile(t, companySpec), companyData(t))
	before := encode(t, f.GetData())
	d := f.GetData()
	object(read(d, "companies")).Delete("__0000000000005__")
	if encode(t, f.GetData()) != before {
		t.Fatal("GetData exposes instance values")
	}
	fields := f.Fields()
	row := objectList(read(fields[0], "rows"))[0]
	child := objectList(read(row, "children"))[0]
	child.Set("path", "modified")
	if strings.Contains(encode(t, f.Fields()), "modified") {
		t.Fatal("Fields exposes nested model state")
	}
	template := f.Template()
	template.Fields[0].Spec.Set("type", "text")
	if stringAt(f.template.Fields[0].Spec, "type") != "group" {
		t.Fatal("Template exposes instance structure")
	}
}
func TestSequencesAndRandomKeys(t *testing.T) {
	for _, v := range []any{0, 42, "42", "0000000000042", uint64(9999999999999)} {
		k, e := SequenceRowKey(v)
		if e != nil || len(k) != 17 {
			t.Fatalf("%v: %s %v", v, k, e)
		}
	}
	for _, v := range []any{true, -1, 1.5, "", "1e2", "10000000000000", nil} {
		if _, e := SequenceRowKey(v); e == nil {
			t.Errorf("Invalid sequence accepted: %#v", v)
		}
	}
	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		k, e := CreateRowKey()
		if e != nil {
			t.Fatal(e)
		}
		if seen[k] || !regexp.MustCompile(`^__[a-f0-9]{13}__$`).MatchString(k) {
			t.Fatal(k)
		}
		seen[k] = true
	}
}
func TestMinimumAndMaximum(t *testing.T) {
	template := compile(t, `{"type":"group","properties":{"tags":{"type":"text","multiple":{"min":1,"max":2}}}}`)
	f := newForm(t, template, NewObject("tags", NewObject("one", "a")))
	if e := f.RemoveRow("tags", "one"); e == nil {
		t.Fatal("Minimum count ignored")
	}
	if _, e := f.AddRow("tags", AddRowOptions{Key: "two"}); e != nil {
		t.Fatal(e)
	}
	before := encode(t, f.GetData())
	if _, e := f.AddRow("tags", AddRowOptions{Key: "three"}); e == nil {
		t.Fatal("Maximum count ignored")
	}
	if encode(t, f.GetData()) != before {
		t.Fatal("Failed maximum check modified data")
	}
}
func TestNativeBindingLabelsAndSelections(t *testing.T) {
	template := compile(t, `{"type":"group","properties":{"active":{"type":"checkbox","label":"Active"},"memo":{"type":"textarea","label":"Memo","design":{"show":".active","wrapper":{"class":".active ? 'enabled' : 'disabled'"}}},"choices":{"type":"multichoice","label":"Choices","items":{"z":"Z","a":"A","q":"Q"}}}}`)
	data := NewObject("active", true, "memo", "hello <world>", "choices", []any{"q", "z"})
	f := newForm(t, template, data)
	html, _ := RenderForm(f)
	if !strings.Contains(html, `for="crudui:memo"`) || !strings.Contains(html, `name="form[choices][]"`) || strings.Count(html, `checked=""`) != 3 {
		t.Fatal(html)
	}
	if !strings.Contains(html, `hello &lt;world&gt;`) {
		t.Fatal("Textarea not escaped")
	}
	if e := f.SetValue("active", false); e != nil {
		t.Fatal(e)
	}
	html, _ = RenderForm(f)
	if !strings.Contains(html, `style="display:none"`) || !strings.Contains(html, `form-element-wrapper disabled`) {
		t.Fatal("Conditional display was not reevaluated")
	}
}

func TestExplicitEmptyPrefixOverridesTemplatePrefix(t *testing.T) {
	template := compile(t, `{"type":"group","properties":{"name":{"type":"text"}}}`)
	fields, e := BindForm(template, NewObject("name", "Ada"), BindOptions{KeyPrefix: "", KeyPrefixProvided: true})
	if e != nil {
		t.Fatal(e)
	}
	if name := stringAt(read(read(fields[0], "widget"), "attrs"), "name"); name != "name" {
		t.Fatal(name)
	}
	empty, e := CompileForm(parseObject(t, `{"type":"group","properties":{}}`), CompileOptions{KeyPrefix: "", KeyPrefixProvided: true})
	if e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(encode(t, empty), `"keyPrefix":""`) {
		t.Fatal("Explicit empty template prefix was omitted")
	}
	var restored FormTemplate
	if e = json.Unmarshal([]byte(encode(t, empty)), &restored); e != nil {
		t.Fatal(e)
	}
	if encode(t, empty) != encode(t, &restored) {
		t.Fatal("Template prefix changed after cache restoration")
	}
}
