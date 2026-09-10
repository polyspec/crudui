//! `$ref` resolution expands base inheritance before other composition (SPEC §5).
//!
//! Resolution supports these input forms:
//!   (1) value = a single string OR an array of strings — an array resolves each
//!       path in order, then array_merge (later overrides earlier on key clash).
//!   (2) plain path `OptionCombination.yml` → load YAML, descend by the default
//!       detectKey `['properties']` (= take the file's `properties` only).
//!   (3) path-specified `(file.yml).a.b` → regex split, detectKeys = ['a','b',
//!       'properties'] — descend a.b, then descend to `properties` underneath.
//!   (4) relative paths get the basepath '/' prefix; absolute (/-leading) pass
//!       through (handled by the FileLoader).
//!   (5) the result is recursively processed — nested `$ref` is expanded.
//!
//! CRUDUI normalization: `$ref` is the `properties`-layer composition entry point.
//! The resolved result is flattened to a single properties map and laid down as
//! the base; `$patch` overlays it (base first, patch overrides). Unresolved
//! `$ref` (missing file / bad format / absent detectKey / cycle) is a LOAD ERROR
//! — never `valid:true` (the legacy LargeForm.yml:873 bug).

use std::collections::BTreeSet;

use serde_json::{Map, Value};

use super::errors::{ComposeErrorCode, ComposeLoadError, ComposeResult};
use super::loader::FileLoader;
use super::patch::apply_patch;

/// Resolve a `$ref` value (string or string[]) to a single flattened properties
/// map. Each entry is resolved in declaration order and merged (later overrides
/// earlier). Nested `$ref` inside a resolved doc is expanded recursively. The
/// `visiting` set (canonical file keys on the current chain) detects cycles.
pub fn resolve_ref(
    value: &Value,
    basepath: &str,
    loader: &dyn FileLoader,
    visiting: &BTreeSet<String>,
) -> ComposeResult<Map<String, Value>> {
    let paths = normalize_ref_value(value)?;

    let mut merged: Map<String, Value> = Map::new();
    for path in &paths {
        let resolved = resolve_single_ref(path, basepath, loader, visiting)?;
        // array_merge: later keys override earlier (legacy resolve() semantics).
        for (k, v) in resolved {
            merged.insert(k, v);
        }
    }
    Ok(merged)
}

/// Normalize the `$ref` value into a list of path strings (legacy: scalar→[scalar]).
fn normalize_ref_value(value: &Value) -> ComposeResult<Vec<String>> {
    match value {
        Value::String(s) => Ok(vec![s.clone()]),
        Value::Array(items) => {
            let mut out = Vec::with_capacity(items.len());
            for p in items {
                match p {
                    Value::String(s) => out.push(s.clone()),
                    other => {
                        return Err(ComposeLoadError::new(
                            ComposeErrorCode::RefValueType,
                            format!("$ref array entries must be strings, got {}", kind_of(other)),
                        ));
                    }
                }
            }
            Ok(out)
        }
        other => Err(ComposeLoadError::new(
            ComposeErrorCode::RefValueType,
            format!(
                "$ref must be a string or an array of strings, got {}",
                kind_of(other)
            ),
        )),
    }
}

/// Parse the path-specified form `(file.yml).a.b` (legacy ReferenceResolver:113).
/// Returns `Some((path, keys))` on a match, `None` otherwise. Hand-rolled (no
/// regex dependency on the hot path): leading `(`, a closing `)` followed by `.`,
/// then the remaining key chain. Mirrors `^\((?<path>.*?)\)\.(?<keys>.*)$`.
fn parse_path_spec(s: &str) -> Option<(String, String)> {
    if !s.starts_with('(') {
        return None;
    }
    // Non-greedy `(.*?)` then `).` — find the FIRST ")." after the opening "(".
    let inner = &s[1..];
    let close = inner.find(").")?;
    let path = inner[..close].to_string();
    let keys = inner[close + 2..].to_string();
    Some((path, keys))
}

