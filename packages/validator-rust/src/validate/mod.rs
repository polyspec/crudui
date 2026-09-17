//! CRUDUI validation entry point (SPEC §2 pipeline).
//!
//! Wires the three CRUDUI passes in order (G5 compose first → §3 traversal → §2 G1
//! value evaluation):
//!
//! 1. compose — `compose_spec` / `compose_properties` expand `$ref`/`$patch` into
//!    a single spec. An unresolved composition returns `Err(ComposeLoadError)`
//!    HERE (a LOAD failure, NOT `valid:false`) — an unresolved `$ref` never
//!    yields `valid:true`.
//! 2. validate — `Validator` traverses the composed spec and runs the `validate`
//!    slot (conditional rule values evaluated by the CRUDUI expression engine, then
//!    handed to the rule registry).
//!
//! The compose pass reuses the existing `crate::compose` module and the
//! expression engine reuses `crate::expr`. Nothing re-implements them.

mod canonical;
pub mod errors;
mod length;
mod membership;
mod parameters;
mod pattern;
pub mod rules;
mod unicode;
pub mod validator;
mod whitespace;

pub use errors::{FormInputError, ValidateError};
pub use validator::{ValidationError, ValidationResult, Validator};

use serde_json::{Map, Value};

use crate::compose::{
    compose_properties, compose_spec, member_ordered, ComposeOptions, FileLoader, MemoryLoader,
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
/// expanded first via the compose pass. An unresolved composition or a rule
/// parameter outside the validation-rule definitions returns
/// `Err(ValidateError::Load)` and data with the wrong shape returns
/// `Err(ValidateError::Input)`; neither produces a validation result.
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
) -> Result<ValidationResult, ValidateError> {
    // Root data is a request precondition, checked before composition.
    if !data.is_object() {
        return Err(FormInputError::new("Form data must be an object").into());
    }
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

    // The specification is read in member order; the data keeps its own order.
    let spec = &member_ordered(spec);
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
    // The form root declarations are scanned like the fields they sit beside.
    for key in ["buttons", "action"] {
        if let Some(declared) = spec.get(key) {
            scan_forbidden_keys(declared, &[key.to_string()])?;
        }
    }

    // Rule parameters are checked after composition and the forbidden-key scan.
    let validator = Validator::new(properties)?;
    validator.validate(data)
}
