//! CRUDUI validation entry point (SPEC §2 pipeline).
//!
//! Wires the three CRUDUI passes in order (G5 compose first → §3 traversal → §2 G1
//! value evaluation):
//!
//! 1. compose — `compose_spec` / `compose_properties` expand `$ref`/`$patch` into
//!    a single spec. An unresolved composition returns `Err(ComposeLoadError)`
//!    HERE (a LOAD failure, NOT `valid:false`) — closing the legacy
//!    `valid:true`-on-unresolved-`$ref` gap (LargeForm.yml:873).
//! 2. validate — `Validator` traverses the composed spec and runs the `validate`
//!    slot (conditional rule values evaluated by the CRUDUI expression engine, then
//!    handed to the rule registry).
//!
//! The compose pass reuses the existing `crate::compose` module and the
//! expression engine reuses `crate::expr`. Nothing re-implements them, and
//! nothing touches the legacy model (R7 parallel run).

pub mod rules;
pub mod validator;

pub use validator::{ValidationError, ValidationResult, Validator};

use serde_json::{Map, Value};

use crate::compose::{
    compose_properties, compose_spec, ComposeLoadError, ComposeOptions, FileLoader, MemoryLoader,
};
use crate::forbidden_scan::scan_forbidden_keys;

/// Options for a CRUDUI validation run.
#[derive(Default)]
pub struct ValidateOptions<'a> {
    /// Virtual file set for `$ref` resolution (default empty — no `$ref`).
    pub files: Option<Map<String, Value>>,
    /// A custom loader (overrides `files`).
    pub loader: Option<&'a dyn FileLoader>,
    /// Basepath for relative `$ref` resolution.
    pub basepath: Option<String>,
}

/// Validate `data` against a CRUDUI spec. The spec may carry `$ref`/`$patch`; they are
/// expanded first via the compose pass. An unresolved composition returns
/// `Err(ComposeLoadError)` (caller distinguishes a LOAD failure from
/// `valid:false`).
///
/// Two entry shapes (JS `validate`):
///   (a) a full root group spec `{ type:'group', properties:{…} }` — compose the
///       whole spec, then read its composed `properties`.
///   (b) a properties-layer composition entry `{ $ref, $patch }` with no own
///       `properties` — compose it AS a properties map directly.
pub fn validate(
    spec: &Value,
    data: &Value,
    options: &ValidateOptions,
) -> Result<ValidationResult, ComposeLoadError> {
    let owned_loader;
    let loader: &dyn FileLoader = match options.loader {
        Some(l) => l,
        None => {
            owned_loader = MemoryLoader::new(options.files.clone().unwrap_or_default());
            &owned_loader
        }
    };
    let opts = match &options.basepath {
        Some(bp) => ComposeOptions::with_basepath(bp.clone()),
        None => ComposeOptions::default(),
    };

    let spec_map = spec.as_object().cloned().unwrap_or_default();

    let has_own_properties = matches!(spec.get("properties"), Some(Value::Object(_)));
    let is_composition_entry = spec_map.contains_key("$ref") || spec_map.contains_key("$patch");

    let properties: Map<String, Value> = if is_composition_entry && !has_own_properties {
        compose_properties(spec_map, loader, &opts)?
    } else {
        let composed = compose_spec(spec_map, loader, &opts)?;
        composed
            .get("properties")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default()
    };

    // Load-path forbidden-scan (SPEC §6): walk the composed single spec to
    // arbitrary depth and reject any forbidden meta key BEFORE validation entry.
    // A hit returns Err(ComposeLoadError) (a LOAD failure), never `valid:false`.
    // This closes the deep-nesting leak the typed model alone could not (R1).
    let props_value = Value::Object(properties.clone());
    scan_forbidden_keys(&props_value, &["properties".to_string()])?;

    let validator = Validator::new(properties);
    Ok(validator.validate(data))
}
