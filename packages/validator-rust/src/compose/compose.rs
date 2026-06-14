//! Composition orchestrator (schema §5, G5) — the parser's FIRST pass.
//!
//! Resolution order (schema §5, verbatim):
//!   (1) $ref   — expand file/path base, recursively (nested $ref included) into a
//!                single properties base.
//!   (2) $patch — overlay add/remove/replace and deep-path set on that base.
//!   (3) the result is the equivalent SINGLE SPEC (composition keys eliminated).
//!   (4) the field layer (validate/design/behavior/options) then applies to it.
//!
//! G5 (SPEC §2): the parser expands composition first, producing a single spec,
//! BEFORE applying the field layer — without composition a `$ref`-using spec
//! cannot even be loaded. So composition is a pre-processing pass that runs
//! BEFORE validation/render, not a validation step.
//!
//! legacy's positional `array_merge` priority is normalized here: `$ref` = base
//! (first), `$patch` = overlay (later) — base is laid down, patch overrides.
//!
//! `compose_properties` is the entry point: it operates on a `properties` map (the
//! composition entry point, SPEC §2 / types.rs:73) where `$ref`/`$patch` may sit
//! alongside named child fields. `compose_spec` recurses the whole field tree so a
//! `$ref` nested inside any child `properties` is expanded too. Both return a
//! `ComposeLoadError` for any unresolved composition (never `valid:true`).

use std::collections::BTreeSet;

use serde_json::{Map, Value};

use super::errors::ComposeResult;
use super::loader::FileLoader;
use super::patch::apply_patch;
use super::ref_::resolve_ref;

/// Options for a composition pass.
#[derive(Debug, Clone, Default)]
pub struct ComposeOptions {
    /// Basepath for relative `$ref` resolution (legacy ReferenceResolver basepath).
    pub basepath: String,
}

impl ComposeOptions {
    /// Construct options with the given basepath.
    pub fn with_basepath(basepath: impl Into<String>) -> Self {
        ComposeOptions {
            basepath: basepath.into(),
        }
    }
}

/// Compose a `properties` map: expand `$ref` to a base, overlay `$patch`, return
/// the single (composition-free) properties map. Named sibling keys follow legacy
/// declaration order — a key declared after `$ref` overrides the base; a key
/// declared before it is overridden by the base.
pub fn compose_properties(
    properties: Map<String, Value>,
    loader: &dyn FileLoader,
    opts: &ComposeOptions,
) -> ComposeResult<Map<String, Value>> {
    let basepath = &opts.basepath;
    let visiting: BTreeSet<String> = BTreeSet::new();

    let mut base: Map<String, Value> = Map::new();
    let mut patch: Option<Value> = None;
    let mut own: Map<String, Value> = Map::new();

    for (k, v) in properties {
        if k == "$ref" {
            // $ref array_merges onto whatever was declared before it (legacy order).
            let resolved = resolve_ref(&v, basepath, loader, &visiting)?;
            let mut next_base: Map<String, Value> = Map::new();
            for (ok, ov) in own.iter() {
                next_base.insert(ok.clone(), ov.clone());
            }
            for (rk, rv) in resolved {
                next_base.insert(rk, rv);
            }
            base = next_base;
            own.clear();
        } else if k == "$patch" {
            patch = Some(v);
        } else {
            own.insert(k, v);
        }
    }

    // No composition keys: still recurse into children so nested $ref expands.
    let mut result = base;
    for (k, v) in own {
        result.insert(k, v);
    }
    if let Some(p) = patch {
        result = apply_patch(result, &p)?;
    }

    // Recurse into every child field's `properties` (the tree may compose deeper).
    // ORDER: clone the child value out (get().cloned()), compose it, then re-insert
    // under the SAME key. IndexMap::insert keeps an existing key in its place — so
    // declaration order is preserved. NEVER remove()+insert (remove = swap_remove,
    // which moves the last key into this slot and corrupts the positional order
    // that legacy's array_merge merge priority is load-bearing on).
    let keys: Vec<String> = result.keys().cloned().collect();
    for field_name in keys {
        if let Some(Value::Object(child)) = result.get(&field_name).cloned() {
            let composed = compose_spec(child, loader, opts)?;
            result.insert(field_name, Value::Object(composed));
        }
    }

    Ok(result)
}

/// Compose a full field spec: expand a field-level `$ref`/`$patch`, then recurse
/// into its `properties` (which may itself compose). Returns the single spec.
pub fn compose_spec(
    spec: Map<String, Value>,
    loader: &dyn FileLoader,
    opts: &ComposeOptions,
) -> ComposeResult<Map<String, Value>> {
    let basepath = &opts.basepath;
    let visiting: BTreeSet<String> = BTreeSet::new();

    let mut resolved: Map<String, Value>;

    // Field-level $ref / $patch (a field may inherit a whole base spec).
    if spec.contains_key("$ref") || spec.contains_key("$patch") {
        let mut base: Map<String, Value> = Map::new();
        let mut patch: Option<Value> = None;
        let mut own: Map<String, Value> = Map::new();

        for (k, v) in spec {
            if k == "$ref" {
                // Field-level $ref resolves a file's properties layer too (detectKey).
                let res = resolve_ref(&v, basepath, loader, &visiting)?;
                let mut next_base: Map<String, Value> = Map::new();
                for (ok, ov) in own.iter() {
                    next_base.insert(ok.clone(), ov.clone());
                }
                for (rk, rv) in res {
                    next_base.insert(rk, rv);
                }
                base = next_base;
                own.clear();
            } else if k == "$patch" {
                patch = Some(v);
            } else {
                own.insert(k, v);
            }
        }
        let mut merged = base;
        for (k, v) in own {
            merged.insert(k, v);
        }
        if let Some(p) = patch {
            merged = apply_patch(merged, &p)?;
        }
        resolved = merged;
    } else {
        resolved = spec;
    }

    // Recurse into `properties` (composition entry point, SPEC §2 / types.rs:73).
    // ORDER: clone out, compose, re-insert under the SAME key so `properties` keeps
    // its declared position (IndexMap::insert preserves an existing key's slot).
    // remove() here would swap_remove and shove `properties` to a wrong position.
    if let Some(Value::Object(props)) = resolved.get("properties").cloned() {
        let composed = compose_properties(props, loader, opts)?;
        resolved.insert("properties".to_string(), Value::Object(composed));
    }

    Ok(resolved)
}

