//! CRUDUI form validator (SPEC §2 G5→§3→§2 G1, JS `Validator` parity).
//!
//! The third pass of the CRUDUI pipeline. It consumes a COMPOSED CRUDUI field model (the
//! `validate`/`design`/`behavior`/`options` role slots) AFTER the compose pass has
//! expanded `$ref`/`$patch`. Its field-model logic: (a) reading the `validate` slot
//! (there is no `rules` key); (b) evaluating a rule value that is an expression OR a condition
//! map (G1 — the condition is the value's expression, never a separate key); and
//! (c) visibility from `design.show` alone: a hidden field and its descendants are
//! not evaluated (`display_switch`/`display_target` are forbidden keys, G1).
//!
//! Byte-for-byte with the JS reference; the shared 4-language fixture
//! `tests/fixtures/validate/cases.json` is the single source of truth. errors are
//! collected in declaration/traversal order and NEVER reordered.

use serde_json::{Map, Value};

use crate::expr::{Evaluator, Expression, Node};

use super::errors::{FormInputError, ValidateError};
use super::parameters::{check, check_declared, Patterns};
use super::rules::{get_rule, is_condition_expression, RuleContext};
use super::visibility::is_visible;

/// A single validation error (JS `ValidationError`: path/field/rule/message/value).
#[derive(Debug, Clone, PartialEq)]
pub struct ValidationError {
    /// Dot-joined absolute path to the field (`items.1.code`, `rows.__a__.v`).
    pub path: String,
    /// The path's last segment.
    pub field: String,
    /// The failed rule's name (verbatim — `pattern`/`match` aliases distinct).
    pub rule: String,
    /// The display message (override → default with `{0}`/`{1}` → fallback).
    pub message: String,
    /// The failing value (the whole array for an array-level rule).
    pub value: Value,
}

impl ValidationError {
    /// Serialize to the cross-language JSON object shape.
    pub fn to_value(&self) -> Value {
        let mut m = Map::new();
        m.insert("path".to_string(), Value::String(self.path.clone()));
        m.insert("field".to_string(), Value::String(self.field.clone()));
        m.insert("rule".to_string(), Value::String(self.rule.clone()));
        m.insert("message".to_string(), Value::String(self.message.clone()));
        m.insert("value".to_string(), self.value.clone());
        Value::Object(m)
    }
}

/// The validation result (JS `{ valid, errors }`).
#[derive(Debug, Clone, PartialEq)]
pub struct ValidationResult {
    /// True iff there are no errors.
    pub valid: bool,
    /// Errors in traversal/declaration order (never reordered).
    pub errors: Vec<ValidationError>,
}

// ---------------------------------------------------------------------------
// Rule-class tables (identical to the JS reference `Validator`).
// ---------------------------------------------------------------------------

/// Rules that apply to the whole array of a `multiple` field.
const ARRAY_LEVEL_RULES: &[&str] = &["required", "unique", "mincount", "maxcount"];

/// Rules whose param is a field reference / filter — preserved verbatim.
const PATH_REFERENCE_RULES: &[&str] = &["equalTo", "notEqual", "unique", "enddate"];

/// Rules whose string param is a literal value, never a condition.
const LITERAL_PARAM_RULES: &[&str] = &["accept"];

/// Rules whose string param is a pattern preserved verbatim.
const PATTERN_PARAM_RULES: &[&str] = &["match", "pattern"];

/// Membership rules whose param is the allowed-value SET (an array, comma string,
/// or a static value→label map, SPEC §2 G3). The param is data, NOT a
/// condition map — an object param is the value→label map (key = option value,
/// value = display label), kept verbatim and never evaluated key-by-key as
/// expressions. The rule's flatten reads keys for a value→label map (the label,
/// possibly a LangMap or null, is display-only).
const MEMBERSHIP_PARAM_RULES: &[&str] = &["in"];

/// The CRUDUI validator over a composed spec.
pub struct Validator {
    properties: Map<String, Value>,
    patterns: Patterns,
}

impl Validator {
    /// Build from a composed root group's `properties` map, checking every
    /// declared rule parameter. A parameter outside the validation-rule
    /// definitions returns a load failure located at the field's declaration path.
    pub fn new(properties: Map<String, Value>) -> Result<Self, ValidateError> {
        let patterns = check_declared(&properties)?;
        Ok(Validator {
            properties,
            patterns,
        })
    }

