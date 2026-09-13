package generator

import (
	"fmt"
	"regexp"
	"strconv"
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

// classes joins the nonempty class parts with single spaces.
func classes(parts ...string) string {
	out := []string{}
	for _, p := range parts {
		if p != "" {
			out = append(out, p)
		}
	}
	return strings.Join(out, " ")
}

// flag renders a valueless boolean attribute.
func flag(name string, on bool) string {
	if on {
		return " " + name + `=""`
	}
	return ""
}
func controlsHTML(controls *Object) string {
	body := ""
	for _, a := range objectList(read(controls, "actions")) {
		body += "<button" + attrs(NewObject("type", "button", "class", "crudui-action", "data-crudui-action", stringAt(a, "name"), "aria-label", stringAt(a, "label")), false, false) + flag("disabled", read(a, "disabled") == true) + "></button>"
	}
	return element("div", NewObject("class", "crudui-controls", "role", "group", "aria-label", stringAt(controls, "label")), body)
}
func headerHTML(vm *Object) string {
	header := read(vm, "header")
	expanded := read(vm, "expanded") == true
	parts := ""
	if read(vm, "collapsible") == true {
		a := NewObject("type", "button", "class", "crudui-action", "data-crudui-action", "toggle-row", "aria-expanded", strconv.FormatBool(expanded))
		if body := read(vm, "body"); has(body, "id") {
			a.Set("aria-controls", stringAt(body, "id"))
		}
		if has(vm, "toggleLabel") {
			a.Set("aria-label", stringAt(vm, "toggleLabel"))
		}
		parts += "<button" + attrs(a, false, false) + "></button>"
	}
	if has(header, "label") {
		if target := stringAt(header, "labelFor"); target != "" {
			parts += element("label", NewObject("class", "crudui-node__label", "for", target), escape(stringAt(header, "label")))
		} else {
			parts += element("span", NewObject("class", "crudui-node__label"), escape(stringAt(header, "label")))
		}
	}
	if has(header, "description") {
		parts += element("p", NewObject("class", "crudui-node__description"), escape(stringAt(header, "description")))
	}
	for _, part := range []string{"number", "title"} {
		if has(header, part) {
			parts += element("span", NewObject("class", "crudui-node__"+part), escape(stringAt(header, part)))
		}
	}
	if has(header, "summary") {
		parts += `<span class="crudui-node__summary"` + flag("hidden", expanded) + ">" + escape(stringAt(header, "summary")) + "</span>"
	}
	if has(header, "count") {
		parts += element("span", NewObject("class", "crudui-node__count"), escape(stringAt(header, "count")))
	}
	controls := read(vm, "controls")
	if stringAt(controls, "placement") == "header" {
		parts += controlsHTML(object(controls))
	}
	if parts == "" {
		return ""
	}
	styles := []string{}
	if st := stringAt(header, "style"); st != "" {
		styles = append(styles, st)
	}
	if read(vm, "sticky") == true {
		styles = append(styles, "--crudui-sticky-depth: "+stringAt(vm, "stickyDepth"))
	}
	return element("div", NewObject("class", classes("crudui-node__header", stringAt(header, "className")), "style", strings.Join(styles, "; ")), parts)
}
func bodyHTML(vm *Object) string {
	body := read(vm, "body")
	a := NewObject("class", classes("crudui-node__body", stringAt(body, "className")))
	for _, k := range []string{"style", "id"} {
		if has(body, k) {
			a.Set(k, stringAt(body, k))
		}
	}
	inner := ""
	if box := object(read(vm, "checkbox")); box != nil {
		input := NewObject("class", stringAt(box, "className"), "id", stringAt(box, "id"), "name", stringAt(box, "name"), "type", "checkbox", "value", "1")
		if read(box, "checked") == true {
			input.Set("checked", true)
		}
		inner = inputHTML(input, false) + element("label", NewObject("for", stringAt(box, "id")), escape(stringAt(box, "caption")))
	} else if w := object(read(vm, "widget")); w != nil {
		inner = renderWidget(w)
	} else {
		inner = nodesHTML(objectList(read(vm, "children")))
	}
	return "<div" + attrs(a, false, false) + flag("hidden", read(vm, "collapsible") == true && read(vm, "expanded") != true) + ">" + inner + "</div>"
}

// nodeHTML renders one node of the recursive form grammar with its header, body and footer slots.
func nodeHTML(vm *Object) string {
	kind := stringAt(vm, "kind")
	sticky := ""
	if read(vm, "sticky") == true {
		sticky = "crudui-node--sticky"
	}
	a := NewObject("class", classes("crudui-node", "crudui-node--"+kind, sticky, stringAt(vm, "className")))
	if has(vm, "style") {
		a.Set("style", stringAt(vm, "style"))
	}
	if kind != "row" && kind != "lang-item" && has(vm, "path") {
		a.Set("data-field-path", stringAt(vm, "path"))
	}
	if has(vm, "key") {
		a.Set("data-crudui-row-key", stringAt(vm, "key"))
	}
	if has(vm, "lang") {
		a.Set("data-lang", stringAt(vm, "lang"))
	}
	footer := ""
	if controls := read(vm, "controls"); stringAt(controls, "placement") == "footer" {
		footer = element("div", NewObject("class", "crudui-node__footer"), controlsHTML(object(controls)))
	}
	return "<div" + attrs(a, false, false) + flag("hidden", read(vm, "hidden") == true) + ">" + headerHTML(vm) + bodyHTML(vm) + footer + "</div>"
}
func nodesHTML(nodes []*Object) string {
	var out strings.Builder
	for _, n := range nodes {
		out.WriteString(nodeHTML(n))
	}
	return out.String()
}

// RenderForm renders one instance without changing its template or data.
func RenderForm(form *Form) (string, error) {
	if form == nil {
		return "", fmt.Errorf("Form instance is required")
	}
	return `<div class="crudui-form"><div class="crudui-form__body">` + nodesHTML(form.fields) + `</div></div>`, nil
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
