package generator

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

type widgetContext struct {
	spec   *Object
	value  any
	path   string
	design *Object
	state  bindState
}

func (c widgetContext) name() string             { return bracketName(c.path, c.state.options.KeyPrefix) }
func (c widgetContext) id() string               { return controlID(c.state.options.IDPrefix, c.path) }
func (c widgetContext) class(base string) string { return joinClass(base, nodeClass(c.design, "main")) }
func (c widgetContext) option(k, def string) string {
	v := read(read(c.spec, "options"), k)
	if v == nil || isAbsent(v) {
		return def
	}
	return scalar(v)
}
func (c widgetContext) dataAttrs() *Object {
	return NewObject("data-name", leafName(c.path, c.state.rows), "data-rule-name", ruleName(c.path, c.state.rows), "data-default", scalar(read(c.spec, "default")))
}
func (c widgetContext) translate(v any) string { return translate(v, c.state.options.Language) }
func (c widgetContext) display() string        { return defaultString(c.value, read(c.spec, "default")) }
func (c widgetContext) behavior() *Object {
	o := NewObject()
	if b := object(read(c.spec, "behavior")); b != nil {
		for _, k := range b.Keys() {
			v := read(b, k)
			if object(v) != nil {
				v = read(v, "script")
			}
			if s, ok := v.(string); ok && s != "" {
				o.Set(k, s)
			}
		}
	}
	return o
}
func (c widgetContext) affix(k string) *Object {
	text := c.translate(read(c.spec, k))
	if text == "" {
		return nil
	}
	a := NewObject("text", text, "class", "input-group-text")
	if k == "prepend" {
		a.Set("class", joinClass("input-group-text", nodeClass(c.design, "prepend")))
		if s := styleString(nodeStyle(c.design, "prepend")); s != "" {
			a.Set("style", s)
		}
	}
	return a
}
func (c widgetContext) attrsStyle(a *Object) {
	if s := styleString(nodeStyle(c.design, "main")); s != "" {
		a.Set("style", s)
	}
}
func (c widgetContext) attrsPlaceholder(a *Object) {
	if p := c.translate(read(c.spec, "placeholder")); p != "" {
		a.Set("placeholder", p)
	}
}
func (c widgetContext) attrsBehaviorData(a *Object) { merge(a, c.behavior()); merge(a, c.dataAttrs()) }
func (c widgetContext) withAffixes(w *Object) *Object {
	for _, k := range []string{"prepend", "append"} {
		if a := c.affix(k); a != nil {
			w.Set(k, a)
		}
	}
	return w
}
func dynamicItems(v any) bool { return object(v) != nil && has(v, "model") }
func sourceAttrs(items any) *Object {
	relations := read(items, "relations")
	if relations == nil || isAbsent(relations) {
		relations = []any{}
	}
	b, _ := json.Marshal(relations)
	return NewObject("data-source-model", stringAt(items, "model"), "data-source-method", stringAt(items, "method"), "data-source-table", stringAt(items, "table"), "data-source-relations", string(b))
}
func (c widgetContext) options(selected []string, defaults *string) []*Object {
	out := []*Object{}
	items := read(c.spec, "items")
	if dynamicItems(items) {
		return out
	}
	for _, k := range keys(items) {
		v := item(items, k)
		label := c.translate(v)
		if label == "" {
			label = scalar(v)
		}
		checked := false
		for _, s := range selected {
			if s == k {
				checked = true
			}
		}
		out = append(out, NewObject("value", k, "label", label, "selected", checked, "isDefault", defaults != nil && *defaults == k))
	}
	return out
}
func widget(kind, layout, tag string, attrs *Object) *Object {
	w := NewObject("kind", kind, "layout", layout)
	if tag != "" {
		w.Set("tag", tag)
	}
	w.Set("attrs", attrs)
	return w
}

var widgetAliases = map[string]string{"string": "text", "integer": "number", "float": "number", "decimal": "number", "dropdown": "select", "selectbox": "select", "radio": "choice", "checkboxes": "multichoice", "checkcontainer": "multichoice", "datetime-local": "datetime", "html": "dummy", "static": "dummy", "cover-simple": "cover", "autocomplete": "search", "wysiwyg": "tinymce", "action": "button"}
var newlineRE = regexp.MustCompile(`\r\n|\n\r|\r|\n`)

