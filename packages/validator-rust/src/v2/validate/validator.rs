//! v2 form validator (SPEC-V2 §2 G5→§3→§2 G1, JS `ValidatorV2` parity).
//!
//! The third pass of the v2 pipeline. It consumes a COMPOSED v2 field model (the
//! `validate`/`design`/`behavior`/`options` role slots) AFTER the compose pass has
//! expanded `$ref`/`$patch`. It does NOT touch the v1 `crate::validator`
//! (R7 parallel run). The only v2-new logic: (a) reading the `validate` slot, not
//! v1 `rules`; (b) evaluating a rule value that is an expression OR a condition
//! map (G1 — the condition is the value's expression, never a separate key); and
//! (c) dropping the v1 `display_switch`/`display_target` visibility gates (G1).
//!
//! Byte-for-byte with the JS reference; the shared 4-language fixture
//! `tests/fixtures/validate/cases.json` is the single source of truth. errors are
//! collected in declaration/traversal order and NEVER reordered.

use serde_json::{Map, Value};

use crate::v2::expr::{Expression, Parser, Token};

use super::rules::{get_rule, is_condition_expression, RuleContext};

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
// Rule-class tables (identical to v1 — single source of truth re-declared so the
// v2 engine never imports v1 private state, R7 isolation).
// ---------------------------------------------------------------------------

/// Rules that apply to the whole array of a `multiple` field.
const ARRAY_LEVEL_RULES: &[&str] = &["required", "unique", "mincount", "maxcount"];

/// Rules whose param is a field reference / filter — preserved verbatim.
const PATH_REFERENCE_RULES: &[&str] = &["equalTo", "notEqual", "unique"];

/// Rules whose string param is a literal value, never a condition.
const LITERAL_PARAM_RULES: &[&str] = &["accept"];

/// Rules whose string param is a regex preserved verbatim.
const REGEX_PARAM_RULES: &[&str] = &["match", "pattern"];

/// Membership rules whose param is the allowed-value SET (an array, comma string,
/// or a static value→label map, SPEC-V2 §2 G3). The param is data, NOT a
/// condition map — an object param is the value→label map (key = option value,
/// value = display label), kept verbatim and never evaluated key-by-key as
/// expressions. The rule's flatten reads keys for a value→label map (the label,
/// possibly a LangMap or null, is display-only).
const MEMBERSHIP_PARAM_RULES: &[&str] = &["in"];

/// The v2 validator over a composed spec.
pub struct ValidatorV2 {
    properties: Map<String, Value>,
}

impl ValidatorV2 {
    /// Build from a composed root group's `properties` map.
    pub fn new(properties: Map<String, Value>) -> Self {
        ValidatorV2 { properties }
    }

    /// Validate `data` against the composed v2 spec.
    pub fn validate(&self, data: &Value) -> ValidationResult {
        let mut errors: Vec<ValidationError> = Vec::new();
        let empty = Value::Object(Map::new());
        let data = if data.is_object() { data } else { &empty };
        self.validate_properties(&self.properties, data, &[], data, &mut errors);
        ValidationResult {
            valid: errors.is_empty(),
            errors,
        }
    }

    // =====================================================================
    // Field traversal (SPEC-V2 §3; v1 validateProperties skeleton).
    // =====================================================================

