package generator

import (
	"strings"
	"testing"
)

func TestListInputRulesInOrder(t *testing.T) {
	spec := NewObject("columns", NewObject("v", NewObject("field", ".v")))
	rows := []*Object{NewObject("v", 1)}
	cases := []struct {
		name    string
		spec    *Object
		rows    []*Object
		options ListOptions
		want    string
	}{
		{"spec before rows", nil, []*Object{nil}, ListOptions{Layout: 5}, "List specification must be an object"},
		{"row before options", spec, []*Object{nil}, ListOptions{Data: []any{}}, "List rows must be objects"},
		{"data array", spec, rows, ListOptions{Data: []any{}, PageMeta: []any{}}, "List context must be an object"},
		{"data string", spec, rows, ListOptions{Data: "s"}, "List context must be an object"},
		{"page meta array", spec, rows, ListOptions{PageMeta: []any{}, Layout: "grid"}, "List page metadata must be an object"},
		{"layout string", spec, rows, ListOptions{Layout: "grid"}, "List layout must be table or card"},
		{"layout number", spec, rows, ListOptions{Layout: 5}, "List layout must be table or card"},
		{"layout empty", spec, rows, ListOptions{Layout: ""}, "List layout must be table or card"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := RenderList(c.spec, c.rows, c.options)
			if err == nil || err.Error() != c.want {
				t.Fatalf("got %v, want %s", err, c.want)
			}
		})
	}
	var nilObject *Object
	for _, options := range []ListOptions{{}, {Data: nilObject, PageMeta: nilObject}, {Data: NewObject(), Layout: "table"}} {
		html, err := RenderList(spec, rows, options)
		if err != nil || !strings.Contains(html, "<table") {
			t.Fatalf("%#v: %s %v", options, html, err)
		}
	}
	if _, err := BuildList(spec, rows, ListOptions{PageMeta: "x"}); err == nil || err.Error() != "List page metadata must be an object" {
		t.Fatalf("BuildList accepted page metadata: %v", err)
	}
}

func TestDetailContextMustBeAnObject(t *testing.T) {
	spec := NewObject("fields", NewObject("v", NewObject("field", ".v")))
	for _, data := range []any{[]any{}, "s", 5.0} {
		if _, err := RenderDetail(spec, NewObject(), DetailOptions{Data: data}); err == nil || err.Error() != "Detail context must be an object" {
			t.Fatalf("RenderDetail data %#v: %v", data, err)
		}
		if _, err := BuildDetail(spec, NewObject(), DetailOptions{Data: data}); err == nil || err.Error() != "Detail context must be an object" {
			t.Fatalf("BuildDetail data %#v: %v", data, err)
		}
	}
	if _, err := RenderDetail(NewObject(), NewObject(), DetailOptions{Data: []any{}}); err == nil || err.Error() != "Detail specification must declare fields" {
		t.Fatalf("fields check must come first: %v", err)
	}
	var nilObject *Object
	for _, data := range []any{nil, nilObject, NewObject()} {
		if _, err := RenderDetail(spec, NewObject(), DetailOptions{Data: data}); err != nil {
			t.Fatalf("data %#v: %v", data, err)
		}
	}
}

func detailValue(t *testing.T, format *Object, value any) (string, error) {
	t.Helper()
	spec := NewObject("fields", NewObject("v", NewObject("field", ".v", "label", "V", "format", format)))
	html, err := RenderDetail(spec, NewObject("v", value), DetailOptions{})
	if err != nil {
		return "", err
	}
	start := strings.Index(html, "<dd")
	end := strings.Index(html, "</dd>")
	return html[start : end+len("</dd>")], nil
}

func TestTextTruncateCountsCodePoints(t *testing.T) {
	cases := []struct {
		truncate any
		value    string
		want     string
	}{
		{2.0, "a😀bc", "a😀…"},
		{3.0, "가나다라마", "가나다…"},
		{"2", "abcd", "abcd"},
		{0.5, "abc", "abc"},
		{2.9, "abcd", "ab…"},
		{-3.0, "abcd", "abcd"},
		{4.0, "abcd", "abcd"},
		{true, "abcd", "abcd"},
	}
	for _, c := range cases {
		got, err := detailValue(t, NewObject("type", "text", "truncate", c.truncate), c.value)
		want := `<dd class="detail-value detail-value-text">` + c.want + `</dd>`
		if err != nil || got != want {
			t.Fatalf("truncate %#v of %q: got %s %v, want %s", c.truncate, c.value, got, err, want)
		}
	}
}

func TestNumberDecimalsRange(t *testing.T) {
	for _, decimals := range []any{101.0, -1.0, 100.9 + 1} {
		_, err := detailValue(t, NewObject("type", "number", "decimals", decimals), 1.0)
		if err == nil || err.Error() != "Number decimals must be between 0 and 100" {
			t.Fatalf("decimals %v: %v", decimals, err)
		}
	}
	got, err := detailValue(t, NewObject("type", "number", "decimals", 100.0), 1.0)
	if want := `<dd class="detail-value detail-value-number">1.` + strings.Repeat("0", 100) + `</dd>`; err != nil || got != want {
		t.Fatalf("got %s %v", got, err)
	}
	for _, decimals := range []any{-0.5, 100.5, "101"} {
		if _, err := detailValue(t, NewObject("type", "number", "decimals", decimals), 1.0); err != nil {
			t.Fatalf("decimals %#v: %v", decimals, err)
		}
	}
}
