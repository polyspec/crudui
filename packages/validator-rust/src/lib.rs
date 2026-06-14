//! formspec-validator: Rust port of the form-spec multi-language validator.
//! Replicates the JS/PHP/Go reference validators exactly (shared fixtures are
//! the single source of truth). Go's validator package is the primary blueprint.
#![deny(missing_docs)]

pub mod condition_parser;
pub mod rules;
pub mod spec;
pub mod ternary;
pub mod types;
pub mod v2;
pub mod validator;
pub mod value;

pub use spec::{parse_spec, ParsedSpec};
pub use types::{Field, Spec, ValidationError, ValidationResult};
pub use validator::Validator;

use serde_json::Value;

/// CliResponse mirrors the cross-language CLI protocol output.
#[derive(Debug, Clone)]
pub struct CliResponse {
    /// Whether the data passed validation.
    pub valid: bool,
    /// First error message, if any (None when valid).
    pub error: Option<String>,
    /// Field name the first error belongs to, if any.
    pub field: Option<String>,
}

/// convert_input matches the spec structure: group specs receive the input
/// object as-is; non-group specs are wrapped under "value". The "__undefined__"
/// marker maps to value=null. Ports cmd/validate convertInput.
pub fn convert_input(is_group: bool, input: &Value) -> Value {
    if is_group {
        if input.is_object() {
            return input.clone();
        }
        return Value::Object(Default::default());
    }
    if let Value::String(s) = input {
        if s == "__undefined__" {
            let mut m = serde_json::Map::new();
            m.insert("value".to_string(), Value::Null);
            return Value::Object(m);
        }
    }
    let mut m = serde_json::Map::new();
    m.insert("value".to_string(), input.clone());
    Value::Object(m)
}

/// run_validation parses the spec, converts the input, validates, and returns
/// the first-error CLI response. This is the single entry shared by the CLI
/// binary and the conformance tests.
pub fn run_validation(spec_value: &Value, input: &Value) -> CliResponse {
    let parsed = parse_spec(spec_value);
    let validator_input = convert_input(parsed.is_group, input);
    let mut v = Validator::new(parsed.spec);
    let result = v.validate(&validator_input);

    if result.is_valid || result.errors.is_empty() {
        CliResponse {
            valid: result.is_valid,
            error: None,
            field: None,
        }
    } else {
        CliResponse {
            valid: false,
            error: Some(result.errors[0].rule.clone()),
            field: Some(result.errors[0].field.clone()),
        }
    }
}
