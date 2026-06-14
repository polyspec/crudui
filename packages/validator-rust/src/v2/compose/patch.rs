//! `$patch` application — add / remove / replace over the `$ref` base (SPEC-V2
//! §5). Absorbs the legacy v1 directives `$after`/`$before`/`$merge`/`$change`/
//! `$remove` (the analysis legacy_mapping):
//!
//!   $after / $before {existing:{new:val}}  → add   (position = declaration order;
//!                                            v2 properties preserve insert order)
//!   $merge / $change {key:{sub:val}}       → replace + add (deep-merge; scalar =
//!                                            replace, new subkey = add)
//!   $remove [k1,k2] | {k:{sub:…}}          → remove (whole key or deep subkey)
//!
//! v2 normalization (the analysis patch_ops): `$patch` is an OBJECT of operations.
//! Two shapes coexist (both ported from v1, both order-preserving):
//!
//!   1. Deep-path set — `"field.validate.required": ".other"`. The dotted key is
//!      split into path segments and the value is SET at that node (creating
//!      intermediate objects). SPEC §5 canonical form. The value replaces a
//!      scalar leaf; for object values it deep-merges (v1 $merge =
//!      drupal_array_merge_deep_array: both-array → deep merge, else latter wins).
//!
//!   2. Structured ops — explicit `add` / `remove` / `replace` keys:
//!      - add:     `{ "path.to.new": value, … }`   — deep-merge value at path
//!      - replace: `{ "path.to.key": value, … }`   — same merge rule (scalar override)
//!      - remove:  `[ "path.to.key", … ] | { … }`  — deep delete (v1 arr::remove)
//!
//! Resolution order: base ($ref) first, then $patch overlays. add/replace
//! deep-merge; remove deep-deletes; deep-path set splits then applies. An
//! unresolved patch (op shape error, path conflict, strict-remove miss) is a
//! LOAD ERROR — never `valid:true`.

use serde_json::{Map, Value};

use super::errors::{ComposeErrorCode, ComposeLoadError, ComposeResult};

/// Apply a `$patch` value to the (already `$ref`-expanded) base spec.
pub fn apply_patch(base: Map<String, Value>, patch: &Value) -> ComposeResult<Map<String, Value>> {
    let p = match patch {
        Value::Object(obj) => obj,
        other => {
            return Err(ComposeLoadError::new(
                ComposeErrorCode::PatchShape,
                format!(
                    "$patch must be an object of operations, got {}",
                    kind_of(other)
                ),
            ));
        }
    };

    let mut result = base;

    // Apply entries in declaration order (serde_json preserve_order = insert order).
    for (key, val) in p {
        match key.as_str() {
            "add" | "replace" => {
                result = apply_add_replace(result, val, key)?;
            }
            "remove" => {
                result = apply_remove(result, val)?;
            }
            // Deep-path set (SPEC §5 canonical form): "a.b.c": value.
            _ => {
                let segments = split_path(key)?;
                result = set_deep_path(result, &segments, val)?;
            }
        }
    }
    Ok(result)
}

/// Structured add/replace: a map of deep-path → value, deep-merged at each path.
fn apply_add_replace(
    base: Map<String, Value>,
    val: &Value,
    op: &str,
) -> ComposeResult<Map<String, Value>> {
    let obj = match val {
        Value::Object(obj) => obj,
        _ => {
            return Err(ComposeLoadError::new(
                ComposeErrorCode::PatchShape,
                format!("$patch.{} must be an object of deep-path → value", op),
            ));
        }
    };
    let mut result = base;
    for (path, value) in obj {
        let segments = split_path(path)?;
        result = set_deep_path(result, &segments, value)?;
    }
    Ok(result)
}

/// Structured remove: an array of deep-paths, or a nested `{k:{sub:…}}` map.
fn apply_remove(base: Map<String, Value>, val: &Value) -> ComposeResult<Map<String, Value>> {
    match val {
        Value::Array(items) => {
            let mut result = base;
            for path in items {
                let s = match path {
                    Value::String(s) => s,
                    _ => {
                        return Err(ComposeLoadError::new(
                            ComposeErrorCode::PatchShape,
                            "$patch.remove array entries must be strings",
                        ));
                    }
                };
                let segments = split_path(s)?;
                result = remove_deep_path(result, &segments)?;
            }
            Ok(result)
        }
        // Nested map form (v1 arr::remove): recurse where both sides are objects.
        Value::Object(spec) => Ok(remove_nested(base, spec)),
        _ => Err(ComposeLoadError::new(
            ComposeErrorCode::PatchShape,
            "$patch.remove must be an array of paths or a nested object",
        )),
    }
}

/// Split a dotted deep-path into segments. Empty path is a shape error.
fn split_path(path: &str) -> ComposeResult<Vec<String>> {
    if path.is_empty() {
        return Err(ComposeLoadError::new(
            ComposeErrorCode::PatchShape,
            "$patch path must be non-empty",
        ));
    }
    Ok(path.split('.').map(|s| s.to_string()).collect())
}

