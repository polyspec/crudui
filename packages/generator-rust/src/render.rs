use serde_json::{json, Map, Value};

use crate::util::{js_string, scalar, style};
use crate::{Form, FormResult};

pub(crate) fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}

pub(crate) fn raw_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

pub(crate) fn raw_attribute(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
}

fn attributes(attrs: &Value, raw: bool) -> String {
    let Some(attrs) = attrs.as_object() else {
        return String::new();
    };
    attrs
        .iter()
        .map(|(key, value)| {
            let value = scalar(Some(value));
            let value = if raw {
                raw_attribute(&value)
            } else {
                escape(&value)
            };
            let key = if raw {
                key.as_str()
            } else {
                match key.as_str() {
                    "autocomplete" => "autoComplete",
                    "readonly" => "readOnly",
                    "maxlength" => "maxLength",
                    "minlength" => "minLength",
                    "colspan" => "colSpan",
                    "rowspan" => "rowSpan",
                    _ => key.as_str(),
                }
            };
            format!(" {key}=\"{value}\"")
        })
        .collect()
}

fn sanitize_url(url: &str) -> String {
    let pattern=regex::RegexBuilder::new(r"^[\x00-\x1f ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:")
        .case_insensitive(true).unicode(false).build().expect("URL scheme pattern");
    if pattern.is_match(url) {
        "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')".into()
    } else {
        url.into()
    }
}

pub(crate) fn element(tag: &str, attrs: &Value, content: &str) -> String {
    let mut attrs = attrs.as_object().cloned().unwrap_or_default();
    if let Some(value) = attrs.get("style").and_then(Value::as_str) {
        let value = crate::css::render_style(value);
        if value.is_empty() {
            attrs.shift_remove("style");
        } else {
            attrs.insert("style".into(), value.into());
        }
    }
    for key in ["href", "src"] {
        if let Some(value) = attrs.get(key).and_then(Value::as_str) {
            if key == "src" && value.is_empty() {
                attrs.shift_remove(key);
            } else {
                attrs.insert(key.into(), sanitize_url(value).into());
            }
        }
    }
    for key in ["readonly", "disabled", "required", "multiple", "autofocus"] {
        if attrs.contains_key(key) {
            attrs.insert(key.into(), "".into());
        }
    }
    if tag == "input" {
        for key in ["name", "checked", "value"] {
            if let Some(value) = attrs.shift_remove(key) {
                attrs.insert(key.into(), value);
            }
        }
    } else if matches!(tag, "select" | "textarea") {
        attrs.shift_remove("value");
    }
    let attributes = attributes(&attrs.into(), false);
    if matches!(tag, "input" | "img" | "br" | "hr" | "link") {
        format!("<{tag}{attributes}/>")
    } else {
        let leading_newline = if tag == "textarea" && content.starts_with('\n') {
            "\n"
        } else {
            ""
        };
        format!("<{tag}{attributes}>{leading_newline}{content}</{tag}>")
    }
}

pub(crate) fn raw_element(tag: &str, attrs: &Value, content: &str) -> String {
    let attributes = attributes(attrs, true);
    if matches!(tag, "input" | "img" | "br" | "hr" | "link") {
        format!("<{tag}{attributes}>")
    } else {
        format!("<{tag}{attributes}>{content}</{tag}>")
    }
}

fn has_events(attrs: &Value) -> bool {
    attrs.as_object().into_iter().flatten().any(|(key, _)| {
        key.strip_prefix("on")
            .and_then(|rest| rest.bytes().next())
            .is_some_and(|byte| byte.is_ascii_lowercase())
    })
}

fn str_at<'a>(value: &'a Value, key: &str) -> &'a str {
    value[key].as_str().unwrap_or("")
}

pub(crate) fn appearance_attrs(class: String, inline: &str) -> Value {
    let mut attrs = Map::new();
    if !class.is_empty() {
        attrs.insert("class".into(), class.into());
    }
    let inline = style(inline);
    if !inline.is_empty() {
        attrs.insert("style".into(), inline.into());
    }
    attrs.into()
}

