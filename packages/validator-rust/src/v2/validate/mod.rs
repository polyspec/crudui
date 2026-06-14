//! v2 validation entry point (SPEC-V2 §2 pipeline).
//!
//! Wires the three v2 passes in order (G5 compose first → §3 traversal → §2 G1
//! value evaluation):
//!
//! 1. compose — `compose_spec` / `compose_properties` expand `$ref`/`$patch` into
//!    a single spec. An unresolved composition returns `Err(ComposeLoadError)`
//!    HERE (a LOAD failure, NOT `valid:false`) — closing the v1
//!    `valid:true`-on-unresolved-`$ref` gap (ProductNft.yml:873).
//! 2. validate — `ValidatorV2` traverses the composed spec and runs the `validate`
//!    slot (conditional rule values evaluated by the v2 expression engine, then
//!    handed to the rule registry).
//!
//! The compose pass reuses the existing `crate::v2::compose` module and the
//! expression engine reuses `crate::v2::expr`. Nothing re-implements them, and
//! nothing touches the v1 model (R7 parallel run).

pub mod rules;
pub mod validator;

pub use validator::{ValidationError, ValidationResult, ValidatorV2};

use serde_json::{Map, Value};

use crate::v2::compose::{
    compose_properties, compose_spec, ComposeLoadError, ComposeOptions, FileLoader, MemoryLoader,
};
use crate::v2::forbidden_scan::scan_forbidden_keys;

/// Options for a v2 validation run.
#[derive(Default)]
pub struct ValidateV2Options<'a> {
    /// Virtual file set for `$ref` resolution (default empty — no `$ref`).
    pub files: Option<Map<String, Value>>,
    /// A custom loader (overrides `files`).
    pub loader: Option<&'a dyn FileLoader>,
    /// Basepath for relative `$ref` resolution.
    pub basepath: Option<String>,
}

/// Validate `data` against a v2 spec. The spec may carry `$ref`/`$patch`; they are
/// expanded first via the compose pass. An unresolved composition returns
/// `Err(ComposeLoadError)` (caller distinguishes a LOAD failure from
/// `valid:false`).
///
/// Two entry shapes (JS `validateV2`):
///   (a) a full root group spec `{ type:'group', properties:{…} }` — compose the
///       whole spec, then read its composed `properties`.
///   (b) a properties-layer composition entry `{ $ref, $patch }` with no own
///       `properties` — compose it AS a properties map directly.
pub fn validate_v2(
    spec: &Value,
    data: &Value,
    options: &ValidateV2Options,
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

    // Load-path forbidden-scan (SPEC-V2 §6): walk the composed single spec to
    // arbitrary depth and reject any forbidden meta key BEFORE validation entry.
    // A hit returns Err(ComposeLoadError) (a LOAD failure), never `valid:false`.
    // This closes the deep-nesting leak the typed model alone could not (R1).
    let props_value = Value::Object(properties.clone());
    scan_forbidden_keys(&props_value, &["properties".to_string()])?;

    let validator = ValidatorV2::new(properties);
    Ok(validator.validate(data))
}
