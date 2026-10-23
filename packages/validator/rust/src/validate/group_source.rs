//! Choices from a repeated group (schema.md, "Choices from a repeated group").
//!
//! A choice field whose `items` is a group source `{ from, label? }` takes its choices from
//! the rows of a repeated group of the same form. This module checks the declaration and
//! reads the choices from the data; the generator lists them and the validator checks a
//! value against them (validation-rules.md, "Values").

use serde_json::{Map, Value};
use std::collections::HashSet;

use super::canonical::canonical_text;
use super::whitespace::trim;

/// The field types that take a group source.
const CHOICE_TYPES: [&str; 8] = [
    "select",
    "dropdown",
    "selectbox",
    "choice",
    "radio",
    "multichoice",
    "checkboxes",
    "checkcontainer",
];

/// One choice of a group source: the canonical text of a row's value and its label text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GroupChoice {
    /// The canonical text of the row's value field.
    pub value: String,
    /// The canonical text of the row's label field, or the value when it gives none.
    pub label: String,
}

/// Whether `items` is a group source: an object with the member `from`.
pub fn is_group_source(items: &Value) -> bool {
    items
        .as_object()
        .is_some_and(|members| members.contains_key("from"))
}

/// Whether a field repeats: `multiple` is `true`, `only` or a settings object.
fn repeated(field: &Value) -> bool {
    matches!(
        field.get("multiple"),
        Some(Value::Bool(true)) | Some(Value::Object(_))
    ) || field.get("multiple").and_then(Value::as_str) == Some("only")
}

/// Whether a field declares a language: `lang` is `true` or an object.
fn has_lang(field: &Value) -> bool {
    matches!(
        field.get("lang"),
        Some(Value::Bool(true)) | Some(Value::Object(_))
    )
}

/// Whether `child` renders one scalar value: an object whose type is not `group`, that has no
/// `properties` member, is not repeated and has no `lang`.
pub fn scalar_child(child: &Value) -> bool {
    child.is_object()
        && child
            .get("type")
            .is_none_or(|kind| kind.as_str() != Some("group"))
        && child.get("properties").is_none()
        && !repeated(child)
        && !has_lang(child)
}

/// The properties of the repeated group that `from` names under the root `properties`, when
/// `from` is `{group}.*.{field}` with `field` a scalar child of that group, every group of the
/// path a group field with properties, and only the last one repeated.
fn source_group<'a>(from: &str, root: &'a Map<String, Value>) -> Option<&'a Map<String, Value>> {
    let segments: Vec<&str> = from.split('.').collect();
    let count = segments.len();
    if count < 3 || segments[count - 2] != "*" {
        return None;
    }
    let names = &segments[..count - 2];
    let mut current = root;
    for (index, name) in names.iter().enumerate() {
        let field = current.get(*name)?;
        if field.get("type").and_then(Value::as_str) != Some("group") {
            return None;
        }
        let properties = field.get("properties").and_then(Value::as_object)?;
        if repeated(field) != (index == names.len() - 1) {
            return None;
        }
        current = properties;
    }
    current
        .get(segments[count - 1])
        .filter(|child| scalar_child(child))
        .map(|_| current)
}

/// The message of the expected `from` of a group source, the same for every rule it breaks.
fn from_message(path: &str) -> String {
    format!(
        "Invalid items.from at {path}: expected {{group}}.*.{{field}} for a field of a repeated group outside repeated groups"
    )
}

/// The message of a `label` that is not a scalar child of its group.
fn label_message(path: &str) -> String {
    format!(
        "Invalid items.label at {path}: expected the name of a direct child field of the group without multiple, properties or lang"
    )
}

/// The message of the first rule that the group source of `field` at the declaration `path`
/// breaks under the root `properties`, or `None`. The members of `items` are checked in
/// declaration order, then the field, then `from` and then `label`.
pub fn group_source_failure(
    field: &Value,
    path: &str,
    root: &Map<String, Value>,
) -> Option<String> {
    let items = field
        .get("items")
        .filter(|items| is_group_source(items))?;
    let members = items.as_object()?;
    if let Some(key) = members.keys().find(|key| *key != "from" && *key != "label") {
        return Some(format!("Invalid items.{key} at {path}: unknown key"));
    }
    let is_choice = field
        .get("type")
        .and_then(Value::as_str)
        .is_some_and(|kind| CHOICE_TYPES.contains(&kind));
    if !is_choice || has_lang(field) {
        return Some(format!(
            "Invalid items.from at {path}: expected a choice field without lang"
        ));
    }
    let Some(group) = members
        .get("from")
        .and_then(Value::as_str)
        .and_then(|from| source_group(from, root))
    else {
        return Some(from_message(path));
    };
    let label_ok = match members.get("label") {
        None => true,
        Some(label) => label
            .as_str()
            .is_some_and(|name| group.get(name).is_some_and(scalar_child)),
    };
    if label_ok {
        None
    } else {
        Some(label_message(path))
    }
}

/// The canonical text of a string or a number whose text is not empty after trimming.
fn choice_text(value: Option<&Value>) -> Option<String> {
    let value = value.filter(|value| value.is_string() || value.is_number())?;
    let text = canonical_text(value)?;
    if trim(&text).is_empty() {
        None
    } else {
        Some(text.into_owned())
    }
}

/// The choices of a group source for the root `data`: one per row of the group in data order
/// whose value gives a non-empty canonical text, each value once, labelled with the text of its
/// `label` field or else its value. A group missing from the data gives no choices.
///
/// `items` must have passed [`group_source_failure`]; a source whose `from` or `label` is not
/// of the declared shape gives the message of its declaration failure, located at `path`.
pub fn group_choices(items: &Value, data: &Value, path: &str) -> Result<Vec<GroupChoice>, String> {
    let members = items.as_object().ok_or_else(|| from_message(path))?;
    let from = members
        .get("from")
        .and_then(Value::as_str)
        .ok_or_else(|| from_message(path))?;
    let segments: Vec<&str> = from.split('.').collect();
    let count = segments.len();
    if count < 3 || segments[count - 2] != "*" {
        return Err(from_message(path));
    }
    let label_name = match members.get("label") {
        None => None,
        Some(Value::String(name)) => Some(name.as_str()),
        Some(_) => return Err(label_message(path)),
    };
    let value_name = segments[count - 1];
    let mut rows = data;
    for name in &segments[..count - 2] {
        match rows.as_object().and_then(|object| object.get(*name)) {
            Some(next) => rows = next,
            None => return Ok(Vec::new()),
        }
    }
    let Some(rows) = rows.as_object() else {
        return Ok(Vec::new());
    };
    let mut choices = Vec::new();
    let mut seen = HashSet::new();
    for row in rows.values() {
        let Some(row) = row.as_object() else {
            continue;
        };
        let Some(value) = choice_text(row.get(value_name)) else {
            continue;
        };
        if !seen.insert(value.clone()) {
            continue;
        }
        let label = label_name
            .and_then(|name| choice_text(row.get(name)))
            .unwrap_or_else(|| value.clone());
        choices.push(GroupChoice { value, label });
    }
    Ok(choices)
}