#[cfg(test)]
mod order_tests {
    //! RAW key-order tests for the composition tree — assert the literal key
    //! SEQUENCE (no sorting). serde_json `Value` `PartialEq` is order-insensitive,
    //! so the cross-language fixture (which uses `==`) cannot catch a reorder; legacy
    //! positional array_merge makes declaration order load-bearing. These turn RED
    //! if a `remove()` (swap_remove) regression re-enters a re-insert path.

    use super::{compose_properties, compose_spec, ComposeOptions};
    use crate::compose::loader::MemoryLoader;
    use serde_json::{json, Value};

    fn keys(v: &Value) -> Vec<String> {
        v.as_object().unwrap().keys().cloned().collect()
    }

    fn loader(files: Value) -> MemoryLoader {
        MemoryLoader::new(files.as_object().unwrap().clone())
    }

    fn props(v: Value) -> serde_json::Map<String, Value> {
        v.as_object().unwrap().clone()
    }

    #[test]
    fn child_recursion_preserves_field_declaration_order() {
        // Three sibling fields, each with a nested `properties` that composes. The
        // re-insert after composing each child must keep a,b,c in order — a
        // remove()+insert (swap_remove) would scramble them to e.g. c,b,a / a,c,b.
        let ml = loader(json!({}));
        let entry = props(json!({
            "a": {"type": "group", "properties": {"x": {"type": "text"}}},
            "b": {"type": "group", "properties": {"y": {"type": "text"}}},
            "c": {"type": "group", "properties": {"z": {"type": "text"}}}
        }));
        let out = compose_properties(entry, &ml, &ComposeOptions::default()).unwrap();
        assert_eq!(keys(&Value::Object(out)), vec!["a", "b", "c"]);
    }

    #[test]
    fn ref_base_then_sibling_after_keeps_base_order_and_appends_new() {
        // base = {a,b}; entry declares $ref then sibling c → a,b (base order) then c.
        let ml = loader(json!({
            "base.yml": {"properties": {"a": {"t": 1}, "b": {"t": 2}}}
        }));
        let entry = props(json!({"$ref": "base.yml", "c": {"t": 3}}));
        let out = compose_properties(entry, &ml, &ComposeOptions::default()).unwrap();
        assert_eq!(keys(&Value::Object(out)), vec!["a", "b", "c"]);
    }

    #[test]
    fn sibling_after_ref_overrides_base_in_its_base_slot() {
        // a declared AFTER $ref overrides the base value but the key keeps the
        // base's slot (insert on an existing key preserves position): a,b order.
        let ml = loader(json!({
            "base.yml": {"properties": {"a": {"from": "base"}, "b": {"t": 2}}}
        }));
        let entry = props(json!({"$ref": "base.yml", "a": {"from": "override"}}));
        let out = compose_properties(entry, &ml, &ComposeOptions::default()).unwrap();
        let out = Value::Object(out);
        assert_eq!(keys(&out), vec!["a", "b"]);
        assert_eq!(out["a"]["from"], json!("override"));
    }

    #[test]
    fn spec_level_properties_keeps_its_declared_position() {
        // type, properties, behavior — composing `properties` must NOT move it to
        // the end (it sits in slot 1 and must stay there).
        let ml = loader(json!({
            "group.yml": {"properties": {"child": {"type": "text"}}}
        }));
        let entry = props(json!({
            "type": "group",
            "properties": {"$ref": "group.yml"},
            "behavior": {"collapsible": true}
        }));
        let out = compose_spec(entry, &ml, &ComposeOptions::default()).unwrap();
        let out = Value::Object(out);
        assert_eq!(keys(&out), vec!["type", "properties", "behavior"]);
        assert_eq!(keys(&out["properties"]), vec!["child"]);
    }

    #[test]
    fn nested_ref_flatten_keeps_inner_then_own_order() {
        // base.yml: $ref inner.yml (deep) then own → inner base laid first, own
        // appended: deep, own (declaration order across the $ref boundary).
        let ml = loader(json!({
            "base.yml": {"properties": {"$ref": "inner.yml", "own": {"from": "base"}}},
            "inner.yml": {"properties": {"deep": {"from": "inner"}}}
        }));
        let entry = props(json!({"$ref": "base.yml"}));
        let out = compose_properties(entry, &ml, &ComposeOptions::default()).unwrap();
        assert_eq!(keys(&Value::Object(out)), vec!["deep", "own"]);
    }
}
