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

fn fields(properties: &Map<String, Value>) -> Vec<FieldTemplate> {
    properties
        .iter()
        .filter_map(|(name, value)| {
            let mut spec = value.as_object()?.clone();
            let children = spec
                .shift_remove("properties")
                .and_then(|v| v.as_object().map(fields))
                .unwrap_or_default();
            Some(FieldTemplate {
                name: name.clone(),
                spec,
                children,
            })
        })
        .collect()
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
        fields: fields(&properties),
    })
}

pub(crate) fn repeats(field: &FieldTemplate) -> bool {
    field
        .spec
        .get("multiple")
        .is_some_and(|v| *v == true || v.is_object())
}
