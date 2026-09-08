//! CRUDUI list-spec structural validation (SPEC §9) — the read sister of the
//! form-spec load path.
//!
//! `list` has NO data (rows are DB-agnostic and INJECTED, never validated here —
//! SPEC §6 R1, §9.1), so the form pipeline's DATA pass (§3+§2 G1) does NOT
//! apply. The 4-language SHARED structural gate that lists reuse is exactly the
//! form load path's first two passes.
//!
//! Pass 1 — compose (G5): `compose_spec`/`compose_properties` expand
//! `$ref`/`$patch` on the list root, the `columns` map, and the `search`
//! sub-form. An unresolved composition is a LOAD failure (`ComposeLoadError`),
//! never a silent pass — the same engine, the same error.
//!
//! Pass 2 — forbidden-scan (§6): `scan_forbidden_keys` walks the COMPOSED list
//! tree (columns / each Column / open format-options bucket / actions / sort /
//! pagination / design / search) to ARBITRARY depth and rejects any forbidden
//! meta key (`display_switch`/`if`/`when`/`show_if`/`x{key}`…) as a LOAD failure.
//!
//! What is NOT here: the JSON-Schema-shaped checks (1급 닫힘
//! `additionalProperties:false`, `required:columns`, `enum` sort.dir/pagination
//! .mode, `anyOf` CellFormat polymorphism). The 4-language engine does NOT do
//! JSON-Schema validation (SPEC §8); those remain the META-SCHEMA's job (ajv,
//! `packages/validator-ts/src/list-metaschema.conformance.test.ts`), exactly as
//! for form. This module invents NOTHING — it re-runs compose + forbidden-scan.
//!
//! Reuses `crate::compose` and `crate::forbidden_scan` verbatim; the
//! shared fixture `tests/fixtures/list-validity/cases.json` is the single
//! source of truth across JS / Rust.

use serde_json::{Map, Value};

use crate::compose::{
    compose_properties, compose_spec, ComposeLoadError, ComposeOptions, FileLoader, MemoryLoader,
};
use crate::forbidden_scan::scan_forbidden_keys;

/// Options for a list-spec validation run (the form `ValidateOptions` shape —
/// no data, so no `data` field).
#[derive(Default)]
pub struct ValidateListOptions<'a> {
    /// Virtual file set for `$ref` resolution (default empty — no `$ref`).
    pub files: Option<Map<String, Value>>,
    /// A custom loader (overrides `files`).
    pub loader: Option<&'a dyn FileLoader>,
    /// Basepath for relative `$ref` resolution.
    pub basepath: Option<String>,
}

/// Validate a list-spec's STRUCTURE: compose (§5 G5) then forbidden-scan (§6).
///
/// Returns `Ok(())` when the composed list tree carries no forbidden meta key.
/// Returns `Err(ComposeLoadError)` for an unresolved composition (`$ref`/`$patch`)
/// OR a forbidden meta key at any depth (`FORBIDDEN_META_KEY`) — both are LOAD
/// failures (the spec never comes into existence), never a `valid:false`.
///
/// The composed list tree is built field-by-field so each sub-tree composes with
/// the form engine it shares. The list root may carry `$ref`/`$patch` →
/// `compose_spec` (whole-spec inheritance), but the root is NOT a form Field, so
/// its named slots (`columns`/`search`/…) are composed individually, NOT via the
/// form `properties` recursion. `columns` is a properties-shaped map →
/// `compose_properties` (the SAME code that composes form `properties`).
/// `search` is a form-spec reference (input, §9.1) → `compose_spec`.
pub fn validate_list(
    spec: &Value,
    options: &ValidateListOptions,
) -> Result<(), ComposeLoadError> {
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

    let composed = compose_list(spec, loader, &opts)?;

    // Load-path forbidden-scan (§6): walk the WHOLE composed list tree to
    // arbitrary depth and reject any forbidden meta key. The trace is seeded at
    // the list root (no `properties` prefix — a list is not a Field).
    scan_forbidden_keys(&composed, &[])?;
    Ok(())
}

