package generator

import "testing"

func TestListAndDetailDesignDeclarations(t *testing.T) {
	record := `{"name":"Ada"}`
	list := func(spec string) error {
		_, err := BuildList(decodeObject(t, spec), []*Object{decodeObject(t, record)}, ListOptions{})
		return err
	}
	detail := func(spec string) error {
		_, err := BuildDetail(decodeObject(t, spec), decodeObject(t, record), DetailOptions{})
		return err
	}
	cases := []struct {
		name  string
		build func(string) error
		spec  string
		want  string
	}{
		{"list column unknown key", list, `{"columns":{"name":{"field":"name","design":{"main":{"class":"x"}}}}}`, "Invalid design.main at columns.name: unknown key"},
		{"list own unknown key", list, `{"columns":{"name":{"field":"name"}},"design":{"color":"red"}}`, "Invalid design.color at list: unknown key"},
		{"list column show type", list, `{"columns":{"name":{"field":"name","design":{"show":1}}}}`, "Invalid design.show at columns.name: expected an expression, a boolean or a condition map"},
		{"detail field node unknown key", detail, `{"fields":{"name":{"field":"name","design":{"label":{"text":"x"}}}}}`, "Invalid design.label.text at fields.name: unknown key"},
		{"detail own node type", detail, `{"fields":{"name":{"field":"name"}},"design":{"wrapper":"box"}}`, "Invalid design.wrapper at detail: expected an object"},
		{"list own design before columns", list, `{"columns":{"name":{"field":"name","design":{"main":{}}}},"design":{"color":"red"}}`, "Invalid design.color at list: unknown key"},
		{"detail own design before fields", detail, `{"fields":{"name":{"field":"name","design":{"main":{}}}},"design":"box"}`, "Invalid design at detail: expected a boolean or an object"},
		{"list columns in member order", list, `{"columns":{"b":{"design":{"one":1}},"10":{"design":{"two":2}}}}`, "Invalid design.two at columns.10: unknown key"},
		{"detail fields in member order", detail, `{"fields":{"b":{"design":{"class":1}},"a":{"design":{"style":2}}}}`, "Invalid design.class at fields.b: expected a string or a condition map"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if err := c.build(c.spec); err == nil || err.Error() != c.want {
				t.Fatalf("got %v, want %s", err, c.want)
			}
		})
	}
	// The input rules come first.
	_, err := BuildList(decodeObject(t, `{"design":{"color":"red"}}`), nil, ListOptions{Page: 0.0})
	if err == nil || err.Error() != "List page must be a positive integer" {
		t.Fatalf("input rules must precede declarations: %v", err)
	}
	_, err = BuildDetail(decodeObject(t, `{"fields":{},"design":{"color":"red"}}`), nil, DetailOptions{Data: "x"})
	if err == nil || err.Error() != "Detail context must be an object" {
		t.Fatalf("detail input rules must precede declarations: %v", err)
	}
	// Valid declarations pass.
	if err := list(`{"columns":{"name":{"field":"name","design":{"show":true,"class":"x"}}},"design":{"wrapper":{"class":"w"}}}`); err != nil {
		t.Fatal(err)
	}
	if err := detail(`{"fields":{"name":{"field":"name","design":{"class":"c","label":{"style":"s"}}}},"design":true}`); err != nil {
		t.Fatal(err)
	}
}

// TestShowUsesTheValidatorVisibilityRule pins design.show to the validators'
// rule (only a resolved false hides) and keeps flags such as sortable on their own
// rule (a condition map that selects nothing is false).
func TestShowUsesTheValidatorVisibilityRule(t *testing.T) {
	data := map[string]any{"kind": "a"}
	cases := []struct {
		name       string
		value      any
		show, flag bool
	}{
		{"missing", nil, true, false},
		{"false", false, false, false},
		{"condition true", "kind == 'a'", true, true},
		{"condition false", "kind == 'b'", false, false},
		{"literal string", "not an expression ((", true, false},
		{"unparsable expression", ".mode == (", true, false},
		{"ternary false branch", "kind == 'a' ? false : true", false, false},
		{"map selects nothing", decodeObject(t, `{"kind == 'b'":false}`), true, false},
		{"map selects false", decodeObject(t, `{"kind == 'a'":false}`), false, false},
		{"map default true", decodeObject(t, `{"kind == 'b'":false,"true":true}`), true, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := evalShow(c.value, data, nil); got != c.show {
				t.Fatalf("show = %v, want %v", got, c.show)
			}
			if c.value == nil {
				return
			}
			if got := evalFlag(c.value, data, nil); got != c.flag {
				t.Fatalf("flag = %v, want %v", got, c.flag)
			}
		})
	}
}