fn affix(affix: &Value, raw: bool) -> String {
    if !affix.is_object() {
        return String::new();
    }
    let element = if raw { raw_element } else { element };
    let text = if raw { raw_text } else { escape };
    element(
        "span",
        &appearance_attrs(str_at(affix, "class").into(), str_at(affix, "style")),
        &text(str_at(affix, "text")),
    )
}

fn control(widget: &Value, search: bool) -> String {
    let tag = widget["tag"].as_str().unwrap_or("input");
    let raw = search || has_events(&widget["attrs"]);
    let text = if raw { raw_text } else { escape };
    let render = if raw { raw_element } else { element };
    let content = if tag == "select" {
        widget["options"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|option| {
                let mut attrs = json!({"value":option["value"]});
                if option["selected"] == true {
                    attrs["selected"] = if search { "selected" } else { "" }.into();
                }
                render("option", &attrs, &text(str_at(option, "label")))
            })
            .collect()
    } else {
        text(str_at(widget, "text"))
    };
    let mut attrs = widget["attrs"].clone();
    if !raw {
        if let Some(style) = attrs
            .as_object_mut()
            .and_then(|attrs| attrs.shift_remove("style"))
        {
            attrs["style"] = style;
        }
    }
    render(tag, &attrs, &content)
}

fn script(text: &str) -> String {
    element("script", &json!({"nonce":""}), text)
}

fn widget(model: &Value) -> String {
    if model["unsupported"] == true {
        return element(
            "div",
            &json!({"class":"crudui-widget crudui-widget--unsupported","data-unsupported-type":model["type"]}),
            "",
        );
    }
    match str_at(model, "layout") {
        "widget" => element(
            "div",
            &json!({"class":"crudui-widget"}),
            &(affix(&model["prepend"], has_events(&model["attrs"]))
                + &control(model, false)
                + &affix(&model["append"], has_events(&model["attrs"]))),
        ),
        "bare" => control(model, false),
        "host-script" => control(model, false) + &script(str_at(model, "script")),
        "choices" => {
            let radio = model["kind"] == "choice";
            let content = model["options"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|option| {
                    let mut attrs = model["extra"]["input"]
                        .as_object()
                        .cloned()
                        .unwrap_or_default();
                    attrs.insert(
                        "type".into(),
                        if radio { "radio" } else { "checkbox" }.into(),
                    );
                    attrs.insert("value".into(), option["value"].clone());
                    attrs.insert("autocomplete".into(), "off".into());
                    attrs.insert("class".into(), "valid-target crudui-choices__input".into());
                    if option["id"].is_string() {
                        attrs.insert("id".into(), option["id"].clone());
                    }
                    if radio {
                        attrs.insert(
                            "data-is-default".into(),
                            if option["isDefault"] == true { "1" } else { "" }.into(),
                        );
                    }
                    if option["selected"] == true {
                        attrs.insert("checked".into(), "".into());
                    }
                    let label = json!({"for":option["id"],"class":model["itemLabelClass"]});
                    let raw = has_events(&model["extra"]["input"]);
                    let input = if raw { raw_element } else { element };
                    let text = if raw { raw_text } else { escape };
                    input("input", &attrs.into(), "")
                        + &input(
                            "label",
                            &label,
                            &input("span", &json!({}), &text(str_at(option, "label"))),
                        )
                })
                .collect::<String>();
            element("div", &model["attrs"], &content)
        }
        "file" => {
            let raw = has_events(&model["extra"]["file"]);
            let input = if raw { raw_element } else { element };
            let mut content = affix(&model["prepend"], raw);
            if model["extra"]["display"].is_object() {
                let display = if raw {
                    json!({"class":model["extra"]["display"]["class"],"readonly":"","type":"text","value":""})
                } else {
                    model["extra"]["display"].clone()
                };
                content += &input("input", &display, "");
            }
            content += &input("input", &model["extra"]["file"], "");
            if model["extra"]["display"].is_object() {
                content += &element(
                    "button",
                    &json!({"class":"crudui-widget__button","type":"button"}),
                    "&nbsp;",
                );
            }
            element("div", &json!({"class":"crudui-widget"}), &content)
        }
        "display" => element("div", &model["attrs"], str_at(model, "rawHtml")),
        "search" => {
            let mut content = String::new();
            if !str_at(model, "styleChrome").is_empty() {
                content += &element("style", &json!({"nonce":""}), str_at(model, "styleChrome"));
            }
            content += &script(str_at(model, "script"));
            content
                + &element(
                    "div",
                    &json!({"class":"crudui-widget crudui-widget--search"}),
                    &(affix(&model["prepend"], true)
                        + &control(model, true)
                        + &affix(&model["append"], true)),
                )
        }
        "button" => {
            script(str_at(model, "script"))
                + &element("input", &model["extra"]["hidden"], "")
                + &element("input", &model["attrs"], "")
        }
        _ => String::new(),
    }
}

