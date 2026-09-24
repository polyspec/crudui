//! Declaration rules of composed list and detail specifications (docs/spec/display-formats.md).

use serde_json::{Map, Value};

use crate::list::check_pagination_declaration;
use crate::template::check_design_declaration;
use crate::{FormError, FormResult};

const LIST_KEYS: &[&str] = &[
    "columns",
    "search",
    "sort",
    "pagination",
    "actions",
    "empty",
    "design",
];
const DETAIL_KEYS: &[&str] = &["fields", "design"];
const COLUMN_KEYS: &[&str] = &["field", "label", "format", "design", "sortable"];
const FIELD_KEYS: &[&str] = &["field", "label", "format", "design"];
const SORT_KEYS: &[&str] = &["field", "dir"];
const SCRIPT_ACTION_KEYS: &[&str] = &["label", "script"];
const ACTION_KEYS: &[&str] = &["label", "format", "behavior", "design"];
const BEHAVIOR_KEYS: &[&str] = &["onchange", "onclick", "onload"];
const FORMAT_STRINGS: &[&str] = &["type", "pattern", "target", "as"];
const FORMAT_CONTENT: &[&str] = &["prefix", "suffix", "text", "true", "false", "alt"];
const CONTENT: &str = "a string, a language map or null";

/// A string, a language map (a non-empty object of strings or null) or null.
fn is_content(value: &Value) -> bool {
    match value {
        Value::Null | Value::String(_) => true,
        Value::Object(map) => {
            !map.is_empty()
                && map
                    .values()
                    .all(|entry| entry.is_null() || entry.is_string())
        }
        _ => false,
    }
}

/// A condition map: an object with at least one member.
fn is_condition_map(value: &Value) -> bool {
    value.as_object().is_some_and(|map| !map.is_empty())
}

fn expected(key: &str, path: &str, what: &str) -> FormResult<()> {
    Err(FormError::input(format!(
        "Invalid {key} at {path}: expected {what}"
    )))
}

/// Reject the first member of `object`, in member order, that `allowed` does not list.
fn reject_unknown(
    object: &Map<String, Value>,
    prefix: &str,
    allowed: &[&str],
    path: &str,
) -> FormResult<()> {
    match object.keys().find(|key| !allowed.contains(&key.as_str())) {
        Some(key) => Err(FormError::input(format!(
            "Invalid {prefix}{key} at {path}: unknown key"
        ))),
        None => Ok(()),
    }
}

/// Check a cell format declaration at `path`.
fn check_format(format: &Value, path: &str) -> FormResult<()> {
    let settings = match format {
        Value::Bool(_) | Value::String(_) => return Ok(()),
        Value::Object(settings) => settings,
        _ => return expected("format", path, "a boolean, a string or an object"),
    };
    for (key, value) in settings {
        let key = key.as_str();
        if FORMAT_STRINGS.contains(&key) {
            if !value.is_string() {
                return expected(&format!("format.{key}"), path, "a string");
            }
        } else if FORMAT_CONTENT.contains(&key) {
            if !is_content(value) {
                return expected(&format!("format.{key}"), path, CONTENT);
            }
        } else if key == "map" {
            let Some(labels) = value.as_object() else {
                return expected("format.map", path, "an object");
            };
            if let Some((name, _)) = labels.iter().find(|(_, label)| !is_content(label)) {
                return expected(&format!("format.map.{name}"), path, CONTENT);
            }
        } else if key == "href" {
            if !value.is_string() && !is_condition_map(value) {
                return expected("format.href", path, "a string or a condition map");
            }
        } else if key == "items" && !value.is_array() && !value.is_object() {
            return expected("format.items", path, "an array or an object");
        }
    }
    Ok(())
}

/// Check one column or field declaration.
fn check_member(name: &str, member: &Value, own: &str, members: &str) -> FormResult<()> {
    let Some(member) = member.as_object() else {
        return expected(name, members, "an object");
    };
    let path = format!("{members}.{name}");
    reject_unknown(
        member,
        "",
        if own == "list" {
            COLUMN_KEYS
        } else {
            FIELD_KEYS
        },
        &path,
    )?;
    if member.get("field").is_some_and(|field| !field.is_string()) {
        return expected("field", &path, "a string");
    }
    if member.get("label").is_some_and(|label| !is_content(label)) {
        return expected("label", &path, CONTENT);
    }
    if let Some(format) = member.get("format") {
        check_format(format, &path)?;
    }
    if let Some(design) = member.get("design") {
        check_design_declaration(design, &path)?;
    }
    if member.get("sortable").is_some_and(|sortable| {
        !sortable.is_boolean() && !sortable.is_string() && !is_condition_map(sortable)
    }) {
        return expected(
            "sortable",
            &path,
            "a boolean, an expression or a condition map",
        );
    }
    Ok(())
}