/// Resolve one `$ref` path entry, descending detectKeys and expanding nested refs.
fn resolve_single_ref(
    raw_path: &str,
    basepath: &str,
    loader: &dyn FileLoader,
    visiting: &BTreeSet<String>,
) -> ComposeResult<Map<String, Value>> {
    let org_path = raw_path;
    let mut path = raw_path.to_string();
    let mut detect_keys: Vec<String> = vec!["properties".to_string()];

    // Path-specified form `(file.yml).a.b` (legacy: leading '(').
    if path.starts_with('(') {
        match parse_path_spec(&path) {
            Some((p, keys)) => {
                path = p;
                // detectKeys = explode('.', keys) ++ ['properties'] (legacy:115).
                detect_keys = keys
                    .split('.')
                    .map(|s| s.to_string())
                    .chain(std::iter::once("properties".to_string()))
                    .collect();
            }
            None => {
                return Err(ComposeLoadError::new(
                    ComposeErrorCode::RefFormatError,
                    format!("{} ref error", org_path),
                ));
            }
        }
    }

    // Empty path is a format error (legacy: ReferenceResolver:141).
    if path.is_empty() {
        return Err(ComposeLoadError::new(
            ComposeErrorCode::RefFormatError,
            format!("{} ref error", org_path),
        ));
    }

    let key = loader.normalize(&path, basepath);

    // Cycle detection: this file key already on the current resolution chain
    // (legacy has no guard and infinite-recurses; CRUDUI must detect — SPEC §7).
    if visiting.contains(&key) {
        let mut trace: Vec<String> = visiting.iter().cloned().collect();
        trace.push(key.clone());
        return Err(ComposeLoadError::with_trace(
            ComposeErrorCode::RefCycle,
            format!("$ref cycle detected: {}", trace.join(" -> ")),
            trace,
        ));
    }

    let doc = loader.load(&key)?; // RefFileNotFound if absent

    // Descend detectKeys (legacy: ReferenceResolver:129-136).
    let mut node: Value = Value::Object(doc);
    for detect_key in &detect_keys {
        let next = match &node {
            Value::Object(obj) => obj.get(detect_key).cloned(),
            _ => None,
        };
        match next {
            Some(v) => node = v,
            None => {
                let mut trace: Vec<String> = visiting.iter().cloned().collect();
                trace.push(key.clone());
                return Err(ComposeLoadError::with_trace(
                    ComposeErrorCode::RefDetectKeyNotFound,
                    format!("{} not found in {}", detect_key, org_path),
                    trace,
                ));
            }
        }
    }

    // A properties layer must be a map. A scalar/array here is a malformed ref.
    let node_obj = match node {
        Value::Object(obj) => obj,
        _ => {
            let mut trace: Vec<String> = visiting.iter().cloned().collect();
            trace.push(key.clone());
            return Err(ComposeLoadError::with_trace(
                ComposeErrorCode::RefDetectKeyNotFound,
                format!("{} resolved to a non-object properties layer", org_path),
                trace,
            ));
        }
    };

    // Recursively expand nested $ref inside the resolved properties map. Add this
    // file key to the visiting chain so a deeper $ref back to it is a cycle.
    let mut next_visiting = visiting.clone();
    next_visiting.insert(key);
    expand_nested_refs(node_obj, basepath, loader, &next_visiting)
}

/// Expand any `$ref` (and merge any `$patch`) sitting INSIDE a resolved
/// properties map, recursively (legacy: resolve() re-runs Parser::process). The
/// resolved base is laid down first, then sibling named keys override it (legacy
/// array_merge declaration order: a later plain key overrides an earlier $ref).
fn expand_nested_refs(
    node: Map<String, Value>,
    basepath: &str,
    loader: &dyn FileLoader,
    visiting: &BTreeSet<String>,
) -> ComposeResult<Map<String, Value>> {
    if !node.contains_key("$ref") && !node.contains_key("$patch") {
        return Ok(node);
    }

    let mut base: Map<String, Value> = Map::new();
    let mut patch: Option<Value> = None;
    let mut own: Map<String, Value> = Map::new();

    // Preserve declaration order: $ref expands to the base; keys declared after it
    // override, keys before it are overridden by it (legacy positional array_merge).
    for (k, v) in node {
        if k == "$ref" {
            // base = (earlier own keys) overlaid by ref, matching legacy order where
            // the ref array_merges onto whatever was processed before it.
            let resolved = resolve_ref(&v, basepath, loader, visiting)?;
            let mut next_base: Map<String, Value> = Map::new();
            for (ok, ov) in own.iter() {
                next_base.insert(ok.clone(), ov.clone());
            }
            for (rk, rv) in resolved {
                next_base.insert(rk, rv);
            }
            base = next_base;
            // own keys already folded into base; reset so later keys override base.
            own.clear();
        } else if k == "$patch" {
            patch = Some(v);
        } else {
            own.insert(k, v);
        }
    }

    let mut result = base;
    for (k, v) in own {
        result.insert(k, v);
    }
    if let Some(p) = patch {
        result = apply_patch(result, &p)?;
    }
    Ok(result)
}

/// JS-style type name for error messages (matches the JS `typeof`/array wording).
fn kind_of(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}
