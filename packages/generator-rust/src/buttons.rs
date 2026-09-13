//! Form buttons: the actions a spec declares with root `buttons`, rendered in the form footer.

use crate::css::style_string;
use crate::design::resolve_design;
use crate::messages::Messages;
use crate::render::{raw_attribute, raw_text};
use crate::util::translate;
use serde_json::{Map, Value};

/// Button types a spec can declare. A link renders an anchor.
pub(crate) const FORM_BUTTON_TYPES: [&str; 4] = ["submit", "reset", "button", "link"];

/// The interface text of a button type; only submit and reset have one.
pub(crate) fn button_text(messages: &Messages, kind: &str) -> &'static str {
    match kind {
        "submit" => messages.submit,
        "reset" => messages.reset,
        _ => "",
    }
}

/// The declared content, or the interface text when there is none.
fn button_label(button: &Map<String, Value>, language: &str, fallback: &str) -> String {
    match button.get("text") {
        Some(Value::String(text)) => text.clone(),
        Some(text @ Value::Object(_)) => {
            let label = translate(Some(text), language);
            if label.is_empty() { fallback.into() } else { label }
        }
        _ => fallback.into(),
    }
}

/// A non-empty behavior script: a string or the script of a `{ label, script }` action.
fn button_script(button: &Map<String, Value>, action: &str) -> String {
    let value = button.get("behavior").map_or(&Value::Null, |b| &b[action]);
    value.as_str().or_else(|| value["script"].as_str()).unwrap_or("").into()
}

/// Render the form buttons for a record; every implementation emits this markup.
pub(crate) fn form_buttons_html(buttons: &[Map<String, Value>], data: &Value, language: &str, messages: &Messages) -> String {
    buttons
        .iter()
        .map(|button| {
            let kind = button.get("type").and_then(Value::as_str).unwrap_or("");
            let design = resolve_design(button.get("design"), data, "");
            let tag = if kind == "link" { "a" } else { "button" };
            let mut attrs: Vec<(&str, String)> = Vec::new();
            if kind != "link" {
                attrs.push(("type", kind.into()));
            }
            let class = design["main"]["class"].as_str().unwrap_or("");
            attrs.push(("class", if class.is_empty() { "crudui-action crudui-action--text".into() } else { format!("crudui-action crudui-action--text {class}") }));
            let style = style_string(design["main"]["style"].as_str().unwrap_or(""));
            if !style.is_empty() {
                attrs.push(("style", style));
            }
            for name in ["name", "value", "href"] {
                if let Some(value) = button.get(name).and_then(Value::as_str) {
                    attrs.push((name, value.into()));
                }
            }
            let script = button_script(button, "onclick");
            if !script.is_empty() {
                attrs.push(("onclick", script));
            }
            let attributes = attrs.iter().map(|(name, value)| format!(" {name}=\"{}\"", raw_attribute(value))).collect::<String>();
            format!("<{tag}{attributes}>{}</{tag}>", raw_text(&button_label(button, language, button_text(messages, kind))))
        })
        .collect()
}