/// Check one behavior entry of an action at `path`.
fn check_behavior_entry(event: &str, entry: &Value, path: &str) -> FormResult<()> {
    let entry = match entry {
        Value::String(_) => return Ok(()),
        Value::Object(entry) => entry,
        _ => return expected(&format!("behavior.{event}"), path, "a script or an object"),
    };
    reject_unknown(
        entry,
        &format!("behavior.{event}."),
        SCRIPT_ACTION_KEYS,
        path,
    )?;
    if entry.get("label").is_some_and(|label| !is_content(label)) {
        return expected(&format!("behavior.{event}.label"), path, CONTENT);
    }
    if entry
        .get("script")
        .is_some_and(|script| !script.is_string())
    {
        return expected(&format!("behavior.{event}.script"), path, "a string");
    }
    Ok(())
}

/// Check one list action at `actions.{name}`.
fn check_action(name: &str, action: &Value) -> FormResult<()> {
    let action = match action {
        Value::String(_) => return Ok(()),
        Value::Object(action) => action,
        _ => return expected(name, "actions", "a script or an object"),
    };
    let path = format!("actions.{name}");
    if let Some(script) = action.get("script") {
        reject_unknown(action, "", SCRIPT_ACTION_KEYS, &path)?;
        if action.get("label").is_some_and(|label| !is_content(label)) {
            return expected("label", &path, CONTENT);
        }
        if !script.is_string() {
            return expected("script", &path, "a string");
        }
        return Ok(());
    }
    reject_unknown(action, "", ACTION_KEYS, &path)?;
    if action.get("label").is_some_and(|label| !is_content(label)) {
        return expected("label", &path, CONTENT);
    }
    if let Some(format) = action.get("format") {
        check_format(format, &path)?;
    }
    if let Some(behavior) = action.get("behavior") {
        match behavior {
            Value::Bool(_) => {}
            Value::Object(behavior) => {
                reject_unknown(behavior, "behavior.", BEHAVIOR_KEYS, &path)?;
                for (event, entry) in behavior {
                    check_behavior_entry(event, entry, &path)?;
                }
            }
            _ => return expected("behavior", &path, "a boolean or an object"),
        }
    }
    if let Some(design) = action.get("design") {
        check_design_declaration(design, &path)?;
    }
    Ok(())
}

/// Check a composed list or detail specification: the root members, the own design, each
/// column or field in member order and, for a list, search, sort, actions, empty and pagination.
/// `own` is `list` or `detail` and `members` is `columns` or `fields`.
pub(crate) fn check_display_declarations(spec: &Value, own: &str, members: &str) -> FormResult<()> {
    let allowed = if own == "list" {
        LIST_KEYS
    } else {
        DETAIL_KEYS
    };
    for key in spec.as_object().into_iter().flat_map(Map::keys) {
        if key == "$ref" || key == "$patch" {
            return expected(key, own, &format!("composition inside {members}"));
        }
        if !allowed.contains(&key.as_str()) {
            return Err(FormError::input(format!(
                "Invalid {key} at {own}: unknown key"
            )));
        }
    }
    if let Some(design) = spec.get("design") {
        check_design_declaration(design, own)?;
    }
    for (name, member) in spec
        .get(members)
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
    {
        check_member(name, member, own, members)?;
    }
    if own == "detail" {
        return Ok(());
    }
    if spec
        .get("search")
        .is_some_and(|search| !search.is_boolean() && !search.is_object())
    {
        return expected("search", own, "a boolean or an object");
    }
    if let Some(sort) = spec.get("sort") {
        let Some(sort) = sort.as_object() else {
            return expected("sort", own, "an object");
        };
        reject_unknown(sort, "sort.", SORT_KEYS, own)?;
        if sort.get("field").is_some_and(|field| !field.is_string()) {
            return expected("sort.field", own, "a string");
        }
        if sort
            .get("dir")
            .is_some_and(|dir| *dir != "asc" && *dir != "desc")
        {
            return expected("sort.dir", own, "asc or desc");
        }
    }
    if let Some(actions) = spec.get("actions") {
        let Some(actions) = actions.as_object() else {
            return expected("actions", own, "an object");
        };
        for (name, action) in actions {
            // Actions are not composed: a composition key is not an action name.
            if name == "$ref" || name == "$patch" {
                return Err(FormError::input(format!(
                    "Invalid {name} at actions: unknown key"
                )));
            }
            check_action(name, action)?;
        }
    }
    if spec.get("empty").is_some_and(|empty| !is_content(empty)) {
        return expected("empty", own, CONTENT);
    }
    if let Some(pagination) = spec.get("pagination") {
        check_pagination_declaration(pagination, own)?;
    }
    Ok(())
}
