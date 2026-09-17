//! Visibility (validation rules, "Evaluation"): `design.show` resolved against
//! the data in the field's row context.

use serde_json::Value;

use crate::expr::{condition_map, Expression};

/// Whether a `design.show` value shows its field. Only a value that resolves to
/// `false` hides it: a literal `false`, a valid expression that does not hold, or a
/// condition map that selects `false`. A missing value, `null` and a condition map
/// that selects nothing show it. `path` is the field's data path, row keys
/// included.
pub fn show(value: Option<&Value>, data: &Value, path: &[String]) -> bool {
    match value {
        None => true,
        Some(Value::Object(map)) => {
            let entries: Vec<(String, Value)> =
                map.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
            condition_map::resolve(&entries, data, path) != Some(Value::Bool(false))
        }
        // A string that is not a valid expression is a literal.
        Some(Value::String(expression)) => {
            Expression::evaluate(expression, data, path).unwrap_or(true)
        }
        Some(literal) => *literal != Value::Bool(false),
    }
}

/// Whether a field is visible: its `design` object's `show` shows it. A field
/// without `design.show` is visible.
pub fn is_visible(field: &Value, data: &Value, path: &[String]) -> bool {
    match field.get("design") {
        Some(Value::Object(design)) => show(design.get("show"), data, path),
        _ => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn show_values() {
        let data = json!({ "on": 1, "rows": { "r": { "kind": "a" } } });
        let path = |p: &str| p.split('.').map(String::from).collect::<Vec<_>>();
        assert!(show(None, &data, &path("x")));
        assert!(show(Some(&json!(null)), &data, &path("x")));
        assert!(show(Some(&json!("not an (expression")), &data, &path("x")));
        assert!(show(Some(&json!(true)), &data, &path("x")));
        assert!(!show(Some(&json!(false)), &data, &path("x")));
        assert!(show(Some(&json!(".on")), &data, &path("x")));
        assert!(!show(Some(&json!(".off")), &data, &path("x")));
        assert!(show(
            Some(&json!(".kind == 'a'")),
            &data,
            &path("rows.r.note")
        ));
        assert!(!show(
            Some(&json!({ ".on": false, "true": true })),
            &data,
            &path("x")
        ));
        assert!(show(
            Some(&json!({ ".off": false, "true": true })),
            &data,
            &path("x")
        ));
        assert!(show(Some(&json!({ ".off": false })), &data, &path("x")));
        assert!(show(Some(&json!({ ".on": null })), &data, &path("x")));
        assert!(is_visible(&json!({ "design": false }), &data, &path("x")));
        assert!(!is_visible(
            &json!({ "design": { "show": false } }),
            &data,
            &path("x")
        ));
    }
}