fn classes(parts: &[&str]) -> String {
    parts
        .iter()
        .filter(|part| !part.is_empty())
        .copied()
        .collect::<Vec<_>>()
        .join(" ")
}

/// A present model part as text: strings verbatim, other values as JavaScript strings.
fn part_text(value: &Value) -> String {
    escape(&js_string(value))
}

/// One control group of `data-crudui-action` buttons.
fn controls(controls: &Value) -> String {
    let buttons = controls["actions"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|action| {
            let mut attrs = json!({"type":"button","class":"crudui-action","data-crudui-action":action["name"],"aria-label":action["label"]});
            if action["disabled"] == true {
                attrs["disabled"] = "".into();
            }
            element("button", &attrs, "")
        })
        .collect::<String>();
    element(
        "div",
        &json!({"class":"crudui-controls","role":"group","aria-label":controls["label"]}),
        &buttons,
    )
}

fn header(node: &Value) -> String {
    let header = &node["header"];
    let mut parts = String::new();
    if node["collapsible"] == true {
        let mut attrs = json!({"type":"button","class":"crudui-action","data-crudui-action":"toggle-row",
            "aria-expanded": (node["expanded"] == true).to_string()});
        if let Some(id) = node["body"]["id"].as_str() {
            attrs["aria-controls"] = id.into();
        }
        if let Some(label) = node["toggleLabel"].as_str() {
            attrs["aria-label"] = label.into();
        }
        parts += &element("button", &attrs, "");
    }
    if let Some(label) = header.get("label") {
        parts += &match header.get("labelFor").and_then(Value::as_str) {
            Some(target) if !target.is_empty() => element(
                "label",
                &json!({"class":"crudui-node__label","for":target}),
                &part_text(label),
            ),
            _ => element(
                "span",
                &json!({"class":"crudui-node__label"}),
                &part_text(label),
            ),
        };
    }
    if let Some(description) = header.get("description") {
        parts += &element(
            "p",
            &json!({"class":"crudui-node__description"}),
            &part_text(description),
        );
    }
    for key in ["number", "title"] {
        if let Some(value) = header.get(key) {
            parts += &element(
                "span",
                &json!({"class":format!("crudui-node__{key}")}),
                &part_text(value),
            );
        }
    }
    if let Some(summary) = header.get("summary") {
        let mut attrs = json!({"class":"crudui-node__summary"});
        if node["expanded"] == true {
            attrs["hidden"] = "".into();
        }
        parts += &element("span", &attrs, &part_text(summary));
    }
    if let Some(count) = header.get("count") {
        parts += &element(
            "span",
            &json!({"class":"crudui-node__count"}),
            &part_text(count),
        );
    }
    if node["controls"]["placement"] == "header" {
        parts += &controls(&node["controls"]);
    }
    if parts.is_empty() {
        return String::new();
    }
    element(
        "div",
        &json!({"class":classes(&["crudui-node__header", str_at(header, "className")]),"style":str_at(header, "style")}),
        &parts,
    )
}