    /// Validate `data` against the composed CRUDUI spec. Root, group and repeated
    /// data with the wrong shape return an input failure, and a parameter selected
    /// by a condition that is outside the definitions returns a load failure;
    /// neither produces a result.
    pub fn validate(&self, data: &Value) -> Result<ValidationResult, ValidateError> {
        if !data.is_object() {
            return Err(FormInputError::new("Form data must be an object").into());
        }
        let mut errors: Vec<ValidationError> = Vec::new();
        self.validate_properties(&self.properties, data, &[], &[], data, false, &mut errors)?;
        Ok(ValidationResult {
            valid: errors.is_empty(),
            errors,
        })
    }

    // =====================================================================
    // Field traversal (SPEC §3).
    // =====================================================================

    /// `current_path` is the data path (with row keys); `declaration_path` is the
    /// field's declaration path (without row keys); `hidden` says an enclosing field
    /// is hidden, so only the data shape is checked.
    #[allow(clippy::too_many_arguments)]
    fn validate_properties(
        &self,
        properties: &Map<String, Value>,
        data: &Value,
        current_path: &[String],
        declaration_path: &[String],
        all_data: &Value,
        hidden: bool,
        errors: &mut Vec<ValidationError>,
    ) -> Result<(), ValidateError> {
        let empty = Value::Object(Map::new());
        for (property_key, field) in properties {
            if !field.is_object() {
                continue;
            }
            let is_multiple = is_multiple(field);
            let mut field_path = current_path.to_vec();
            field_path.push(property_key.clone());
            let mut declaration = declaration_path.to_vec();
            declaration.push(property_key.clone());
            let declaration = declaration.as_slice();
            // The rules of a hidden field and of everything it contains are not
            // evaluated; the data shape is checked all the same.
            let hidden = hidden || !is_visible(field, all_data, &field_path);
            let present = data.get(property_key);
            let field_value = present.cloned().unwrap_or(Value::Null);

            if is_multiple && present.is_some_and(|value| !value.is_object()) {
                return Err(FormInputError::new(format!(
                    "Repeated data must be a keyed object: {}",
                    path_to_string(&field_path)
                ))
                .into());
            }

            if let Some(child_props) = is_group_with_properties(field) {
                if is_multiple {
                    // Missing data is an empty collection: no rows.
                    if let Some(Value::Object(rows)) = present {
                        // Keyed rows use sorted-key traversal so the first reported
                        // error is identical in every validation implementation.
                        let mut keys: Vec<&String> = rows.keys().collect();
                        keys.sort();
                        for key in keys {
                            let mut row_path = field_path.clone();
                            row_path.push(key.clone());
                            let row = &rows[key.as_str()];
                            if !row.is_object() {
                                return Err(FormInputError::new(format!(
                                    "Group data must be an object: {}",
                                    path_to_string(&row_path)
                                ))
                                .into());
                            }
                            self.validate_properties(
                                child_props,
                                row,
                                &row_path,
                                declaration,
                                all_data,
                                hidden,
                                errors,
                            )?;
                        }
                    }
                    if !hidden {
                        self.validate_field_rules(
                            field,
                            &field_value,
                            &field_path,
                            declaration,
                            all_data,
                            errors,
                        )?;
                    }
                } else {
                    if present.is_some_and(|value| !value.is_object()) {
                        return Err(FormInputError::new(format!(
                            "Group data must be an object: {}",
                            path_to_string(&field_path)
                        ))
                        .into());
                    }
                    let nested = present.unwrap_or(&empty);
                    self.validate_properties(
                        child_props,
                        nested,
                        &field_path,
                        declaration,
                        all_data,
                        hidden,
                        errors,
                    )?;
                    if !hidden {
                        self.validate_field_rules(
                            field,
                            &field_value,
                            &field_path,
                            declaration,
                            all_data,
                            errors,
                        )?;
                    }
                }
            } else if hidden {
                // A hidden scalar field has no rules to run and no shape below it.
            } else if is_multiple {
                // Missing data is an empty collection: no rows.
                let no_rows = Map::new();
                let rows = match present {
                    Some(Value::Object(rows)) => rows,
                    _ => &no_rows,
                };
                self.validate_multiple_field_rules(
                    field,
                    &field_value,
                    rows,
                    &field_path,
                    declaration,
                    all_data,
                    errors,
                )?;
            } else {
                self.validate_field_rules(
                    field,
                    &field_value,
                    &field_path,
                    declaration,
                    all_data,
                    errors,
                )?;
            }
        }
        Ok(())
    }