    fn validate_properties(
        &self,
        properties: &Map<String, Value>,
        data: &Value,
        current_path: &[String],
        all_data: &Value,
        errors: &mut Vec<ValidationError>,
    ) {
        for (property_key, field) in properties {
            if !field.is_object() {
                continue;
            }
            let is_multiple = is_multiple(field);
            let mut field_path = current_path.to_vec();
            field_path.push(property_key.clone());
            let field_value = match data {
                Value::Object(m) => m.get(property_key).cloned().unwrap_or(Value::Null),
                _ => Value::Null,
            };

            let is_group = field.get("type").and_then(Value::as_str) == Some("group");
            let child_props = field.get("properties").and_then(Value::as_object);

            if let (true, Some(child_props)) = (is_group, child_props) {
                let is_array_multiple = is_multiple && field_value.is_array();
                let is_object_multiple = is_multiple && field_value.is_object();

                if is_array_multiple {
                    let arr = field_value.as_array().unwrap();
                    for (i, item) in arr.iter().enumerate() {
                        let mut item_path = field_path.clone();
                        item_path.push(i.to_string());
                        let item_obj = if item.is_object() {
                            item.clone()
                        } else {
                            Value::Object(Map::new())
                        };
                        self.validate_properties(child_props, &item_obj, &item_path, all_data, errors);
                    }
                    self.validate_field_rules(field, &field_value, &field_path, all_data, errors);
                } else if is_object_multiple {
                    // Object-key multiple: deterministic sorted-key traversal.
                    let obj = field_value.as_object().unwrap();
                    let mut keys: Vec<&String> = obj.keys().collect();
                    keys.sort();
                    for key in keys {
                        let mut item_path = field_path.clone();
                        item_path.push(key.clone());
                        let item = obj.get(key).cloned().unwrap_or(Value::Null);
                        let item_obj = if item.is_object() {
                            item
                        } else {
                            Value::Object(Map::new())
                        };
                        self.validate_properties(child_props, &item_obj, &item_path, all_data, errors);
                    }
                    self.validate_field_rules(field, &field_value, &field_path, all_data, errors);
                } else if !is_multiple {
                    let nested = if field_value.is_object() {
                        field_value.clone()
                    } else {
                        Value::Object(Map::new())
                    };
                    self.validate_properties(child_props, &nested, &field_path, all_data, errors);
                    self.validate_field_rules(field, &field_value, &field_path, all_data, errors);
                }
                // multiple set but shape mismatch: skip (v1 parity).
            } else if is_multiple && (field_value.is_array() || field_value.is_object()) {
                self.validate_multiple_field_rules(
                    field,
                    &field_value,
                    &field_path,
                    all_data,
                    errors,
                );
            } else {
                self.validate_field_rules(field, &field_value, &field_path, all_data, errors);
            }
        }
    }

    // =====================================================================
    // validate-slot evaluation (SPEC-V2 §3 slots.validate).
    // =====================================================================

    /// Array-level + element rules for a non-group `multiple` field.
    fn validate_multiple_field_rules(
        &self,
        field: &Value,
        values: &Value,
        field_path: &[String],
        all_data: &Value,
        errors: &mut Vec<ValidationError>,
    ) {
        let messages = field.get("messages");
        let entries: Vec<(String, &Value)> = match values {
            Value::Array(arr) => arr
                .iter()
                .enumerate()
                .map(|(i, v)| (i.to_string(), v))
                .collect(),
            Value::Object(map) => {
                let mut entries: Vec<_> = map.iter().map(|(k, v)| (k.clone(), v)).collect();
                entries.sort_by(|a, b| a.0.cmp(&b.0));
                entries
            }
            _ => Vec::new(),
        };

        // 1. Array-level rules in declaration order; first error wins.
        if let Some(rules) = normalize_validate_slot(field) {
            for (rule_name, rule_value) in rules {
                if !ARRAY_LEVEL_RULES.contains(&rule_name.as_str()) {
                    continue;
                }
                if let Some(message) =
                    self.run_rule(rule_name, rule_value, values, field_path, messages, all_data)
                {
                    errors.push(ValidationError {
                        path: path_to_string(field_path),
                        field: field_name(field_path),
                        rule: rule_name.clone(),
                        message,
                        value: values.clone(),
                    });
                    return;
                }
            }
        }

        // 2. Element-level rules per index (items.i).
        for (key, value) in entries {
            let mut item_path = field_path.to_vec();
            item_path.push(key);
            self.validate_element_rules(field, value, &item_path, all_data, errors);
        }
    }