/// Set a value at a deep path, creating intermediate objects. When both the
/// existing leaf and the new value are plain objects, DEEP-MERGE (v1 $merge);
/// otherwise the new value REPLACES (v1 scalar override). Returns a new tree.
///
/// ORDER: a key that already exists must keep its declared position. We read the
/// existing value (get().cloned()) WITHOUT removing it, then `insert` under the
/// same key — IndexMap::insert keeps an existing key in place. A `remove`
/// (= swap_remove) before re-insert would corrupt the positional order that v1's
/// array_merge merge priority depends on. A brand-new key is appended (add).
fn set_deep_path(
    mut node: Map<String, Value>,
    segments: &[String],
    value: &Value,
) -> ComposeResult<Map<String, Value>> {
    let head = &segments[0];
    let rest = &segments[1..];

    if rest.is_empty() {
        // Read existing leaf in place (no remove → no swap reorder), merge, re-set.
        let existing = node.get(head).cloned();
        let merged = merge_value(existing.as_ref(), value);
        node.insert(head.clone(), merged); // existing key keeps its slot
        return Ok(node);
    }

    // Read the child in place; descend a clone; re-insert under the same key.
    match node.get(head).cloned() {
        None => {
            let sub = set_deep_path(Map::new(), rest, value)?;
            node.insert(head.clone(), Value::Object(sub)); // new key appended
        }
        Some(Value::Object(obj)) => {
            let sub = set_deep_path(obj, rest, value)?;
            node.insert(head.clone(), Value::Object(sub)); // existing key keeps slot
        }
        Some(_) => {
            // Intermediate node is a scalar/array — cannot descend into it.
            return Err(ComposeLoadError::new(
                ComposeErrorCode::PatchPathConflict,
                format!("$patch cannot descend into non-object at '{}'", head),
            ));
        }
    }
    Ok(node)
}

/// v1 deep-merge leaf rule (drupal_array_merge_deep_array): both plain objects →
/// recursive deep merge; otherwise the latter value wins (scalar/array override).
fn merge_value(existing: Option<&Value>, incoming: &Value) -> Value {
    if let (Some(Value::Object(ex)), Value::Object(inc)) = (existing, incoming) {
        let mut out = ex.clone();
        for (k, v) in inc {
            let merged = merge_value(out.get(k), v);
            out.insert(k.clone(), merged);
        }
        return Value::Object(out);
    }
    incoming.clone()
}

/// Delete a value at a deep path. Strict: a missing target is a load error.
fn remove_deep_path(
    mut node: Map<String, Value>,
    segments: &[String],
) -> ComposeResult<Map<String, Value>> {
    let head = &segments[0];
    let rest = &segments[1..];

    if !node.contains_key(head) {
        return Err(ComposeLoadError::new(
            ComposeErrorCode::PatchRemoveTargetMissing,
            format!("$patch remove target not found: '{}'", segments.join(".")),
        ));
    }

    if rest.is_empty() {
        // Pure delete: shift_remove keeps the ORDER of the surviving keys (the
        // default remove = swap_remove would move the last key into this slot).
        node.shift_remove(head);
        return Ok(node);
    }

    // Descend: read the child in place, recurse on a clone, re-insert under the
    // same key so the parent keeps its declared position (insert preserves slot).
    match node.get(head).cloned() {
        Some(Value::Object(obj)) => {
            let sub = remove_deep_path(obj, rest)?;
            node.insert(head.clone(), Value::Object(sub));
            Ok(node)
        }
        _ => Err(ComposeLoadError::new(
            ComposeErrorCode::PatchRemoveTargetMissing,
            format!("$patch remove cannot descend into non-object at '{}'", head),
        )),
    }
}