    // =====================================================================
    // validate-slot evaluation (SPEC §3 slots.validate).
    // =====================================================================

    /// Collection rules and per-row rules for a repeated scalar field.
    #[allow(clippy::too_many_arguments)]
    fn validate_multiple_field_rules(
        &self,
        field: &Value,
        values: &Value,
        rows: &Map<String, Value>,
        field_path: &[String],
        declaration: &[String],
        all_data: &Value,
        errors: &mut Vec<ValidationError>,
    ) -> Result<(), ValidateError> {
        let messages = field.get("messages");
        let mut entries: Vec<(String, &Value)> = rows.iter().map(|(k, v)| (k.clone(), v)).collect();
        entries.sort_by(|a, b| a.0.cmp(&b.0));

        // 1. Array-level rules in declaration order; first error wins.
        if let Some(rules) = normalize_validate_slot(field) {
            for (rule_name, rule_value) in rules {
                if !ARRAY_LEVEL_RULES.contains(&rule_name.as_str()) {
                    continue;
                }
                if let Some(message) = self.run_rule(
                    rule_name,
                    rule_value,
                    values,
                    field_path,
                    declaration,
                    messages,
                    all_data,
                )? {
                    errors.push(ValidationError {
                        path: path_to_string(field_path),
                        field: field_name(field_path),
                        rule: rule_name.clone(),
                        message,
                        value: values.clone(),
                    });
                    return Ok(());
                }
            }
        }

        // 2. Row rules in sorted row-key order.
        for (key, value) in entries {
            let mut item_path = field_path.to_vec();
            item_path.push(key);
            self.validate_element_rules(field, value, &item_path, declaration, all_data, errors)?;
        }
        Ok(())
    }

    /// Element-level rules for one element of a `multiple` field.
    fn validate_element_rules(
        &self,
        field: &Value,
        value: &Value,
        item_path: &[String],
        declaration: &[String],
        all_data: &Value,
        errors: &mut Vec<ValidationError>,
    ) -> Result<(), ValidateError> {
        let messages = field.get("messages");
        let rules = normalize_validate_slot(field);

        if self.run_implicit_number(field, rules, value, item_path, messages, all_data, errors)? {
            return Ok(());
        }
        let rules = match rules {
            Some(r) => r,
            None => return Ok(()),
        };
        for (rule_name, rule_value) in rules {
            if ARRAY_LEVEL_RULES.contains(&rule_name.as_str()) {
                continue;
            }
            if let Some(message) = self.run_rule(
                rule_name,
                rule_value,
                value,
                item_path,
                declaration,
                messages,
                all_data,
            )? {
                errors.push(ValidationError {
                    path: path_to_string(item_path),
                    field: field_name(item_path),
                    rule: rule_name.clone(),
                    message,
                    value: value.clone(),
                });
                break;
            }
        }
        Ok(())
    }

    /// All rules for a single (scalar or group-as-whole) field.
    fn validate_field_rules(
        &self,
        field: &Value,
        value: &Value,
        field_path: &[String],
        declaration: &[String],
        all_data: &Value,
        errors: &mut Vec<ValidationError>,
    ) -> Result<(), ValidateError> {
        let messages = field.get("messages");
        let rules = normalize_validate_slot(field);

        if self.run_implicit_number(field, rules, value, field_path, messages, all_data, errors)? {
            return Ok(());
        }
        let rules = match rules {
            Some(r) => r,
            None => return Ok(()),
        };
        for (rule_name, rule_value) in rules {
            if let Some(message) = self.run_rule(
                rule_name,
                rule_value,
                value,
                field_path,
                declaration,
                messages,
                all_data,
            )? {
                errors.push(ValidationError {
                    path: path_to_string(field_path),
                    field: field_name(field_path),
                    rule: rule_name.clone(),
                    message,
                    value: value.clone(),
                });
                break;
            }
        }
        Ok(())
    }

