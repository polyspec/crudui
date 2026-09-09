use serde_json::{json, Map, Value};

use crate::util::{join_class, scalar, style};
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

fn raw_attribute(value: &str) -> String {
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
            &json!({"class":"form-element-unsupported","data-unsupported-type":model["type"]}),
            "",
        );
    }
    match str_at(model, "layout") {
        "input-group" => element(
            "div",
            &json!({"class":"input-group"}),
            &(affix(&model["prepend"], has_events(&model["attrs"]))
                + &control(model, false)
                + &affix(&model["append"], has_events(&model["attrs"]))),
        ),
        "bare" => control(model, false),
        "host-script" => control(model, false) + &script(str_at(model, "script")),
        "btn-group" => {
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
                    attrs.insert("class".into(), "valid-target btn-check".into());
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
                    &json!({"class":"btn btn-search btn-file-search","type":"button"}),
                    "&nbsp;",
                );
            }
            element("div", &json!({"class":"input-group"}), &content)
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
                    &json!({"class":"input-group field-search"}),
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

fn buttons(model: &Value) -> String {
    let multiple = &model["multiple"];
    let button = |class: &str| element("button", &json!({"type":"button","class":class}), " ");
    let mut result = String::new();
    if multiple["sortable"] == true {
        result += &button("btn btn-move-up");
        result += &button("btn btn-move-down");
    }
    let mut attrs = json!({"type":"button","class":"btn btn-plus"});
    if let Some(max) = multiple.get("max") {
        attrs["data-multiple-max"] = scalar(Some(max)).into();
    }
    result += &element("button", &attrs, " ");
    if multiple["copy"] == true {
        result += &button("btn btn-copy");
    }
    result
        + &button(if multiple["copy"] == true {
            "btn btn-minus btn-delete"
        } else {
            "btn btn-minus"
        })
}

fn description(model: &Value) -> String {
    let description = str_at(model, "description");
    if description.is_empty() {
        String::new()
    } else {
        element("p", &json!({"class":"description"}), &escape(description))
    }
}

fn field(model: &Value) -> String {
    let design = &model["design"];
    let hidden = if design["show"] == false {
        "display: none"
    } else {
        ""
    };
    let inline = [hidden, str_at(&design["wrapper"], "style")]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("; ");
    let mut attrs = appearance_attrs(
        join_class(&["form-element-wrapper", str_at(&design["wrapper"], "class")]),
        &inline,
    );
    attrs["data-field-path"] = model["path"].clone();
    if let Some(style) = attrs
        .as_object_mut()
        .and_then(|attrs| attrs.shift_remove("style"))
    {
        attrs["style"] = style;
    }
    let group_class = join_class(&["input-group-wrapper", str_at(&design["wrapper"], "class")]);
    let group_attrs = json!({"class":group_class,"data-uniqid":model["uniqid"]});
    if model["checkbox"] == true {
        let mut input_attrs = json!({"class":model["checkboxClass"],"id":model["checkboxId"],"name":model["checkboxName"],"type":"checkbox","value":"1"});
        if model["checkboxChecked"] == true {
            input_attrs["checked"] = "".into();
        }
        let content = element("input", &input_attrs, "")
            + &element(
                "label",
                &json!({"for":model["checkboxId"]}),
                &escape(str_at(model, "label")),
            );
        let heading = element(
            "h6",
            &json!({}),
            &element("div", &group_attrs, &element("div", &json!({}), &content)),
        );
        return element(
            "div",
            &attrs,
            &element(
                "div",
                &json!({"class":"checkbox"}),
                &(heading + &description(model)),
            ),
        );
    }
    let mut content = String::new();
    if !str_at(model, "label").is_empty() && model["omitLabel"] != true {
        let mut label = escape(str_at(model, "label"));
        let widget = &model["widget"];
        if let Some(id) = widget["extra"]["file"]["id"]
            .as_str()
            .or_else(|| widget["attrs"]["id"].as_str())
        {
            label = element("label", &json!({"for":id}), &label);
        }
        content += &element(
            "h6",
            &appearance_attrs(
                str_at(&design["label"], "class").into(),
                str_at(&design["label"], "style"),
            ),
            &label,
        );
    }
    content += &description(model);
    let body = match str_at(model, "shape") {
        "group" => element(
            "div",
            &group_attrs,
            &element(
                "div",
                &appearance_attrs(
                    str_at(model, "groupClass").into(),
                    str_at(model, "groupStyle"),
                ),
                &fields_value(&model["children"]),
            ),
        ),
        "multiple-group" | "multiple-leaf" => {
            let rows = model["rows"].as_array().map(Vec::as_slice).unwrap_or(&[]);
            if rows.is_empty() {
                element(
                    "button",
                    &json!({"type":"button","class":"btn btn-plus","aria-label":"+"}),
                    " ",
                )
            } else {
                rows.iter()
                    .map(|row| {
                        let body = if model["shape"] == "multiple-group" {
                            element(
                                "div",
                                &json!({"class":row["groupClass"]}),
                                &fields_value(&row["children"]),
                            ) + &element(
                                "span",
                                &json!({"class":"btn-group input-group-btn"}),
                                &buttons(model),
                            )
                        } else {
                            widget(&row["widget"]) + &buttons(model)
                        };
                        element(
                            "div",
                            &json!({"class":row["wrapperClass"],"data-uniqid":row["uniqid"]}),
                            &body,
                        )
                    })
                    .collect()
            }
        }
        "lang" => {
            let language = &model["lang"];
            let mut body = String::new();
            if !str_at(language, "title").is_empty() {
                body += &element(
                    "div",
                    &json!({"class":"lang-title"}),
                    &escape(str_at(language, "title")),
                );
            }
            for child in language["children"].as_array().into_iter().flatten() {
                body += &element(
                    "div",
                    &json!({"class":"lang-child","data-lang":child["code"]}),
                    &(element(
                        "span",
                        &json!({"class":"input-group-text lang-code"}),
                        &escape(str_at(child, "code")),
                    ) + &widget(&child["widget"])),
                );
            }
            element(
                "div",
                &group_attrs,
                &element("div", &json!({"class":language["groupClass"]}), &body),
            )
        }
        _ => element("div", &group_attrs, &widget(&model["widget"])),
    };
    content += &element("div", &json!({"class":"form-element"}), &body);
    element("div", &attrs, &content)
}

fn fields_value(fields: &Value) -> String {
    fields.as_array().into_iter().flatten().map(field).collect()
}

pub(crate) fn render_fields(fields: &[Value]) -> String {
    element(
        "div",
        &json!({"class":"form-group"}),
        &fields.iter().map(field).collect::<String>(),
    )
}

/// Render an instance as HTML without executing scripts or browser operations.
pub fn render_form(form: &Form) -> FormResult<String> {
    Ok(render_fields(form.fields()))
}
