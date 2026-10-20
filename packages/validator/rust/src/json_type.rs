//! The JavaScript `typeof` bucket of a JSON value, which the error texts and the loose
//! equality of the expression engine name.

use serde_json::Value;

/// JS `typeof` bucket: number covers int and float; arrays/objects are 'object'.
pub(crate) fn js_type_of(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) | Value::Object(_) => "object",
    }
}