    /// `type:number` runs an implicit `number` rule first when no explicit
    /// `number` rule is declared. Returns true when it pushed an error.
    #[allow(clippy::too_many_arguments)]
    fn run_implicit_number(
        &self,
        field: &Value,
        rules: Option<&Map<String, Value>>,
        value: &Value,
        path: &[String],
        messages: Option<&Value>,
        all_data: &Value,
        errors: &mut Vec<ValidationError>,
    ) -> Result<bool, ValidateError> {
        if field.get("type").and_then(Value::as_str) != Some("number") {
            return Ok(false);
        }
        if rules.map(|r| r.contains_key("number")).unwrap_or(false) {
            return Ok(false);
        }
        // The implicit `number` parameter is `true`; it has nothing to check.
        if let Some(message) = self.run_rule(
            "number",
            &Value::Bool(true),
            value,
            path,
            &[],
            messages,
            all_data,
        )? {
            errors.push(ValidationError {
                path: path_to_string(path),
                field: field_name(path),
                rule: "number".to_string(),
                message,
                value: value.clone(),
            });
            return Ok(true);
        }
        Ok(false)
    }

    // =====================================================================
    // Conditional rule value (G1) — expression / condition map → param.
    // =====================================================================

    /// Run one rule: resolve its (possibly conditional) value to an effective
    /// param, skip on false/null, check the parameter, else call the rule.
    /// Returns the error message, `None` on a pass, or the failure of a selected
    /// parameter located at `declaration`.
    #[allow(clippy::too_many_arguments)]
    fn run_rule(
        &self,
        rule_name: &str,
        rule_value: &Value,
        value: &Value,
        current_path: &[String],
        declaration: &[String],
        messages: Option<&Value>,
        all_data: &Value,
    ) -> Result<Option<String>, ValidateError> {
        let effective = self.resolve_rule_value(rule_name, rule_value, current_path, all_data);

        // A false/null effective param disables the rule.
        if is_disabled(&effective) {
            return Ok(None);
        }

        // Rule names are checked when the specification loads.
        let Some(rule_fn) = get_rule(rule_name) else {
            unreachable!("rule {rule_name} is not registered");
        };

        // Declared parameters were checked when the specification loaded (patterns
        // are compiled then); a selected parameter is checked now.
        let parameter = check(rule_name, &effective, declaration, &self.patterns)?;

        let ctx = RuleContext {
            value,
            rule_param: &effective,
            parameter: &parameter,
            messages,
            rule_name,
            path_segments: current_path,
            form_data: all_data,
        };
        Ok(rule_fn(&ctx))
    }

    /// Resolve a rule value to the effective param (G1).
    fn resolve_rule_value(
        &self,
        rule_name: &str,
        rule_value: &Value,
        current_path: &[String],
        all_data: &Value,
    ) -> Value {
        match resolution(rule_name, rule_value) {
            Resolution::Verbatim | Resolution::Literal => rule_value.clone(),
            Resolution::ConditionMap(map) => {
                self.resolve_condition_map(map, current_path, all_data)
            }
            Resolution::Ternary(node) => {
                Evaluator::new(all_data, current_path).evaluate_value(&node)
            }
            Resolution::Expression(expression) => {
                evaluate_expression_value(expression, all_data, current_path)
            }
        }
    }

    /// Evaluate a ConditionMap (expressions.md §8): first truthy key wins;
    /// else the `true` key; else null (disabled).
    fn resolve_condition_map(
        &self,
        map: &Map<String, Value>,
        current_path: &[String],
        all_data: &Value,
    ) -> Value {
        for (key, val) in map {
            if key == "true" {
                continue;
            }
            if evaluate_condition(key, all_data, current_path) {
                return val.clone();
            }
        }
        if let Some(v) = map.get("true") {
            return v.clone();
        }
        Value::Null
    }
}

// ---------------------------------------------------------------------------
// How a rule value becomes its parameter (shared with the parameter checks).
// ---------------------------------------------------------------------------

/// How a declared rule value becomes the rule's parameter.
enum Resolution<'a> {
    /// A rule that receives its value unchanged.
    Verbatim,
    /// A condition map selecting a value.
    ConditionMap(&'a Map<String, Value>),
    /// A ternary expression selecting a branch value.
    Ternary(Node),
    /// A condition expression whose value is the parameter.
    Expression(&'a str),
    /// A literal parameter.
    Literal,
}

fn resolution<'a>(rule_name: &str, rule_value: &'a Value) -> Resolution<'a> {
    // Verbatim-param rules: never evaluate (field ref / literal / pattern /
    // membership set). A membership param object is a value→label map (G3),
    // not a condition map.
    if PATH_REFERENCE_RULES.contains(&rule_name)
        || LITERAL_PARAM_RULES.contains(&rule_name)
        || PATTERN_PARAM_RULES.contains(&rule_name)
        || MEMBERSHIP_PARAM_RULES.contains(&rule_name)
    {
        return Resolution::Verbatim;
    }
    match rule_value {
        Value::Object(map) => Resolution::ConditionMap(map),
        Value::String(s) => {
            // A complete ternary AST selects a branch; other strings are
            // condition expressions or literal parameters.
            if let Ok(node @ Node::Ternary { .. }) = Expression::parse(s) {
                Resolution::Ternary(node)
            } else if is_condition_expression(s) && !has_ternary_regex(s) {
                Resolution::Expression(s)
            } else {
                Resolution::Literal
            }
        }
        _ => Resolution::Literal,
    }
}