/// Compose a list-spec into a single composition-free tree: expand the root
/// `$ref`/`$patch`, then expand the `columns` map and the `search` sub-form.
///
/// A non-object spec composes to itself (the forbidden-scan then finds nothing —
/// the meta-schema owns the "list must be an object/required columns" shape).
fn compose_list(
    spec: &Value,
    loader: &dyn FileLoader,
    opts: &ComposeOptions,
) -> Result<Value, ComposeLoadError> {
    let root = match spec.as_object() {
        Some(m) => m.clone(),
        None => return Ok(spec.clone()),
    };

    // Root-level $ref/$patch: a list may inherit a whole base list. compose_spec
    // expands $ref/$patch and recurses into a `properties` child — a list has no
    // `properties`, so this only flattens the root composition keys.
    let mut composed = compose_spec(root, loader, opts)?;

    // `columns` is a properties-shaped map (named Column entries, possibly a
    // `$ref`/`$patch` compose entry) → the form properties engine, verbatim.
    if let Some(Value::Object(columns)) = composed.get("columns").cloned() {
        let expanded = compose_properties(columns, loader, opts)?;
        composed.insert("columns".to_string(), Value::Object(expanded));
    }

    // `search` is a form-spec reference (input, §9.1): a Field/group entry that
    // may carry `$ref`/`$patch` → compose_spec (which recurses into its own
    // `properties`, so the referenced sub-form composes fully).
    if let Some(Value::Object(search)) = composed.get("search").cloned() {
        let expanded = compose_spec(search, loader, opts)?;
        composed.insert("search".to_string(), Value::Object(expanded));
    }

    Ok(Value::Object(composed))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compose::ComposeErrorCode;
    use serde_json::json;

    fn run(spec: &Value) -> Result<(), ComposeLoadError> {
        validate_list(spec, &ValidateListOptions::default())
    }

    fn run_with_files(spec: &Value, files: Value) -> Result<(), ComposeLoadError> {
        let opts = ValidateListOptions {
            files: files.as_object().cloned(),
            loader: None,
            basepath: None,
        };
        validate_list(spec, &opts)
    }

    #[test]
    fn minimal_columns_passes() {
        let v = json!({ "columns": { "name": { "field": ".name" } } });
        assert!(run(&v).is_ok());
    }

    #[test]
    fn forbidden_column_key_is_load_error() {
        let v = json!({
            "columns": { "name": { "field": ".name" }, "display_switch": { "field": ".x" } }
        });
        let err = run(&v).unwrap_err();
        assert_eq!(err.code, ComposeErrorCode::ForbiddenMetaKey);
        assert_eq!(err.trace.join("."), "columns.display_switch");
    }

    #[test]
    fn x_prefixed_column_key_is_load_error() {
        let v = json!({ "columns": { "name": { "field": ".name" }, "xclass": { "field": ".x" } } });
        assert_eq!(
            run(&v).unwrap_err().trace.join("."),
            "columns.xclass"
        );
    }

    #[test]
    fn forbidden_key_in_format_options_bucket_is_load_error() {
        let v = json!({
            "columns": { "name": { "field": ".name", "format": { "type": "badge", "if": ".admin" } } }
        });
        assert_eq!(
            run(&v).unwrap_err().trace.join("."),
            "columns.name.format.if"
        );
    }

    #[test]
    fn columns_ref_patch_composes_with_supplied_files() {
        // The columns map is composed by the FORM properties engine: $ref pulls a
        // base file's `properties` layer (detectKey), $patch overlays.
        let files = json!({
            "base-columns.yml": { "properties": { "name": { "field": ".name" } } }
        });
        let v = json!({
            "columns": { "$ref": "base-columns.yml", "$patch": { "extra": { "field": ".extra" } } }
        });
        assert!(run_with_files(&v, files).is_ok());
    }

    #[test]
    fn unresolved_columns_ref_is_load_error() {
        // No files → the columns $ref cannot resolve → REF_FILE_NOT_FOUND. An
        // unresolved composition is a LOAD failure, never a silent pass.
        let v = json!({ "columns": { "$ref": "missing.yml" } });
        assert_eq!(
            run(&v).unwrap_err().code,
            ComposeErrorCode::RefFileNotFound
        );
    }

    #[test]
    fn search_form_ref_composes_with_supplied_files() {
        let files = json!({
            "search-form.yml": { "properties": { "q": { "type": "text" } } }
        });
        let v = json!({
            "columns": { "name": { "field": ".name" } },
            "search": { "$ref": "search-form.yml", "$patch": { "add": {} } }
        });
        assert!(run_with_files(&v, files).is_ok());
    }

    #[test]
    fn forbidden_key_in_composed_search_subform_is_load_error() {
        // The search sub-form composes, then forbidden-scan walks it: a meta key
        // INHERITED through the search $ref base is caught at its composed depth.
        let files = json!({
            "search-form.yml": { "properties": { "q": { "type": "text", "show_if": ".admin" } } }
        });
        let v = json!({
            "columns": { "name": { "field": ".name" } },
            "search": { "$ref": "search-form.yml" }
        });
        // compose_spec on the search $ref resolves the file's `properties` layer
        // (detectKey) and flattens it onto `search` directly, so the offending key
        // composes to `search.q.show_if` (NOT under a surviving `properties`).
        let err = run_with_files(&v, files).unwrap_err();
        assert_eq!(err.code, ComposeErrorCode::ForbiddenMetaKey);
        assert_eq!(err.trace.join("."), "search.q.show_if");
    }

    #[test]
    fn metaschema_only_shape_violations_pass_the_engine() {
        // additionalProperties / enum / anyOf / required are META-SCHEMA concerns,
        // NOT engine concerns: the engine (compose + forbidden-scan) lets them
        // through. ajv is the gate for these — the engine invents no shape check.
        for v in [
            json!({ "columns": { "name": { "field": ".name" } }, "sort": { "dir": "sideways" } }),
            json!({ "columns": { "name": { "field": ".name" } }, "limit": 10 }),
            json!({ "columns": { "name": { "field": ".name", "format": ["date"] } } }),
            json!({ "sort": { "field": ".name" } }),
        ] {
            assert!(run(&v).is_ok(), "engine must not reject a meta-schema-only shape: {v}");
        }
    }
}
