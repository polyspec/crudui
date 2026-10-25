//! The `conditionTree` rule (docs/spec/schema.md, Condition trees): a value passes
//! when it is a group `{all: [...]}` or `{any: [...]}`, a field comparison
//! `{field, op, value}` or, under the parameter `judge`, a judged text `{judge}`, at
//! most 32 levels deep. The check reads no level below the limit.

use serde_json::Value;

use super::whitespace::trim;

/// The deepest level of a condition tree; the root condition is level 1 (CUSC-075).
const DEPTH: usize = 32;

/// The operators of a field comparison (CUSC-073).
const OPERATORS: &[&str] = &["eq", "ne", "lt", "le", "gt", "ge", "in", "has"];

/// The parameter error of `conditionTree` (CUVR-068).
pub(crate) const PARAMETER_ERROR: &str =
    "Invalid conditionTree parameter: expected true, false or judge";

/// Whether a parameter enables the rule: `true` or `judge`.
pub(crate) fn is_parameter(parameter: &Value) -> bool {
    matches!(parameter, Value::Bool(true)) || parameter.as_str() == Some("judge")
}

/// Whether `node`, at `level`, is a condition; `judge` permits judged text.
pub(crate) fn is_condition(node: &Value, judge: bool, level: usize) -> bool {
    let Value::Object(members) = node else {
        return false;
    };
    if level > DEPTH {
        return false;
    }
    let mut names: Vec<&str> = members.keys().map(String::as_str).collect();
    names.sort_unstable();
    match names.as_slice() {
        ["all"] | ["any"] => match &members[names[0]] {
            Value::Array(list) => list.iter().all(|item| is_condition(item, judge, level + 1)),
            _ => false,
        },
        ["field", "op", "value"] => {
            let op = members["op"].as_str();
            if !is_text(&members["field"]) || !op.is_some_and(|op| OPERATORS.contains(&op)) {
                return false;
            }
            match (op, &members["value"]) {
                (Some("in"), Value::Array(list)) => list.iter().all(is_scalar),
                (Some("in"), _) => false,
                (_, value) => is_scalar(value),
            }
        }
        ["judge"] => judge && is_text(&members["judge"]),
        _ => false,
    }
}

/// Whether a value is a string, a finite number or a boolean.
fn is_scalar(value: &Value) -> bool {
    match value {
        Value::String(_) | Value::Bool(_) => true,
        Value::Number(number) => number.as_f64().is_some_and(f64::is_finite),
        _ => false,
    }
}

/// Whether a value is a string that is not empty after trimming.
fn is_text(value: &Value) -> bool {
    value.as_str().is_some_and(|text| !trim(text).is_empty())
}
