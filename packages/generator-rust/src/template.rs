use crate::{FormError, FormResult};
use crudui_validator::compose::{compose_properties, ComposeOptions, FileLoader, MemoryLoader};
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

/// Reject a wrong value type in one field's `multiple` and `design` declarations.
fn check_declarations(spec: &Map<String, Value>, path: &str) -> FormResult<()> {
    let fail = |key: &str, expected: &str| -> FormResult<()> {
        Err(FormError::input(format!(
            "Invalid {key} at {path}: expected {expected}"
        )))
    };
    if let Some(multiple) = spec.get("multiple") {
        if !multiple.is_boolean() && !multiple.is_object() {
            return fail("multiple", "a boolean or an object");
        }
        if let Some(settings) = multiple.as_object() {
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
    if spec.get("lang").is_some_and(|v| !v.is_boolean() && !v.is_object()) {
        return fail("lang", "a boolean or an object");
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
        if !design.is_boolean() && !design.is_object() {
            return fail("design", "a boolean or an object");
        }
        if let Some(design) = design.as_object() {
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
                for key in ["class", "style"] {
                    if value.get(key).is_some_and(|v| !condition_value(v)) {
                        return fail(&format!("design.{node}.{key}"), "a string or a condition map");
                    }
                }
            }
        }
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

/// Compile a complete form structure before record data is available.
pub fn compile_form(spec: &Value, options: &CompileOptions<'_>) -> FormResult<FormTemplate> {
    if spec["type"] != "group" || !spec["properties"].is_object() {
        return Err(FormError::input(
            "A form spec must be a group with properties",
        ));
    }
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
    })
}

pub(crate) fn repeats(field: &FieldTemplate) -> bool {
    field
        .spec
        .get("multiple")
        .is_some_and(|v| *v == true || v.is_object())
}
