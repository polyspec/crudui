//! Single-choice data (validation-rules.md, "Evaluation").
//!
//! A field of type `select`, `dropdown`, `selectbox`, `choice` or `radio` whose `lang`
//! is absent, `false` or `null` holds one value: a string, a number, a boolean or `null`.

use serde_json::Value;

use super::errors::{FormInputError, ValidateError};

/// The field types whose control holds one value.
const SINGLE_CHOICE_TYPES: [&str; 5] = ["select", "dropdown", "selectbox", "choice", "radio"];

/// Whether a field is a single-choice field: a single-choice type without `lang`.
pub(crate) fn is_single_choice(field: &Value) -> bool {
    let single = field
        .get("type")
        .and_then(Value::as_str)
        .is_some_and(|kind| SINGLE_CHOICE_TYPES.contains(&kind));
    single
        && matches!(
            field.get("lang"),
            None | Some(Value::Null) | Some(Value::Bool(false))
        )
}

/// Reject an array or object as the value of a single-choice field, or of a row of a
/// repeated one (rows in sorted key order). `path` is the field's data path.
pub(crate) fn check_single_choice_data(
    value: &Value,
    path: &[String],
    repeated: bool,
) -> Result<(), ValidateError> {
    if !repeated {
        return single_value(value, path);
    }
    if let Value::Object(rows) = value {
        let mut keys: Vec<&String> = rows.keys().collect();
        keys.sort();
        for key in keys {
            let mut row_path = path.to_vec();
            row_path.push(key.clone());
            single_value(&rows[key.as_str()], &row_path)?;
        }
    }
    Ok(())
}

fn single_value(value: &Value, path: &[String]) -> Result<(), ValidateError> {
    if value.is_array() || value.is_object() {
        return Err(FormInputError::new(format!(
            "Choice data must be a single value: {}",
            path.join(".")
        ))
        .into());
    }
    Ok(())
}
