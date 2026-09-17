use crate::{FormError, FormResult};
use crudui_validator::compose::{
    compose_properties, member_ordered, member_ordered_map, ComposeOptions, FileLoader,
    MemoryLoader,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// One data-independent field definition.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FieldTemplate {
    /// Property name relative to its parent group.
    pub name: String,
    /// Composed field settings without child properties.
    pub spec: Map<String, Value>,
    /// Child field definitions, stored once for repeated groups.
    pub children: Vec<FieldTemplate>,
}

/// A JSON-serializable form structure without record data.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FormTemplate {
    /// Template format identifier.
    pub kind: String,
    /// Optional root prefix for input names.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_prefix: Option<String>,
    /// Top-level field definitions.
    pub fields: Vec<FieldTemplate>,
    /// Form buttons in declaration order; one submit button when the spec declares none.
    pub buttons: Vec<Map<String, Value>>,
    /// Submission target declared by the spec, kept for the application.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<Map<String, Value>>,
}

/// Inputs used only during structure compilation.
#[derive(Default)]
pub struct CompileOptions<'a> {
    /// Parsed documents indexed by their composition paths.
    pub files: Map<String, Value>,
    /// Optional explicit document loader.
    pub loader: Option<&'a dyn FileLoader>,
    /// Directory for resolving relative references.
    pub basepath: String,
    /// Root prefix for input names.
    pub key_prefix: Option<String>,
}

/// A string, or a condition map: a non-empty object.
fn condition_value(value: &Value) -> bool {
    value.is_string() || value.as_object().is_some_and(|map| !map.is_empty())
}

/// A child that renders one scalar value: not repeated, not a group and not a language field.
fn scalar_child(child: &Value) -> bool {
    let Some(child) = child.as_object() else {
        return false;
    };
    let enabled = |key: &str| child.get(key).is_some_and(|v| *v == true || v.is_object());
    child.get("type").is_none_or(|t| t != "group")
        && !child.contains_key("properties")
        && !enabled("multiple")
        && !enabled("lang")
}

/// Allowed keys of the closed `multiple` bucket.
const MULTIPLE_KEYS: &[&str] = &[
    "min", "max", "copy", "sortable", "title", "controls", "header", "onclick",
];
/// Allowed keys of the closed `lang` bucket.
const LANG_KEYS: &[&str] = &[
    "mode",
    "only",
    "name",
    "key",
    "frame",
    "title",
    "group_class",
];
/// Allowed keys of the closed `design` bucket.
const DESIGN_KEYS: &[&str] = &[
    "show", "class", "style", "label", "wrapper", "group", "prepend",
];
/// Allowed keys of a closed design node.
const DESIGN_NODE_KEYS: &[&str] = &["class", "style"];
/// Allowed keys of the closed `behavior` bucket.
const BEHAVIOR_KEYS: &[&str] = &["onchange", "onclick", "onload"];

/// Reject the first key of a closed bucket that the bucket does not allow.
pub(crate) fn check_known_keys(
    bucket: &str,
    settings: &Map<String, Value>,
    allowed: &[&str],
    path: &str,
) -> FormResult<()> {
    match settings.keys().find(|key| !allowed.contains(&key.as_str())) {
        Some(key) => Err(FormError::input(format!(
            "Invalid {bucket}.{key} at {path}: unknown key"
        ))),
        None => Ok(()),
    }
}

/// Reject an unknown key or a wrong value type in one `design` declaration at `path`. Form
/// fields, list and detail specifications, their columns and fields share this rule.
pub(crate) fn check_design_declaration(design: &Value, path: &str) -> FormResult<()> {
    let fail = |key: &str, expected: &str| -> FormResult<()> {
        Err(FormError::input(format!(
            "Invalid {key} at {path}: expected {expected}"
        )))
    };
    if !design.is_boolean() && !design.is_object() {
        return fail("design", "a boolean or an object");
    }
    let Some(design) = design.as_object() else {
        return Ok(());
    };
    check_known_keys("design", design, DESIGN_KEYS, path)?;
    if design
        .get("show")
        .is_some_and(|v| !v.is_boolean() && !condition_value(v))
    {
        return fail("design.show", "an expression, a boolean or a condition map");
    }
    for key in ["class", "style"] {
        if design.get(key).is_some_and(|v| !condition_value(v)) {
            return fail(&format!("design.{key}"), "a string or a condition map");
        }
    }
    for node in ["label", "wrapper", "group", "prepend"] {
        let Some(value) = design.get(node) else {
            continue;
        };
        let Some(value) = value.as_object() else {
            return fail(&format!("design.{node}"), "an object");
        };
        check_known_keys(&format!("design.{node}"), value, DESIGN_NODE_KEYS, path)?;
        for key in ["class", "style"] {
            if value.get(key).is_some_and(|v| !condition_value(v)) {
                return fail(
                    &format!("design.{node}.{key}"),
                    "a string or a condition map",
                );
            }
        }
    }
    Ok(())
}