/// Nested-map remove (v1 arr::remove): for each key, recurse when both the target
/// and the removal spec are objects, else unset the key. A missing key is
/// tolerated here (v1 arr::remove silently unsets), unlike the array-path form.
fn remove_nested(mut base: Map<String, Value>, spec: &Map<String, Value>) -> Map<String, Value> {
    for (key, sub) in spec {
        match (base.get(key).cloned(), sub) {
            // Both target and spec are objects: recurse. Read the target in place,
            // recurse on a clone, re-insert under the same key — the surviving key
            // keeps its declared slot (insert preserves an existing key's order).
            (Some(Value::Object(target)), Value::Object(sub_obj)) => {
                let next = remove_nested(target, sub_obj);
                base.insert(key.clone(), Value::Object(next));
            }
            // Otherwise unset the whole key. shift_remove keeps the ORDER of the
            // remaining keys (default remove = swap_remove would reorder them).
            _ => {
                base.shift_remove(key);
            }
        }
    }
    base
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

#[cfg(test)]
mod order_tests {
    //! RAW key-order tests — assert the literal key SEQUENCE (no sorting), since
    //! serde_json `Map`/`Value` `PartialEq` is order-INSENSITIVE (IndexMap eq
    //! compares membership only) and would silently pass a swap_remove reorder.
    //! v1 positional array_merge makes declaration order load-bearing; these tests
    //! turn RED if a `remove()` (swap_remove) ever creeps back into a re-insert
    //! path. `to_string` serializes in IndexMap insertion order, so the emitted
    //! byte string is the order oracle (must match JS/PHP/Go byte-for-byte).

    use super::apply_patch;
    use serde_json::{json, Value};

    /// Top-level key sequence of a JSON object value (no sort).
    fn keys(v: &Value) -> Vec<String> {
        v.as_object().unwrap().keys().cloned().collect()
    }

    #[test]
    fn deep_path_set_keeps_target_field_in_place() {
        // `field` is slot 1 of 4: a leaf-set must NOT move it to the end (a
        // swap_remove of `field` would pull the last key `d` into slot 1, then
        // append `field` → [a,d,c,field]). The patched leaf `required` is the
        // MIDDLE of 3 inner keys (email,required,maxlength): a swap_remove of a
        // non-last key would shove `maxlength` into the hole → [email,maxlength,
        // required]. Both are real swap_remove guards (not last-key no-ops).
        let base = json!({
            "a": {"t": 1},
            "field": {"validate": {"email": true, "required": false, "maxlength": 9}},
            "c": {"t": 2},
            "d": {"t": 3}
        });
        let out = apply_patch(base.as_object().unwrap().clone(), &json!({
            "field.validate.required": ".other"
        }))
        .unwrap();
        let out = Value::Object(out);
        assert_eq!(keys(&out), vec!["a", "field", "c", "d"]);
        // Nested key order under field.validate must survive in full.
        assert_eq!(
            keys(&out["field"]["validate"]),
            vec!["email", "required", "maxlength"]
        );
        // Byte oracle: required updated in place, no reordering at any level.
        assert_eq!(
            serde_json::to_string(&out["field"]).unwrap(),
            r#"{"validate":{"email":true,"required":".other","maxlength":9}}"#
        );
    }

    #[test]
    fn deep_path_set_appends_only_genuinely_new_keys() {
        let base = json!({"a": 1, "b": 2});
        let out = apply_patch(base.as_object().unwrap().clone(), &json!({"c": 3}))
            .unwrap();
        assert_eq!(keys(&Value::Object(out)), vec!["a", "b", "c"]);
    }

    #[test]
    fn add_appends_replace_keeps_position() {
        let base = json!({"a": {"design": {"class": "old"}}, "b": 2, "c": 3});
        // replace a.design.class (in place) + add newf (append).
        let out = apply_patch(base.as_object().unwrap().clone(), &json!({
            "replace": {"a.design.class": "new"},
            "add": {"newf": {"t": 1}}
        }))
        .unwrap();
        assert_eq!(keys(&Value::Object(out.clone())), vec!["a", "b", "c", "newf"]);
        assert_eq!(out["a"]["design"]["class"], json!("new"));
    }

    #[test]
    fn remove_leaf_preserves_sibling_order() {
        // Remove the MIDDLE sibling: swap_remove would pull the last key (`z`)
        // into the hole and scramble order; shift_remove keeps a,c,z order.
        let base = json!({"a": 1, "remove_me": 2, "c": 3, "z": 4});
        let out = apply_patch(base.as_object().unwrap().clone(), &json!({
            "remove": ["remove_me"]
        }))
        .unwrap();
        assert_eq!(keys(&Value::Object(out)), vec!["a", "c", "z"]);
    }

    #[test]
    fn remove_deep_keeps_parent_and_inner_order() {
        // Remove field.options.max_tags — `field` (slot 0) stays put, and the
        // surviving inner key order (keyword_min_length) is unchanged.
        let base = json!({
            "field": {"type": "tags", "options": {"max_tags": 5, "keyword_min_length": 2}},
            "sibling": {"t": 1}
        });
        let out = apply_patch(base.as_object().unwrap().clone(), &json!({
            "remove": ["field.options.max_tags"]
        }))
        .unwrap();
        let out = Value::Object(out);
        assert_eq!(keys(&out), vec!["field", "sibling"]);
        assert_eq!(keys(&out["field"]), vec!["type", "options"]);
        assert_eq!(keys(&out["field"]["options"]), vec!["keyword_min_length"]);
    }

    #[test]
    fn remove_nested_map_form_preserves_order() {
        let base = json!({
            "f": {"options": {"max_tags": 5, "min": 2}},
            "g": {"t": 1}
        });
        let out = apply_patch(base.as_object().unwrap().clone(), &json!({
            "remove": {"f": {"options": {"max_tags": true}}}
        }))
        .unwrap();
        let out = Value::Object(out);
        assert_eq!(keys(&out), vec!["f", "g"]);
        assert_eq!(keys(&out["f"]["options"]), vec!["min"]);
    }

    #[test]
    fn remove_nested_whole_key_preserves_remaining_order() {
        let base = json!({"a": {"t": 1}, "b": {"t": 2}, "c": {"t": 3}});
        let out = apply_patch(base.as_object().unwrap().clone(), &json!({
            "remove": {"b": true}
        }))
        .unwrap();
        assert_eq!(keys(&Value::Object(out)), vec!["a", "c"]);
    }
}