    /// Element-level rules for one element of a `multiple` field.
    fn validate_element_rules(
        &self,
        field: &Value,
        value: &Value,
        item_path: &[String],
        all_data: &Value,
        errors: &mut Vec<ValidationError>,
    ) {
        let messages = field.get("messages");
        let rules = normalize_validate_slot(field);

        if self.run_implicit_number(field, rules, value, item_path, messages, all_data, errors) {
            return;
        }
        let rules = match rules {
            Some(r) => r,
            None => return,
        };
        for (rule_name, rule_value) in rules {
            if ARRAY_LEVEL_RULES.contains(&rule_name.as_str()) {
                continue;
            }
            if let Some(message) =
                self.run_rule(rule_name, rule_value, value, item_path, messages, all_data)
            {
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
    }

    /// All rules for a single (scalar or group-as-whole) field.
    fn validate_field_rules(
        &self,
        field: &Value,
        value: &Value,
        field_path: &[String],
        all_data: &Value,
        errors: &mut Vec<ValidationError>,
    ) {
        let messages = field.get("messages");
        let rules = normalize_validate_slot(field);

        if self.run_implicit_number(field, rules, value, field_path, messages, all_data, errors) {
            return;
        }
        let rules = match rules {
            Some(r) => r,
            None => return,
        };
        for (rule_name, rule_value) in rules {
            if let Some(message) =
                self.run_rule(rule_name, rule_value, value, field_path, messages, all_data)
            {
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
    ) -> bool {
        if field.get("type").and_then(Value::as_str) != Some("number") {
            return false;
        }
        if rules.map(|r| r.contains_key("number")).unwrap_or(false) {
            return false;
        }
        if let Some(message) =
            self.run_rule("number", &Value::Bool(true), value, path, messages, all_data)
        {
            errors.push(ValidationError {
                path: path_to_string(path),
                field: field_name(path),
                rule: "number".to_string(),
                message,
                value: value.clone(),
            });
            return true;
        }
        false
    }

    // =====================================================================
    // Conditional rule value (G1) — expression / condition map → param.
    // =====================================================================

    /// Run one rule: resolve its (possibly conditional) value to an effective
    /// param, skip on false/null, else call the rule. Returns the error or None.
    fn run_rule(
        &self,
        rule_name: &str,
        rule_value: &Value,
        value: &Value,
        current_path: &[String],
        messages: Option<&Value>,
        all_data: &Value,
    ) -> Option<String> {
        let effective = self.resolve_rule_value(rule_name, rule_value, current_path, all_data);

        // A false/null effective param disables the rule.
        if effective == Value::Bool(false) || effective.is_null() {
            return None;
        }

        // unregistered rule: no error
        let rule_fn = get_rule(rule_name)?;

        let ctx = RuleContext {
            value,
            rule_param: &effective,
            messages,
            rule_name,
            path_segments: current_path,
            form_data: all_data,
        };
        rule_fn(&ctx)
    }

    /// Resolve a rule value to the effective param (G1).
    fn resolve_rule_value(
        &self,
        rule_name: &str,
        rule_value: &Value,
        current_path: &[String],
        all_data: &Value,
    ) -> Value {
        // Verbatim-param rules: never evaluate (field ref / literal / regex /
        // membership set). A membership param object is a value→label map (G3),
        // not a condition map, so it is preserved verbatim for the rule's flatten.
        if PATH_REFERENCE_RULES.contains(&rule_name)
            || LITERAL_PARAM_RULES.contains(&rule_name)
            || REGEX_PARAM_RULES.contains(&rule_name)
            || MEMBERSHIP_PARAM_RULES.contains(&rule_name)
        {
            return rule_value.clone();
        }

        // ConditionMap: a plain object of expression→value, declaration-ordered.
        if let Value::Object(map) = rule_value {
            return self.resolve_condition_map(map, current_path, all_data);
        }

        // String: ternary value-return or plain condition.
        if let Value::String(s) = rule_value {
            if let Some(v) = self.try_evaluate_ternary(s, current_path, all_data) {
                return v;
            }
            if is_condition_expression(s) && !has_ternary_regex(s) {
                return evaluate_expression_value(s, all_data, current_path);
            }
        }

        // Literal param.
        rule_value.clone()
    }

    /// Evaluate a ConditionMap (EXPRESSION-GRAMMAR §8): first truthy key wins;
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

    /// Try to read a string param as a value-returning ternary `cond ? a : b`.
    /// Returns `None` when the string is not a ternary or its condition part is
    /// not a parseable condition (so a regex containing `?...:` is not mistaken).
    fn try_evaluate_ternary(
        &self,
        expression: &str,
        current_path: &[String],
        all_data: &Value,
    ) -> Option<Value> {
        let question_pos = find_ternary_operator(expression, '?', 0)?;
        let colon_pos = find_ternary_operator(expression, ':', question_pos + 1)?;

        let condition = expression[..question_pos].trim();
        if !is_condition_expression(condition) {
            return None;
        }
        parse_condition_ok(condition)?;

        let condition_result = evaluate_condition(condition, all_data, current_path);
        let branch = if condition_result {
            expression[question_pos + 1..colon_pos].trim()
        } else {
            expression[colon_pos + 1..].trim()
        };

        if has_ternary_regex(branch) {
            if let Some(nested) = self.try_evaluate_ternary(branch, current_path, all_data) {
                return Some(nested);
            }
        }
        Some(parse_ternary_branch_value(branch))
    }
}

// ---------------------------------------------------------------------------
// expression engine adapters (JS evaluateCondition / evaluateExpressionValue).
// ---------------------------------------------------------------------------

fn evaluate_condition(expression: &str, form_data: &Value, current_path: &[String]) -> bool {
    Expression::evaluate(expression, form_data, current_path).unwrap_or(false)
}

fn evaluate_expression_value(expression: &str, form_data: &Value, current_path: &[String]) -> Value {
    Expression::evaluate_value(expression, form_data, current_path).unwrap_or(Value::Bool(false))
}

// ---------------------------------------------------------------------------
// field helpers.
// ---------------------------------------------------------------------------

fn is_multiple(field: &Value) -> bool {
    matches!(field.get("multiple"), Some(Value::Bool(true)) | Some(Value::Object(_)))
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
// Ternary helpers (string-split, regex-safe; JS findTernaryOperator /
// parseTernaryBranchValue parity).
// ---------------------------------------------------------------------------

/// JS `/\?[^:]*:/` test: a '?' that has a ':' somewhere after it.
fn has_ternary_regex(s: &str) -> bool {
    if let Some(q) = s.find('?') {
        return s[q + 1..].contains(':');
    }
    false
}

/// Position (byte offset) of a top-level ternary `?`/`:` respecting quotes,
/// parens, brackets and nested ternaries (JS `findTernaryOperator`). Expressions
/// are ASCII for operators; works on char scan returning byte offsets.
fn find_ternary_operator(expression: &str, operator: char, start_pos: usize) -> Option<usize> {
    let mut depth: i32 = 0;
    let mut in_quote = false;
    let mut quote_char = '\0';
    let mut ternary_depth: i32 = 0;

    for (byte_offset, ch) in expression.char_indices() {
        if byte_offset < start_pos {
            continue;
        }
        if (ch == '"' || ch == '\'') && !in_quote {
            in_quote = true;
            quote_char = ch;
        } else if ch == quote_char && in_quote {
            in_quote = false;
            quote_char = '\0';
        }
        if !in_quote {
            if ch == '(' || ch == '[' {
                depth += 1;
            } else if ch == ')' || ch == ']' {
                depth -= 1;
            }
            if ch == '?' && depth == 0 {
                if operator == '?' {
                    return Some(byte_offset);
                }
                ternary_depth += 1;
            } else if ch == ':' && depth == 0 && operator == ':' {
                if ternary_depth == 0 {
                    return Some(byte_offset);
                }
                ternary_depth -= 1;
            }
        }
    }
    None
}

/// Parse a ternary branch string into a typed value (JS `parseTernaryBranchValue`).
fn parse_ternary_branch_value(raw: &str) -> Value {
    let value = raw.trim();
    if value.len() >= 2 {
        let bytes = value.as_bytes();
        let first = bytes[0];
        let last = bytes[value.len() - 1];
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return Value::String(value[1..value.len() - 1].to_string());
        }
    }
    match value {
        "true" => return Value::Bool(true),
        "false" => return Value::Bool(false),
        "null" => return Value::Null,
        _ => {}
    }
    if !value.is_empty() {
        if let Ok(f) = value.parse::<f64>() {
            if value.contains('.') {
                return Value::from(f);
            }
            if let Ok(i) = value.parse::<i64>() {
                return Value::from(i);
            }
            return Value::from(f);
        }
    }
    Value::String(value.to_string())
}

/// Check a condition string parses as a v2 expression (regex-safe ternary guard).
fn parse_condition_ok(expression: &str) -> Option<()> {
    let tokens: Vec<Token> = Expression::tokenize(expression).ok()?;
    Parser::new(tokens).parse().ok().map(|_| ())
}