func evalWidget(c widgetContext) *Object {
	kind := strings.ToLower(stringAt(c.spec, "type"))
	if canonical, ok := widgetAliases[kind]; ok {
		kind = canonical
	}
	name := c.name()
	a := NewObject()
	var w *Object
	switch kind {
	case "text", "email", "number":
		a = NewObject("type", kind, "name", name, "value", c.display(), "class", c.class("valid-target form-control"))
		c.attrsPlaceholder(a)
		c.attrsStyle(a)
		c.attrsBehaviorData(a)
		w = c.withAffixes(widget(kind, "input-group", "input", a))
	case "password":
		a = NewObject("type", "password", "name", name, "value", scalar(c.value), "class", c.class("valid-target form-control"))
		c.attrsStyle(a)
		merge(a, c.dataAttrs())
		w = widget(kind, "bare", "input", a)
	case "textarea":
		a = NewObject("name", name, "class", c.class("valid-target form-control"), "rows", "5")
		c.attrsStyle(a)
		c.attrsBehaviorData(a)
		w = c.withAffixes(widget(kind, "input-group", "textarea", a))
		w.Set("text", c.display())
	case "hidden":
		a = NewObject("type", "hidden", "name", name, "value", c.display(), "class", c.class("valid-target"))
		merge(a, c.dataAttrs())
		w = widget(kind, "bare", "input", a)
	case "date", "datetime":
		inputType, layout := kind, "input-group"
		v := dateValue(c.display())
		if kind == "datetime" {
			inputType, layout, v = "datetime-local", "bare", datetimeValue(c.display())
		}
		a = NewObject("type", inputType, "name", name, "value", v, "class", c.class("valid-target form-control"))
		c.attrsStyle(a)
		c.attrsBehaviorData(a)
		w = widget(kind, layout, "input", a)
		if kind == "date" {
			c.withAffixes(w)
		}
	case "select":
		items := read(c.spec, "items")
		dynamic := dynamicItems(items)
		base := "valid-target form-select"
		if dynamic {
			base += " valid-target-async"
		}
		a = NewObject("name", name, "class", c.class(base))
		var source any = nil
		if dynamic {
			source = sourceAttrs(items)
			merge(a, source)
		}
		c.attrsStyle(a)
		c.attrsBehaviorData(a)
		w = c.withAffixes(widget(kind, "input-group", "select", a))
		w.Set("source", source)
		options := c.options([]string{c.display()}, nil)
		if len(options) == 0 {
			options = []*Object{NewObject("value", "", "label", "select", "selected", false, "isDefault", false)}
		}
		w.Set("options", options)
	case "choice", "multichoice":
		items := read(c.spec, "items")
		dynamic := dynamicItems(items)
		class, label := "btn-group btn-group-toggle", "btn btn-switch"
		if kind == "multichoice" {
			class = "btn-group flex-wrap btn-group-toggle"
			label += " btn-mswitch"
		}
		a = NewObject("class", class)
		if kind == "choice" {
			a.Set("data-toggle", "buttons")
		}
		var source any = nil
		if dynamic {
			source = sourceAttrs(items)
			merge(a, source)
		}
		w = widget(kind, "btn-group", "", a)
		w.Set("source", source)
		w.Set("itemLabelClass", joinClass(label, nodeClass(c.design, "main")))
		selected := []string{}
		var def *string
		if kind == "choice" {
			v := read(c.spec, "default")
			if v != nil && !isAbsent(v) {
				if _, array := v.([]any); !array {
					s := scalar(v)
					def = &s
				}
			}
			selected = []string{c.display()}
		} else {
			v := c.value
			if isAbsent(v) {
				v = read(c.spec, "default")
			}
			if a, ok := v.([]any); ok {
				for _, e := range a {
					selected = append(selected, jsString(e))
				}
			} else if truthy(v) {
				selected = append(selected, jsString(v))
			}
		}
		options := c.options(selected, def)
		for i, o := range options {
			o.Set("id", c.id()+":"+strconv.Itoa(i))
		}
		w.Set("options", options)
		if !dynamic {
			inputName := name
			if kind == "multichoice" {
				inputName += "[]"
			}
			input := NewObject("name", inputName, "data-name", leafName(c.path, c.state.rows), "data-rule-name", ruleName(c.path, c.state.rows))
			for _, k := range []string{"onchange", "onclick"} {
				if k == "onclick" && kind != "choice" {
					continue
				}
				if v := read(c.behavior(), k); !isAbsent(v) {
					input.Set(k, v)
				}
			}
			w.Set("extra", NewObject("input", input))
		}
	case "dummy":
		v := c.value
		if isAbsent(v) {
			v = read(c.spec, "default")
		}
		items := read(c.spec, "items")
		if object(items) != nil && !dynamicItems(items) {
			if x := read(items, scalar(v)); !isAbsent(x) {
				v = x
			}
		}
		raw := scalar(v)
		if raw != "" && raw != "0" {
			raw = newlineRE.ReplaceAllString(raw, "<br />$0")
		}
		if cls := nodeClass(c.design, "main"); cls != "" {
			a.Set("class", cls)
		}
		c.attrsStyle(a)
		w = widget(kind, "display", "div", a)
		w.Set("rawHtml", raw)
	case "dummy-input":
		a = NewObject("type", "text", "name", name, "value", c.display(), "readonly", "", "class", c.class("form-control"))
		c.attrsPlaceholder(a)
		c.attrsStyle(a)
		a.Set("data-default", scalar(read(c.spec, "default")))
		w = c.withAffixes(widget(kind, "input-group", "input", a))
	case "image", "file", "cover":
		class := "valid-target form-control-file"
		accept := "*/*"
		if kind == "image" {
			class += " form-control-image"
			accept = "image/*"
		}
		if kind == "cover" {
			class += " form-control-filetext form-control-image"
			accept = "image/*"
		}
		accept = c.option("accept", accept)
		if v, ok := read(read(c.spec, "validate"), "accept").(string); ok && v != "" {
			accept = v
		}
		file := NewObject("type", "file", "class", c.class(class))
		for _, k := range []string{"max_width", "min_width", "max_height", "min_height", "preview_max_width", "preview_max_height"} {
			file.Set("data-"+strings.ReplaceAll(k, "_", "-"), c.option(k, "0"))
		}
		if kind == "cover" {
			name += "[name]"
		}
		file.Set("name", name)
		file.Set("data-name", leafName(c.path, c.state.rows))
		file.Set("data-rule-name", ruleName(c.path, c.state.rows))
		merge(file, c.behavior())
		if kind != "cover" {
			file.Set("value", "")
		}
		file.Set("accept", accept)
		file.Set("id", c.id())
		extra := NewObject()
		if kind != "cover" {
			extra.Set("display", NewObject("type", "text", "class", "form-control form-control-file", "value", "", "readonly", ""))
		}
		extra.Set("file", file)
		w = widget(kind, "file", "", a)
		w.Set("extra", extra)
		if p := c.affix("prepend"); p != nil {
			w.Set("prepend", p)
		}
	case "image-viewer":
		raw := "이미지가 없습니다."
		if values := list(c.value); len(values) > 0 {
			raw = ""
			height := ""
			if h := c.option("height", ""); h != "" {
				height = ` height="` + h + `"`
			}
			for _, v := range values {
				raw += `<img src="` + scalar(v) + `"` + height + `>`
			}
		}
		if cls := nodeClass(c.design, "main"); cls != "" {
			a.Set("class", cls)
		}
		w = widget(kind, "display", "div", a)
		w.Set("rawHtml", raw)
	case "search":
		w = searchWidget(c)
	case "tinymce", "summernote", "editorjs", "tui", "tagify", "tagify2":
		w = editorWidget(kind, c)
	case "button":
		id := c.id()
		text := ""
		if c.spec.Has("content") {
			text = c.translate(read(c.spec, "content"))
		} else if c.spec.Has("text") {
			text = c.translate(read(c.spec, "text"))
		}
		a = NewObject("type", "button", "class", c.class("btn"), "name", "btn"+name, "id", id, "value", text)
		w = widget(kind, "button", "", a)
		w.Set("buttonText", text)
		w.Set("script", fmt.Sprintf("\n$(function() {\n    %s\n    $(document.getElementById(%s)).on('click', function() {\n        %s\n    });\n});\n", c.option("init_script", ""), scriptString(id), stringAt(c.behavior(), "onclick")))
		hidden := NewObject("type", "hidden", "class", "valid-target form-control", "readonly", "", "name", name, "data-name", leafName(c.path, c.state.rows), "data-rule-name", ruleName(c.path, c.state.rows), "value", c.display(), "data-default", scalar(read(c.spec, "default")))
		w.Set("extra", NewObject("hidden", hidden))
	default:
		return nil
	}
	if w != nil {
		tag := stringAt(w, "tag")
		if tag == "input" || tag == "select" || tag == "textarea" {
			object(read(w, "attrs")).Set("id", c.id())
		}
	}
	return w
}
func searchWidget(c widgetContext) *Object {
	items := read(c.spec, "items")
	dynamic := dynamicItems(items)
	min, delay, api := c.option("keyword_min_length", "2"), c.option("delay", "250"), c.option("api_server", "")
	base := "valid-target form-control"
	var source any = nil
	if dynamic {
		base += " valid-target-async"
		source = sourceAttrs(items)
	}
	a := NewObject("class", c.class(base))
	c.attrsStyle(a)
	a.Set("name", c.name())
	a.Set("data-keyword-min-length", min)
	a.Set("data-delay", delay)
	a.Set("data-api-server", api)
	merge(a, source)
	a.Set("data-name", leafName(c.path, c.state.rows))
	a.Set("data-rule-name", ruleName(c.path, c.state.rows))
	a.Set("id", c.id())
	if s := stringAt(c.behavior(), "onchange"); s != "" {
		a.Set("onchange", s)
	}
	a.Set("data-default", scalar(read(c.spec, "default")))
	w := c.withAffixes(widget("search", "search", "select", a))
	w.Set("source", source)
	options := c.options([]string{c.display()}, nil)
	if len(options) == 0 {
		options = []*Object{NewObject("value", "", "label", "select", "selected", false, "isDefault", false)}
	}
	w.Set("options", options)
	callback := ""
	if cb := c.option("callback", ""); cb != "" {
		callback = fmt.Sprintf("$(document.getElementById(%s)).on('select2:select', %s);", scriptString(c.id()), cb)
	}
	style := ""
	if c.option("hide_searching", "undefined") != "" {
		style = "[class~=" + scriptString(c.id()+"_select2") + "] .loading-results { display: none; }"
	}
	w.Set("styleChrome", style)
	w.Set("script", fmt.Sprintf("$(function() {select2(CSS.escape(%s), %s, %s, %s);%s});", scriptString(c.id()), scriptString(min), scriptString(delay), scriptString(c.id()+"_select2"), callback))
	return w
}
func editorWidget(kind string, c widgetContext) *Object {
	id := c.id()
	base, rows := "valid-target form-control", "3"
	tag := "textarea"
	if kind == "tinymce" {
		base += " tinymcearea"
	}
	if kind == "summernote" {
		base += " summernote"
		rows = "5"
	}
	if kind == "editorjs" {
		base += " contentjs"
	}
	if kind == "tui" {
		base += " tuiarea"
	}
	if kind == "tagify" || kind == "tagify2" {
		tag = "input"
	}
	a := NewObject()
	if tag == "input" {
		a.Set("type", "text")
	}
	a.Set("id", id)
	a.Set("class", c.class(base))
	a.Set("name", c.name())
	if tag == "textarea" {
		a.Set("rows", c.option("rows", rows))
	} else {
		a.Set("value", c.display())
		a.Set("data-max-tags", c.option("max_tags", "0"))
		if kind == "tagify2" {
			a.Set("data-server", c.option("server", ""))
		}
		c.attrsPlaceholder(a)
	}
	script := ""
	selector := "'#'+CSS.escape(" + scriptString(id) + ")"
	switch kind {
	case "tinymce":
		height, upload := c.option("height", "300"), c.option("fileserver", "upload")
		a.Set("data-type", stringAt(c.spec, "type"))
		a.Set("data-height", height)
		a.Set("data-upload-server", upload)
		script = fmt.Sprintf("$(function() {editor_tinymce(%s, %s, %s, false);});", selector, height, scriptString(upload))
	case "summernote":
		script = fmt.Sprintf("$(function() {editor_summernote(%s, %s);});", selector, scriptString(c.option("upload", "upload")))
	case "editorjs", "tui":
		server := c.option("fileserver", "")
		a.Set("data-fileserver", server)
		script = fmt.Sprintf("$(function() {editor_%s(%s, %s);});", kind, selector, scriptString(server))
	case "tagify":
		script = fmt.Sprintf("$(function() {editor_tagify(%s, %s);});", selector, c.option("max_tags", "0"))
	case "tagify2":
		script = fmt.Sprintf("$(function() {editor_tagify2(%s, %s, %s);});", selector, c.option("max_tags", "0"), scriptString(c.option("server", "")))
	}
	c.attrsBehaviorData(a)
	w := widget(kind, "host-script", tag, a)
	if tag == "textarea" {
		w.Set("text", c.display())
	}
	w.Set("script", script)
	return w
}

func scriptString(value string) string {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(value)
	return strings.ReplaceAll(strings.TrimSuffix(b.String(), "\n"), "<", `\u003c`)
}