/// Reject a wrong value type or an unknown key in one field's `multiple`, `lang`,
/// `design` and `behavior` declarations.
fn check_declarations(spec: &Map<String, Value>, path: &str) -> FormResult<()> {
    let fail = |key: &str, expected: &str| -> FormResult<()> {
        Err(FormError::input(format!(
            "Invalid {key} at {path}: expected {expected}"
        )))
    };
    // Buttons and the submission target belong to the form, not to a field.
    for key in ["buttons", "action"] {
        if spec.contains_key(key) {
            return fail(key, "the form root");
        }
    }
    if let Some(multiple) = spec.get("multiple") {
        if !multiple.is_boolean() && !multiple.is_object() {
            return fail("multiple", "a boolean or an object");
        }
        if let Some(settings) = multiple.as_object() {
            check_known_keys("multiple", settings, MULTIPLE_KEYS, path)?;
            for key in ["min", "max"] {
                if settings.get(key).is_some_and(|v| !v.is_number()) {
                    return fail(&format!("multiple.{key}"), "a number");
                }
            }
            for key in ["copy", "sortable"] {
                if settings.get(key).is_some_and(|v| !v.is_boolean()) {
                    return fail(&format!("multiple.{key}"), "a boolean");
                }
            }
            if let Some(title) = settings.get("title") {
                if spec.get("type").is_none_or(|t| t != "group") {
                    return fail("multiple.title", "a repeated group");
                }
                let child = title.as_str().and_then(|name| {
                    spec.get("properties")
                        .and_then(Value::as_object)
                        .and_then(|properties| properties.get(name))
                });
                if !child.is_some_and(scalar_child) {
                    return fail(
                        "multiple.title",
                        "the name of a direct child field without multiple, properties or lang",
                    );
                }
            }
            if settings
                .get("controls")
                .is_some_and(|v| !["header", "footer", "outline"].iter().any(|p| v == p))
            {
                return fail("multiple.controls", "header, footer or outline");
            }
            if settings
                .get("header")
                .is_some_and(|v| !["static", "sticky"].iter().any(|p| v == p))
            {
                return fail("multiple.header", "static or sticky");
            }
        }
    }
    if spec
        .get("lang")
        .is_some_and(|v| !v.is_boolean() && !v.is_object())
    {
        return fail("lang", "a boolean or an object");
    }
    if let Some(lang) = spec.get("lang").and_then(Value::as_object) {
        check_known_keys("lang", lang, LANG_KEYS, path)?;
    }
    if let Some(only) = spec
        .get("lang")
        .and_then(Value::as_object)
        .and_then(|lang| lang.get("only"))
    {
        let codes = only
            .as_array()
            .is_some_and(|codes| codes.iter().all(Value::is_string));
        if !codes && !only.is_object() {
            return fail("lang.only", "a list of language codes or an object");
        }
    }
    if let Some(design) = spec.get("design") {
        check_design_declaration(design, path)?;
    }
    if let Some(behavior) = spec.get("behavior").and_then(Value::as_object) {
        check_known_keys("behavior", behavior, BEHAVIOR_KEYS, path)?;
    }
    Ok(())
}

