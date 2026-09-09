package generator

import (
	"fmt"
	"regexp"
	"strings"
)

func escape(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#x27;").Replace(s)
}
func rawEscape(s string) string {
	return strings.NewReplacer("&", "&amp;", `"`, "&quot;", "<", "&lt;").Replace(s)
}
func escapeText(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(s)
}
func eventAttrs(a *Object) bool {
	if a == nil {
		return false
	}
	for _, k := range a.Keys() {
		if strings.HasPrefix(k, "on") {
			return true
		}
	}
	return false
}
func attrs(a *Object, raw, input bool) string {
	if a == nil {
		return ""
	}
	out := ""
	value, hasValue := a.Get("value")
	checked, hasChecked := a.Get("checked")
	name, hasName := a.Get("name")
	style, hasStyle := a.Get("style")
	for _, k := range a.Keys() {
		v := read(a, k)
		if isAbsent(v) || v == nil {
			continue
		}
		if !raw && input && (k == "value" || k == "checked" || k == "name" || k == "style") {
			continue
		}
		s := scalar(v)
		if !raw && (k == "href" || k == "src") {
			s = sanitizeURL(s)
		}
		if k == "style" && !raw {
			s = compactStyle(s)
			if s == "" {
				continue
			}
		}
		if !raw && (k == "readonly" || k == "disabled" || k == "required" || k == "multiple" || k == "autofocus") {
			s = ""
		}
		esc := escape
		if raw {
			esc = rawEscape
		}
		key := k
		if !raw {
			key = ordinaryAttribute(k)
		}
		out += " " + key + `="` + esc(s) + `"`
	}
	if !raw && input {
		if hasStyle {
			if css := compactStyle(scalar(style)); css != "" {
				out += ` style="` + escape(css) + `"`
			}
		}
		if hasName {
			out += ` name="` + escape(scalar(name)) + `"`
		}
		if hasChecked && truthy(checked) {
			out += ` checked=""`
		}
		if hasValue {
			out += ` value="` + escape(scalar(value)) + `"`
		}
	}
	return out
}
func element(tag string, a *Object, body string) string {
	return "<" + tag + attrs(a, false, false) + ">" + body + "</" + tag + ">"
}
func inputHTML(a *Object, raw bool) string {
	end := "/>"
	if raw {
		end = ">"
	}
	return "<input" + attrs(a, raw, true) + end
}
func affixHTML(v any, raw bool) string {
	a := object(v)
	if a == nil {
		return ""
	}
	at := NewObject()
	for _, k := range []string{"class", "style"} {
		if s := stringAt(a, k); s != "" {
			at.Set(k, s)
		}
	}
	return "<span" + attrs(at, raw, false) + ">" + textContent(stringAt(a, "text"), raw) + "</span>"
}
func objectList(v any) []*Object {
	if a, ok := v.([]*Object); ok {
		return a
	}
	out := []*Object{}
	for _, a := range list(v) {
		if o := object(a); o != nil {
			out = append(out, o)
		}
	}
	return out
}
func controlHTML(w *Object, raw bool, selection string) string {
	tag := stringAt(w, "tag")
	a := object(read(w, "attrs"))
	if !raw && a.Has("style") {
		a = a.Clone()
		style := read(a, "style")
		a.Delete("style")
		a.Set("style", style)
	}
	switch tag {
	case "select":
		body := ""
		for _, o := range objectList(read(w, "options")) {
			at := NewObject("value", stringAt(o, "value"))
			if truthy(read(o, "selected")) {
				at.Set("selected", selection)
			}
			body += "<option" + attrs(at, raw, false) + ">" + textContent(stringAt(o, "label"), raw) + "</option>"
		}
		return "<select" + attrs(a, raw, false) + ">" + body + "</select>"
	case "textarea":
		text := stringAt(w, "text")
		if !raw && strings.HasPrefix(text, "\n") {
			text = "\n" + text
		}
		return "<textarea" + attrs(a, raw, false) + ">" + textContent(text, raw) + "</textarea>"
	default:
		return inputHTML(a, raw)
	}
}
func renderWidget(w *Object) string {
	if w == nil {
		return ""
	}
	if read(w, "unsupported") == true {
		return element("div", NewObject("class", "form-element-unsupported", "data-unsupported-type", stringAt(w, "type")), "")
	}
	a := object(read(w, "attrs"))
	raw := eventAttrs(a)
	script := `<script nonce="">` + stringAt(w, "script") + `</script>`
	switch stringAt(w, "layout") {
	case "input-group":
		return `<div class="input-group">` + affixHTML(read(w, "prepend"), raw) + controlHTML(w, raw, "") + affixHTML(read(w, "append"), raw) + `</div>`
	case "bare":
		return controlHTML(w, raw, "")
	case "host-script":
		return controlHTML(w, raw, "") + script
	case "btn-group":
		shared := object(read(read(w, "extra"), "input"))
		raw = eventAttrs(shared)
		body := ""
		typ := "checkbox"
		if stringAt(w, "kind") == "choice" {
			typ = "radio"
		}
		for _, o := range objectList(read(w, "options")) {
			at := NewObject()
			merge(at, shared)
			at.Set("type", typ)
			at.Set("value", stringAt(o, "value"))
			at.Set("autocomplete", "off")
			at.Set("class", "valid-target btn-check")
			if id := stringAt(o, "id"); id != "" {
				at.Set("id", id)
			}
			if typ == "radio" {
				v := ""
				if truthy(read(o, "isDefault")) {
					v = "1"
				}
				at.Set("data-is-default", v)
			}
			if truthy(read(o, "selected")) {
				at.Set("checked", true)
			}
			if raw && at.Has("checked") {
				at.Set("checked", "")
			}
			body += inputHTML(at, raw)
			label := NewObject()
			if id := stringAt(o, "id"); id != "" {
				label.Set("for", id)
			}
			label.Set("class", stringAt(w, "itemLabelClass"))
			body += "<label" + attrs(label, raw, false) + "><span>" + textContent(stringAt(o, "label"), raw) + "</span></label>"
		}
		return "<div" + attrs(a, false, false) + ">" + body + "</div>"
	case "file":
		extra := read(w, "extra")
		file := object(read(extra, "file"))
		display := object(read(extra, "display"))
		raw = eventAttrs(file)
		body := affixHTML(read(w, "prepend"), raw)
		if display != nil {
			if raw {
				body += `<input class="` + rawEscape(stringAt(display, "class")) + `" readonly="" type="text" value="">`
			} else {
				body += inputHTML(display, false)
			}
		}
		body += inputHTML(file, raw)
		if display != nil {
			body += `<button class="btn btn-search btn-file-search" type="button">&nbsp;</button>`
		}
		return `<div class="input-group">` + body + `</div>`
	case "display":
		return "<div" + attrs(a, false, false) + ">" + stringAt(w, "rawHtml") + "</div>"
	case "search":
		style := ""
		if s := stringAt(w, "styleChrome"); s != "" {
			style = `<style nonce="">` + s + `</style>`
		}
		return style + script + `<div class="input-group field-search">` + affixHTML(read(w, "prepend"), true) + controlHTML(w, true, "selected") + affixHTML(read(w, "append"), true) + `</div>`
	case "button":
		return script + inputHTML(object(read(read(w, "extra"), "hidden")), false) + inputHTML(a, false)
	}
	return ""
}
func rowButtons(vm *Object) string {
	s := object(read(vm, "multiple"))
	if s == nil {
		return ""
	}
	out := ""
	if truthy(read(s, "sortable")) {
		out += `<button type="button" class="btn btn-move-up"> </button><button type="button" class="btn btn-move-down"> </button>`
	}
	a := NewObject("type", "button", "class", "btn btn-plus")
	if s.Has("max") {
		a.Set("data-multiple-max", scalar(read(s, "max")))
	}
	out += element("button", a, " ")
	minus := "btn btn-minus"
	if truthy(read(s, "copy")) {
		out += `<button type="button" class="btn btn-copy"> </button>`
		minus += " btn-delete"
	}
	return out + element("button", NewObject("type", "button", "class", minus), " ")
}
func labelHTML(vm *Object) string {
	label := stringAt(vm, "label")
	if label == "" || truthy(read(vm, "omitLabel")) {
		return ""
	}
	d := object(read(vm, "design"))
	a := NewObject()
	if cls := nodeClass(d, "label"); cls != "" {
		a.Set("class", cls)
	}
	if s := nodeStyle(d, "label"); s != "" {
		a.Set("style", s)
	}
	body := escape(label)
	w := read(vm, "widget")
	id := stringAt(read(read(w, "extra"), "file"), "id")
	if id == "" {
		id = stringAt(read(w, "attrs"), "id")
	}
	if id != "" {
		body = element("label", NewObject("for", id), body)
	}
	return element("h6", a, body)
}
func descriptionHTML(vm *Object) string {
	if s := stringAt(vm, "description"); s != "" {
		return element("p", NewObject("class", "description"), escape(s))
	}
	return ""
}
func fieldHTML(vm *Object) string {
	d := object(read(vm, "design"))
	wrapper := NewObject("class", joinClass("form-element-wrapper", nodeClass(d, "wrapper")), "data-field-path", stringAt(vm, "path"))
	if s := wrapperStyle(d); s != "" {
		wrapper.Set("style", s)
	}
	inputWrapper := NewObject("class", joinClass("input-group-wrapper", nodeClass(d, "wrapper")), "data-uniqid", stringAt(vm, "uniqid"))
	body := ""
	if truthy(read(vm, "checkbox")) {
		a := NewObject("class", stringAt(vm, "checkboxClass"), "id", stringAt(vm, "checkboxId"), "name", stringAt(vm, "checkboxName"), "type", "checkbox", "value", "1")
		if truthy(read(vm, "checkboxChecked")) {
			a.Set("checked", true)
		}
		control := inputHTML(a, false) + element("label", NewObject("for", stringAt(vm, "checkboxId")), escape(stringAt(vm, "label")))
		body = `<div class="checkbox"><h6>` + element("div", inputWrapper, "<div>"+control+"</div>") + `</h6>` + descriptionHTML(vm) + `</div>`
		return element("div", wrapper, body)
	}
	switch stringAt(vm, "shape") {
	case "group":
		group := NewObject("class", stringAt(vm, "groupClass"))
		if st := stringAt(vm, "groupStyle"); st != "" {
			group.Set("style", st)
		}
		body = element("div", inputWrapper, element("div", group, fieldsHTML(objectList(read(vm, "children")))))
	case "multiple-leaf", "multiple-group":
		rows := objectList(read(vm, "rows"))
		for _, row := range rows {
			inner := ""
			if stringAt(vm, "shape") == "multiple-group" {
				inner = element("div", NewObject("class", stringAt(row, "groupClass")), fieldsHTML(objectList(read(row, "children")))) + `<span class="btn-group input-group-btn">` + rowButtons(vm) + `</span>`
			} else {
				inner = renderWidget(object(read(row, "widget"))) + rowButtons(vm)
			}
			body += element("div", NewObject("class", stringAt(row, "wrapperClass"), "data-uniqid", stringAt(row, "uniqid")), inner)
		}
		if len(rows) == 0 {
			body = `<button type="button" class="btn btn-plus" aria-label="+"> </button>`
		}
	case "lang":
		l := read(vm, "lang")
		inner := ""
		if title := stringAt(l, "title"); title != "" {
			inner = element("div", NewObject("class", "lang-title"), escape(title))
		}
		for _, child := range objectList(read(l, "children")) {
			code := stringAt(child, "code")
			inner += element("div", NewObject("class", "lang-child", "data-lang", code), element("span", NewObject("class", "input-group-text lang-code"), escape(code))+renderWidget(object(read(child, "widget"))))
		}
		body = element("div", inputWrapper, element("div", NewObject("class", stringAt(l, "groupClass")), inner))
	default:
		body = element("div", inputWrapper, renderWidget(object(read(vm, "widget"))))
	}
	return element("div", wrapper, labelHTML(vm)+descriptionHTML(vm)+`<div class="form-element">`+body+`</div>`)
}
func fieldsHTML(fields []*Object) string {
	var out strings.Builder
	for _, f := range fields {
		out.WriteString(fieldHTML(f))
	}
	return out.String()
}

// RenderForm renders one instance without changing its template or data.
func RenderForm(form *Form) (string, error) {
	if form == nil {
		return "", fmt.Errorf("Form instance is required")
	}
	return `<div class="form-group">` + fieldsHTML(form.fields) + `</div>`, nil
}

var javascriptProtocolRE = regexp.MustCompile(`(?i)^[\x00-\x1f ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:`)

func sanitizeURL(value string) string {
	if javascriptProtocolRE.MatchString(value) {
		return "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"
	}
	return value
}

func textContent(value string, raw bool) string {
	if raw {
		return escapeText(value)
	}
	return escape(value)
}

func ordinaryAttribute(name string) string {
	switch name {
	case "autocomplete":
		return "autoComplete"
	case "readonly":
		return "readOnly"
	case "maxlength":
		return "maxLength"
	case "minlength":
		return "minLength"
	case "colspan":
		return "colSpan"
	case "rowspan":
		return "rowSpan"
	default:
		return name
	}
}