fn body(node: &Value) -> String {
    let body = &node["body"];
    let mut attrs = json!({"class":classes(&["crudui-node__body", str_at(body, "className")]),"style":str_at(body, "style")});
    if let Some(id) = body["id"].as_str().filter(|id| !id.is_empty()) {
        attrs["id"] = id.into();
    }
    if node["collapsible"] == true && node["expanded"] != true {
        attrs["hidden"] = "".into();
    }
    let content = if node["checkbox"].is_object() {
        let checkbox = &node["checkbox"];
        let mut input = json!({"class":checkbox["className"],"id":checkbox["id"],"name":checkbox["name"],"type":"checkbox","value":"1"});
        if checkbox["checked"] == true {
            input["checked"] = "".into();
        }
        element("input", &input, "")
            + &element(
                "label",
                &json!({"for":checkbox["id"]}),
                &escape(str_at(checkbox, "caption")),
            )
    } else if node.get("widget").is_some() {
        widget(&node["widget"])
    } else {
        nodes(&node["children"])
    };
    element("div", &attrs, &content)
}

/// Render one node of the recursive form grammar.
fn node(node: &Value) -> String {
    let kind = str_at(node, "kind");
    let modifier = format!("crudui-node--{kind}");
    let sticky = if node["sticky"] == true {
        "crudui-node--sticky"
    } else {
        ""
    };
    // A sticky row carries its depth on the root; the stylesheet derives its sticky line from it.
    let depth = if node["sticky"] == true {
        format!(
            "--crudui-sticky-depth: {}",
            node["stickyDepth"].as_u64().unwrap_or(0)
        )
    } else {
        String::new()
    };
    let style = [str_at(node, "style"), depth.as_str()]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("; ");
    let mut attrs = json!({"class":classes(&["crudui-node", &modifier, sticky, str_at(node, "className")]),"style":style});
    if kind != "row" && kind != "lang-item" {
        if let Some(path) = node.get("path") {
            attrs["data-field-path"] = js_string(path).into();
        }
    }
    if let Some(key) = node.get("key") {
        attrs["data-crudui-row-key"] = js_string(key).into();
    }
    if let Some(lang) = node.get("lang") {
        attrs["data-lang"] = js_string(lang).into();
    }
    if node["hidden"] == true {
        attrs["hidden"] = "".into();
    }
    let footer = if node["controls"]["placement"] == "footer" {
        element(
            "div",
            &json!({"class":"crudui-node__footer"}),
            &controls(&node["controls"]),
        )
    } else {
        String::new()
    };
    element("div", &attrs, &(header(node) + &body(node) + &footer))
}

fn nodes(nodes: &Value) -> String {
    nodes.as_array().into_iter().flatten().map(node).collect()
}

pub(crate) fn render_fields(fields: &[Value]) -> String {
    element(
        "div",
        &json!({"class":"crudui-form"}),
        &element(
            "div",
            &json!({"class":"crudui-form__body"}),
            &fields.iter().map(node).collect::<String>(),
        ),
    )
}

/// Render fields and the form buttons for a record as form HTML.
pub(crate) fn render_form_html(
    fields: &[Value],
    template: &crate::FormTemplate,
    data: &Value,
    language: &str,
) -> FormResult<String> {
    let messages = crate::messages::form_messages(language)?;
    let body = render_fields(fields);
    let footer = element(
        "div",
        &json!({"class":"crudui-form__footer"}),
        &element(
            "div",
            &json!({"class":"crudui-controls","role":"group","aria-label":messages.form_actions}),
            &crate::buttons::form_buttons_html(&template.buttons, data, language, messages),
        ),
    );
    Ok(format!(
        "{}{footer}</div>",
        body.strip_suffix("</div>")
            .expect("form markup ends with its closing tag")
    ))
}

/// Render an instance as HTML without executing scripts or browser operations.
pub fn render_form(form: &Form) -> FormResult<String> {
    render_form_html(
        form.fields(),
        form.template(),
        &form.get_data(),
        form.language(),
    )
}