/// Reject a wrong root `action` or `buttons` declaration.
fn check_form_declarations(spec: &Map<String, Value>) -> FormResult<()> {
    let fail = |key: &str, expected: &str| -> FormResult<()> {
        Err(FormError::input(format!(
            "Invalid {key} at form: expected {expected}"
        )))
    };
    if let Some(action) = spec.get("action") {
        let Some(action) = action.as_object() else {
            return fail("action", "an object");
        };
        for key in ["method", "url", "enctype"] {
            if action.get(key).is_some_and(|v| !v.is_string()) {
                return fail(&format!("action.{key}"), "a string");
            }
        }
    }
    let Some(buttons) = spec.get("buttons") else {
        return Ok(());
    };
    let Some(buttons) = buttons.as_array() else {
        return fail("buttons", "a list of buttons");
    };
    for (index, button) in buttons.iter().enumerate() {
        let key = format!("buttons.{index}");
        let Some(button) = button.as_object() else {
            return fail(&key, "an object");
        };
        let kind = button.get("type").and_then(Value::as_str).unwrap_or("");
        if !crate::buttons::FORM_BUTTON_TYPES.contains(&kind) {
            return fail(&format!("{key}.type"), "submit, reset, button or link");
        }
        for name in ["name", "value", "href"] {
            if button.get(name).is_some_and(|v| !v.is_string()) {
                return fail(&format!("{key}.{name}"), "a string");
            }
        }
        // A button type without interface text needs declared text.
        if crate::buttons::button_text(crate::messages::form_messages("ko")?, kind).is_empty()
            && !button.contains_key("text")
        {
            return fail(&format!("{key}.text"), "content for this button type");
        }
        if kind == "link" && !button.contains_key("href") {
            return fail(&format!("{key}.href"), "a link target");
        }
        check_declarations(button, &format!("form.{key}"))?;
    }
    Ok(())
}

fn fields(properties: &Map<String, Value>, parent: &str) -> FormResult<Vec<FieldTemplate>> {
    let mut out = Vec::new();
    for (name, value) in properties {
        let Some(raw) = value.as_object() else {
            continue;
        };
        let path = if parent.is_empty() {
            name.clone()
        } else {
            format!("{parent}.{name}")
        };
        check_declarations(raw, &path)?;
        let mut spec = raw.clone();
        let children = match spec.shift_remove("properties") {
            Some(Value::Object(children)) => fields(&children, &path)?,
            _ => Vec::new(),
        };
        out.push(FieldTemplate {
            name: name.clone(),
            spec,
            children,
        });
    }
    Ok(out)
}

/// A field template whose specification maps, at every depth, are in specification member order.
fn member_ordered_field(field: &FieldTemplate) -> FieldTemplate {
    FieldTemplate {
        name: field.name.clone(),
        spec: member_ordered_map(&field.spec),
        children: field.children.iter().map(member_ordered_field).collect(),
    }
}

/// A form template whose field specifications, buttons and action are in specification member order.
pub(crate) fn member_ordered_template(template: &FormTemplate) -> FormTemplate {
    FormTemplate {
        kind: template.kind.clone(),
        key_prefix: template.key_prefix.clone(),
        fields: template.fields.iter().map(member_ordered_field).collect(),
        buttons: template.buttons.iter().map(member_ordered_map).collect(),
        action: template.action.as_ref().map(member_ordered_map),
    }
}

/// Compile a complete form structure before record data is available.
pub fn compile_form(spec: &Value, options: &CompileOptions<'_>) -> FormResult<FormTemplate> {
    // The specification is read in member order; composition orders every loaded document.
    let spec = &member_ordered(spec);
    if spec["type"] != "group" || !spec["properties"].is_object() {
        return Err(FormError::input(
            "A form spec must be a group with properties",
        ));
    }
    check_form_declarations(spec.as_object().expect("checked group"))?;
    let memory = MemoryLoader::new(options.files.clone());
    let properties = compose_properties(
        spec["properties"]
            .as_object()
            .expect("checked properties")
            .clone(),
        options.loader.unwrap_or(&memory),
        &ComposeOptions::with_basepath(&options.basepath),
    )?;
    Ok(FormTemplate {
        kind: "crudui/form-template".into(),
        key_prefix: options.key_prefix.clone(),
        fields: fields(&properties, "")?,
        buttons: match spec.get("buttons").and_then(Value::as_array) {
            Some(declared) => declared
                .iter()
                .filter_map(|b| b.as_object().cloned())
                .collect(),
            None => vec![Map::from_iter([(
                "type".to_string(),
                Value::from("submit"),
            )])],
        },
        action: spec.get("action").and_then(Value::as_object).cloned(),
    })
}

pub(crate) fn repeats(field: &FieldTemplate) -> bool {
    field
        .spec
        .get("multiple")
        .is_some_and(|v| *v == true || v.is_object())
}