/// Whether a declared rule value is selected by a condition, so its parameter is
/// checked when it is selected rather than when the specification loads.
pub(crate) fn is_conditional(rule_name: &str, rule_value: &Value) -> bool {
    matches!(
        resolution(rule_name, rule_value),
        Resolution::ConditionMap(_) | Resolution::Ternary(_) | Resolution::Expression(_)
    )
}

/// The literals a conditional rule value can select, which are checked when the
/// specification loads: every condition-map value, and every literal ternary
/// branch (through nested ternaries). A value a branch takes from the data is
/// checked only when it is selected.
pub(crate) fn selectable_literals(rule_name: &str, rule_value: &Value) -> Vec<Value> {
    let mut literals = Vec::new();
    match resolution(rule_name, rule_value) {
        Resolution::ConditionMap(map) => literals.extend(map.values().cloned()),
        Resolution::Ternary(node) => {
            let mut pending = vec![&node];
            while let Some(node) = pending.pop() {
                match node {
                    Node::Ternary {
                        true_value,
                        false_value,
                        ..
                    } => {
                        // The true branch is collected first.
                        pending.push(false_value);
                        pending.push(true_value);
                    }
                    Node::Group(inner) => pending.push(inner),
                    Node::Literal(literal) => literals.push(literal.to_value()),
                    _ => {}
                }
            }
        }
        Resolution::Verbatim | Resolution::Expression(_) | Resolution::Literal => {}
    }
    literals
}

/// Whether a parameter disables its rule (`false` or `null`).
pub(crate) fn is_disabled(parameter: &Value) -> bool {
    matches!(parameter, Value::Bool(false) | Value::Null)
}

/// The member declarations of a group field the validator descends into.
pub(crate) fn is_group_with_properties(field: &Value) -> Option<&Map<String, Value>> {
    if field.get("type").and_then(Value::as_str) != Some("group") {
        return None;
    }
    field.get("properties").and_then(Value::as_object)
}

// ---------------------------------------------------------------------------
// expression engine adapters (JS evaluateCondition / evaluateExpressionValue).
// ---------------------------------------------------------------------------

fn evaluate_condition(expression: &str, form_data: &Value, current_path: &[String]) -> bool {
    Expression::evaluate(expression, form_data, current_path).unwrap_or(false)
}

fn evaluate_expression_value(
    expression: &str,
    form_data: &Value,
    current_path: &[String],
) -> Value {
    Expression::evaluate_value(expression, form_data, current_path).unwrap_or(Value::Bool(false))
}

// ---------------------------------------------------------------------------
// field helpers.
// ---------------------------------------------------------------------------

/// Whether a field repeats: `multiple` is `true`, `only` or a settings object.
fn is_multiple(field: &Value) -> bool {
    match field.get("multiple") {
        Some(Value::Bool(true)) | Some(Value::Object(_)) => true,
        Some(Value::String(keyword)) => keyword == "only",
        _ => false,
    }
}

/// Normalize a polymorphic `validate` slot to a rule map. false/true/{}/absent →
/// None; an object → the rule map.
fn normalize_validate_slot(field: &Value) -> Option<&Map<String, Value>> {
    match field.get("validate") {
        Some(Value::Object(m)) => Some(m),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Path utilities (JS pathToString / getFieldName).
// ---------------------------------------------------------------------------

fn path_to_string(path: &[String]) -> String {
    path.join(".")
}

fn field_name(path: &[String]) -> String {
    path.last().cloned().unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Identify strings containing ternary punctuation.
// ---------------------------------------------------------------------------

/// JS `/\?[^:]*:/` test: a '?' that has a ':' somewhere after it.
fn has_ternary_regex(s: &str) -> bool {
    if let Some(q) = s.find('?') {
        return s[q + 1..].contains(':');
    }
    false
}
