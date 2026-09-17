//! Rule parameter checks (validation rules, "Parameter errors").
//!
//! A parameter outside the definitions is a load failure located at the field's
//! declaration path. Parameters are checked when the specification loads, fields
//! and rules in declaration order, including every literal a condition map or a
//! ternary can select; a value a ternary takes from the data is checked when it is
//! selected. Checking yields the typed parameter the rule uses.

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::{Map, Value};

use crate::compose::{ComposeErrorCode, ComposeLoadError};

use super::errors::ValidateError;
use super::length::{limit, range_limits, MAX_LIMIT};
use super::membership::{members, Comparable};
use super::pattern::{compile, Program};
use super::validator::{
    is_conditional, is_disabled, is_group_with_properties, selectable_literals,
};

/// A checked rule parameter.
pub(crate) enum Parameter {
    /// A rule whose parameter needs no check here.
    Unchecked,
    /// A `minlength` or `maxlength` limit.
    Limit(u64),
    /// `rangelength` limits.
    Range(u64, u64),
    /// A `min` or `max` bound.
    Bound(f64),
    /// `range` bounds.
    Bounds(f64, f64),
    /// A `step` above 0.
    Step(f64),
    /// A `mincount` or `maxcount` limit.
    Count(u64),
    /// `in` members.
    Members(Vec<Comparable>),
    /// A compiled `pattern` or `match`.
    Pattern(Arc<Program>),
}

/// Patterns compiled while the specification loaded, by source text.
#[derive(Default)]
pub(crate) struct Patterns(HashMap<String, Arc<Program>>);

/// Check every declared parameter of `properties`; returns the compiled patterns.
pub(crate) fn check_declared(properties: &Map<String, Value>) -> Result<Patterns, ValidateError> {
    let mut patterns = Patterns::default();
    check_fields(properties, &mut Vec::new(), &mut patterns)?;
    Ok(patterns)
}

fn check_fields(
    properties: &Map<String, Value>,
    path: &mut Vec<String>,
    patterns: &mut Patterns,
) -> Result<(), ValidateError> {
    for (key, field) in properties {
        if !field.is_object() {
            continue;
        }
        path.push(key.clone());
        if let Some(Value::Object(rules)) = field.get("validate") {
            for (rule, value) in rules {
                if is_disabled(value) {
                    continue;
                }
                if is_conditional(rule, value) {
                    for literal in selectable_literals(rule, value) {
                        if !is_disabled(&literal) {
                            check(rule, &literal, path, patterns)?;
                        }
                    }
                    continue;
                }
                if let Parameter::Pattern(program) = check(rule, value, path, patterns)? {
                    if let Value::String(source) = value {
                        patterns.0.insert(source.clone(), program);
                    }
                }
            }
        }
        if let Some(children) = is_group_with_properties(field) {
            check_fields(children, path, patterns)?;
        }
        path.pop();
    }
    Ok(())
}

/// Check the parameter `rule` uses; `path` is the field's declaration path.
/// A `false` or `null` parameter disables the rule and is never passed here.
pub(crate) fn check(
    rule: &str,
    parameter: &Value,
    path: &[String],
    patterns: &Patterns,
) -> Result<Parameter, ValidateError> {
    let invalid = |message: String| {
        ValidateError::Load(ComposeLoadError::with_trace(
            ComposeErrorCode::InvalidRuleParameter,
            message,
            path.to_vec(),
        ))
    };
    match rule {
        "minlength" | "maxlength" => limit(parameter).map(Parameter::Limit).ok_or_else(|| {
            invalid(format!(
                "Invalid {rule} parameter: expected an integer from 0 to {MAX_LIMIT}"
            ))
        }),
        "rangelength" => range_limits(parameter)
            .map(|(minimum, maximum)| Parameter::Range(minimum, maximum))
            .ok_or_else(|| {
                invalid(
                    "Invalid rangelength parameter: expected [minimum, maximum] integers \
                     with minimum not above maximum"
                        .to_string(),
                )
            }),
        "number" | "digits" => match parameter {
            Value::Bool(_) => Ok(Parameter::Unchecked),
            _ => Err(invalid(format!(
                "Invalid {rule} parameter: expected true or false"
            ))),
        },
        "min" | "max" => finite(parameter).map(Parameter::Bound).ok_or_else(|| {
            invalid(format!(
                "Invalid {rule} parameter: expected a finite number"
            ))
        }),
        "range" => match parameter.as_array().map(Vec::as_slice) {
            Some([minimum, maximum]) => match (finite(minimum), finite(maximum)) {
                (Some(minimum), Some(maximum)) if minimum <= maximum => {
                    Some(Parameter::Bounds(minimum, maximum))
                }
                _ => None,
            },
            _ => None,
        }
        .ok_or_else(|| {
            invalid(
                "Invalid range parameter: expected [minimum, maximum] finite numbers \
                 with minimum not above maximum"
                    .to_string(),
            )
        }),
        "step" => finite(parameter)
            .filter(|step| *step > 0.0)
            .map(Parameter::Step)
            .ok_or_else(|| {
                invalid("Invalid step parameter: expected a finite number above 0".to_string())
            }),
        "mincount" | "maxcount" => limit(parameter).map(Parameter::Count).ok_or_else(|| {
            invalid(format!(
                "Invalid {rule} parameter: expected an integer from 0 to {MAX_LIMIT}"
            ))
        }),
        "in" => members(parameter)
            .map(Parameter::Members)
            .map_err(|error| invalid(error.message().to_string())),
        "pattern" | "match" => {
            let Value::String(source) = parameter else {
                return Err(invalid(format!(
                    "Invalid {rule} parameter: expected a pattern string"
                )));
            };
            if let Some(program) = patterns.0.get(source) {
                return Ok(Parameter::Pattern(Arc::clone(program)));
            }
            compile(source)
                .map(|program| Parameter::Pattern(Arc::new(program)))
                .map_err(|error| {
                    ValidateError::Load(ComposeLoadError::with_trace(
                        ComposeErrorCode::InvalidRulePattern,
                        format!("Invalid {rule} pattern: {error}"),
                        path.to_vec(),
                    ))
                })
        }
        _ => Ok(Parameter::Unchecked),
    }
}

