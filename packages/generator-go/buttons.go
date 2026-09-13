package generator

// formButtonTypes lists the button types a spec can declare. A link renders an anchor.
var formButtonTypes = map[string]bool{"submit": true, "reset": true, "button": true, "link": true}

// buttonText returns the interface text of a button type; only submit and reset have one.
func buttonText(m formMessages, kind string) string {
	switch kind {
	case "submit":
		return m.submit
	case "reset":
		return m.reset
	}
	return ""
}

// buttonLabel returns the declared content, or the interface text when there is none.
func buttonLabel(button *Object, language, fallback string) string {
	text := read(button, "text")
	if s, ok := text.(string); ok {
		return s
	}
	if object(text) != nil {
		if s := translate(text, language); s != "" {
			return s
		}
	}
	return fallback
}

// buttonScript returns a non-empty behavior script: a string or the script of a { label, script } action.
func buttonScript(button *Object, action string) string {
	v := read(read(button, "behavior"), action)
	if object(v) != nil {
		v = read(v, "script")
	}
	s, _ := v.(string)
	return s
}

// formButtonsHTML renders the form buttons for a record; every implementation emits this markup.
func formButtonsHTML(buttons []*Object, data *Object, language string, m formMessages) string {
	lookup, _ := plainLookup(data).(map[string]any)
	out := ""
	for _, button := range buttons {
		kind := stringAt(button, "type")
		design := resolveDesign(read(button, "design"), lookup, []string{})
		tag, attrs := "button", [][2]string{}
		if kind == "link" {
			tag = "a"
		} else {
			attrs = append(attrs, [2]string{"type", kind})
		}
		class := "crudui-action crudui-action--text"
		if c := nodeClass(design, "main"); c != "" {
			class += " " + c
		}
		attrs = append(attrs, [2]string{"class", class})
		if style := styleString(nodeStyle(design, "main")); style != "" {
			attrs = append(attrs, [2]string{"style", style})
		}
		for _, name := range []string{"name", "value", "href"} {
			if s, ok := read(button, name).(string); ok {
				attrs = append(attrs, [2]string{name, s})
			}
		}
		if script := buttonScript(button, "onclick"); script != "" {
			attrs = append(attrs, [2]string{"onclick", script})
		}
		out += "<" + tag
		for _, a := range attrs {
			out += " " + a[0] + `="` + rawEscape(a[1]) + `"`
		}
		out += ">" + escapeText(buttonLabel(button, language, buttonText(m, kind))) + "</" + tag + ">"
	}
	return out
}