/// A JSON number as a finite double.
fn finite(value: &Value) -> Option<f64> {
    value.as_f64().filter(|number| number.is_finite())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn failure(properties: Value) -> (String, String, String) {
        let properties = properties.as_object().cloned().expect("a properties map");
        let Err(error) = check_declared(&properties) else {
            panic!("the declaration loaded");
        };
        (
            error.code().to_string(),
            error.message().to_string(),
            error.at(),
        )
    }

    #[test]
    fn fields_and_rules_are_checked_in_declaration_order() {
        let (code, message, at) = failure(json!({
            "a": { "type": "text", "validate": { "in": [], "pattern": "(" } },
            "b": { "type": "text", "validate": { "maxlength": -1 } },
        }));
        assert_eq!(code, "INVALID_RULE_PARAMETER");
        assert_eq!(message, "Invalid in parameter: members must not be empty");
        assert_eq!(at, "a");

        let (code, message, at) = failure(json!({
            "g": {
                "type": "group",
                "multiple": true,
                "validate": { "required": true },
                "properties": { "n": { "type": "text", "validate": { "match": "a{2}{3}" } } },
            },
        }));
        assert_eq!(code, "INVALID_RULE_PATTERN");
        assert_eq!(message, "Invalid match pattern: invalid quantifier at 4");
        assert_eq!(at, "g.n");
    }

    #[test]
    fn selectable_literals_are_checked_at_load() {
        for (rule, value, message) in [
            (
                "minlength",
                json!({ ".big": 1.5, "true": 2 }),
                "Invalid minlength parameter: expected an integer from 0 to 9007199254740991",
            ),
            (
                "maxlength",
                json!(".big ? 3 : -1"),
                "Invalid maxlength parameter: expected an integer from 0 to 9007199254740991",
            ),
            (
                "maxlength",
                json!(".a ? .limit : .b ? 2 : \"x\""),
                "Invalid maxlength parameter: expected an integer from 0 to 9007199254740991",
            ),
            (
                "rangelength",
                json!({ ".a": [3, 2] }),
                "Invalid rangelength parameter: expected [minimum, maximum] integers \
                 with minimum not above maximum",
            ),
        ] {
            let (code, actual, at) = failure(json!({
                "g": { "type": "group", "properties": {
                    "v": { "type": "text", "validate": { rule: value } },
                } },
            }));
            assert_eq!(code, "INVALID_RULE_PARAMETER");
            assert_eq!(actual, message, "{value}");
            assert_eq!(at, "g.v");
        }
    }

    #[test]
    fn disabled_conditional_and_unchecked_parameters_load() {
        let properties = json!({
            "a": { "type": "text", "validate": {
                "minlength": false, "maxlength": null, "in": false, "pattern": null,
                "rangelength": ".x ? .range : false", "match": false,
                "min": ".x", "unknown": [],
            } },
            "b": { "type": "text", "validate": {
                "maxlength": { ".x": 3, "true": null },
                "minlength": ".x ? .limit : .y ? 2 : false",
            } },
            // Only groups are descended into, as the validator does.
            "c": { "type": "text", "properties": { "d": { "validate": { "in": [] } } } },
        });
        if let Err(error) = check_declared(properties.as_object().unwrap()) {
            panic!("{error:?}");
        }
    }
}
