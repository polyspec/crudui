//! Main validator: declaration-order traversal, first-error-per-field,
//! implicit number, multiple/array handling, display_switch/display_target.
//! Ports validator-go/validator/validator.go.

use crate::legacy::condition_parser::ConditionParser;
use crate::legacy::rules::{default_rules, RuleFn, ValidationContext};
use crate::legacy::ternary::{
    evaluate_ternary_string, is_condition_expression, is_ternary_expression,
};
use crate::legacy::types::{Field, Spec, ValidationError, ValidationResult};
use crate::legacy::value::{format_float, get_nested_value, is_empty, is_truthy, to_string};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

/// ruleMode controls which rules apply in a validation pass.
#[derive(Clone, Copy, PartialEq)]
enum RuleMode {
    All,
    Array,
    Item,
}

fn array_level_rules() -> &'static HashSet<&'static str> {
    use std::sync::OnceLock;
    static S: OnceLock<HashSet<&'static str>> = OnceLock::new();
    S.get_or_init(|| {
        ["required", "mincount", "maxcount", "unique"]
            .into_iter()
            .collect()
    })
}

fn path_reference_rules() -> &'static HashSet<&'static str> {
    use std::sync::OnceLock;
    static S: OnceLock<HashSet<&'static str>> = OnceLock::new();
    S.get_or_init(|| ["equalTo", "notEqual", "enddate"].into_iter().collect())
}

fn literal_param_rules() -> &'static HashSet<&'static str> {
    use std::sync::OnceLock;
    static S: OnceLock<HashSet<&'static str>> = OnceLock::new();
    S.get_or_init(|| ["match", "pattern", "accept"].into_iter().collect())
}

struct RuleEntry {
    name: String,
    param: Value,
}

/// Validates form data against a [`Spec`], producing a [`ValidationResult`].
///
/// Fields are checked in declaration order, stopping at the first error per
/// field — identical to the JS/PHP/Go validators so the same spec and data
/// yield the same result in every language. Construct with [`Validator::new`]
/// (a parsed spec is available via [`crate::legacy::parse_spec`]).
pub struct Validator {
    spec: Spec,
    rules: HashMap<&'static str, RuleFn>,
    condition_parser: ConditionParser,
}

impl Validator {
    /// Builds a validator for `spec`, registering the built-in rule set.
    pub fn new(spec: Spec) -> Self {
        Validator {
            spec,
            rules: default_rules(),
            condition_parser: ConditionParser::new(),
        }
    }

    /// Validates the whole `data` object against the spec and returns the
    /// aggregate result (all field errors, first-error-per-field).
    pub fn validate(&mut self, data: &Value) -> ValidationResult {
        let mut result = ValidationResult::default();
        let fields = self.spec.fields.clone();
        self.validate_fields(&fields, data, data, &[], &mut result);
        result
    }

    fn validate_fields(
        &mut self,
        fields: &[Field],
        data: &Value,
        root_data: &Value,
        current_path: &[String],
        result: &mut ValidationResult,
    ) {
        for field in fields {
            let mut field_path = current_path.to_vec();
            field_path.push(field.name.clone());

            let value = data
                .as_object()
                .and_then(|m| m.get(&field.name))
                .cloned()
                .unwrap_or(Value::Null);

            if !self.should_display(field, root_data, &field_path) {
                continue;
            }

            // Group fields (have nested properties).
            if !field.fields.is_empty() {
                self.validate_group_field(field, &value, &field_path, root_data, result);
                continue;
            }

            // Multiple leaf field with array data.
            if field.multiple {
                if let Value::Array(arr) = &value {
                    let stopped = self.validate_field_rules(
                        field,
                        &value,
                        &field_path,
                        root_data,
                        result,
                        RuleMode::Array,
                    );
                    if !stopped {
                        for (idx, item) in arr.iter().enumerate() {
                            let mut item_path = field_path.clone();
                            item_path.push(idx.to_string());
                            self.validate_field_rules(
                                field,
                                item,
                                &item_path,
                                root_data,
                                result,
                                RuleMode::Item,
                            );
                        }
                    }
                    continue;
                }
                // Non-array data falls through to normal validation.
            }

            self.validate_field_rules(field, &value, &field_path, root_data, result, RuleMode::All);
        }
    }

    fn validate_group_field(
        &mut self,
        field: &Field,
        value: &Value,
        field_path: &[String],
        root_data: &Value,
        result: &mut ValidationResult,
    ) {
        let children = field.fields.clone();
        if field.multiple_only {
            if let Value::Object(m) = value {
                let mv = Value::Object(m.clone());
                self.validate_fields(&children, &mv, root_data, field_path, result);
            }
            self.validate_field_rules(field, value, field_path, root_data, result, RuleMode::All);
            return;
        }

        if field.multiple {
            match value {
                Value::Array(arr) => {
                    for (idx, item) in arr.iter().enumerate() {
                        let item_map = if item.is_object() {
                            item.clone()
                        } else {
                            Value::Object(Default::default())
                        };
                        let mut item_path = field_path.to_vec();
                        item_path.push(idx.to_string());
                        self.validate_fields(&children, &item_map, root_data, &item_path, result);
                    }
                    self.validate_field_rules(
                        field,
                        value,
                        field_path,
                        root_data,
                        result,
                        RuleMode::All,
                    );
                }
                Value::Object(m) => {
                    // Repeatable group stored as object with unique keys.
                    let mut keys: Vec<String> = m.keys().cloned().collect();
                    keys.sort();
                    for k in keys {
                        let item = m.get(&k).cloned().unwrap_or(Value::Null);
                        let item_map = if item.is_object() {
                            item
                        } else {
                            Value::Object(Default::default())
                        };
                        let mut item_path = field_path.to_vec();
                        item_path.push(k);
                        self.validate_fields(&children, &item_map, root_data, &item_path, result);
                    }
                    self.validate_field_rules(
                        field,
                        value,
                        field_path,
                        root_data,
                        result,
                        RuleMode::All,
                    );
                }
                _ => {}
            }
            return;
        }

        // Single nested group: validate children even when data is missing.
        let m = if value.is_object() {
            value.clone()
        } else {
            Value::Object(Default::default())
        };
        self.validate_fields(&children, &m, root_data, field_path, result);
        self.validate_field_rules(field, value, field_path, root_data, result, RuleMode::All);
    }

    /// Returns true if an error was recorded (caller stops further passes).
    fn validate_field_rules(
        &mut self,
        field: &Field,
        value: &Value,
        field_path: &[String],
        root_data: &Value,
        result: &mut ValidationResult,
        mode: RuleMode,
    ) -> bool {
        let path_str = field_path.join(".");

        // Implicit number validation for number-type fields without an explicit
        // number rule.
        if mode != RuleMode::Array
            && field.field_type == "number"
            && !field.has_rule("number")
            && !is_empty(value)
            && !value.is_array()
            && !value.is_object()
        {
            if let Some(number_rule) = self.rules.get("number") {
                let ctx = ValidationContext {
                    current_path: field_path,
                    form_data: root_data,
                };
                if let Some(err_msg) = number_rule(value, &[], root_data, &ctx) {
                    result.is_valid = false;
                    result.errors.push(ValidationError {
                        field: path_str.clone(),
                        rule: "number".to_string(),
                        message: self.get_error_message(field, "number", &err_msg, &[]),
                        value: value.clone(),
                    });
                    return true;
                }
            }
        }

        for entry in self.ordered_rules(field) {
            if mode == RuleMode::Array && !array_level_rules().contains(entry.name.as_str()) {
                continue;
            }
            if mode == RuleMode::Item && array_level_rules().contains(entry.name.as_str()) {
                continue;
            }

            let (err_msg, params) =
                self.apply_rule(&entry.name, &entry.param, value, field_path, root_data);
            if let Some(msg) = err_msg {
                result.is_valid = false;
                result.errors.push(ValidationError {
                    field: path_str.clone(),
                    rule: entry.name.clone(),
                    message: self.get_error_message(field, &entry.name, &msg, &params),
                    value: value.clone(),
                });
                return true;
            }
        }

        false
    }

    /// apply_rule resolves string params (ternary/condition) then runs the rule.
    /// Returns (error message, params used for message substitution).
    fn apply_rule(
        &mut self,
        rule_name: &str,
        rule_param: &Value,
        value: &Value,
        field_path: &[String],
        root_data: &Value,
    ) -> (Option<String>, Vec<String>) {
        let mut effective_param = rule_param.clone();

        if let Value::String(s) = rule_param {
            if !path_reference_rules().contains(rule_name) {
                let mut is_ternary = is_ternary_expression(s);
                if literal_param_rules().contains(rule_name) {
                    is_ternary = is_ternary && s.contains(" ? ") && s.contains(" : ");
                }
                if is_ternary {
                    match evaluate_ternary_string(
                        &mut self.condition_parser,
                        s,
                        root_data,
                        field_path,
                    ) {
                        None => return (None, vec![]),
                        Some(Value::Bool(false)) => return (None, vec![]),
                        Some(resolved) => effective_param = resolved,
                    }
                } else if !literal_param_rules().contains(rule_name) && is_condition_expression(s) {
                    match self.condition_parser.evaluate(s, root_data, field_path) {
                        Ok(true) => effective_param = Value::Bool(true),
                        _ => return (None, vec![]),
                    }
                }
            }
        }

        // Skip if rule param is explicitly false.
        if let Value::Bool(false) = effective_param {
            return (None, vec![]);
        }

        // Skip non-required rules on empty values (mincount still applies).
        if rule_name != "required" && rule_name != "mincount" && is_empty(value) {
            return (None, vec![]);
        }

        let rule_fn = match self.rules.get(rule_name) {
            Some(f) => *f,
            None => {
                // Custom rule from spec.
                if let Some(custom) = self.spec.rules.get(rule_name).cloned() {
                    let msg = self.apply_custom_rule(&custom, value, field_path, root_data);
                    return (msg, vec![]);
                }
                return (None, vec![]);
            }
        };

        let ctx = ValidationContext {
            current_path: field_path,
            form_data: root_data,
        };
        let params = parse_rule_params(&effective_param);
        (rule_fn(value, &params, root_data, &ctx), params)
    }

    fn apply_custom_rule(
        &self,
        rule: &crate::legacy::types::CustomRule,
        value: &Value,
        field_path: &[String],
        root_data: &Value,
    ) -> Option<String> {
        let ctx = ValidationContext {
            current_path: field_path,
            form_data: root_data,
        };
        if let Some(pattern) = &rule.pattern {
            if !pattern.is_empty() {
                if let Some(match_rule) = self.rules.get("match") {
                    if let Some(err) =
                        match_rule(value, std::slice::from_ref(pattern), root_data, &ctx)
                    {
                        return Some(if !rule.message.is_empty() {
                            rule.message.clone()
                        } else {
                            err
                        });
                    }
                }
            }
        }
        if let Some(min) = rule.min {
            if let Some(min_rule) = self.rules.get("min") {
                if let Some(err) = min_rule(value, &[min.to_string()], root_data, &ctx) {
                    return Some(if !rule.message.is_empty() {
                        rule.message.clone()
                    } else {
                        err
                    });
                }
            }
        }
        if let Some(max) = rule.max {
            if let Some(max_rule) = self.rules.get("max") {
                if let Some(err) = max_rule(value, &[max.to_string()], root_data, &ctx) {
                    return Some(if !rule.message.is_empty() {
                        rule.message.clone()
                    } else {
                        err
                    });
                }
            }
        }
        None
    }

    /// ordered_rules returns rules in declaration order, with the legacy
    /// top-level required prepended when present.
    fn ordered_rules(&self, field: &Field) -> Vec<RuleEntry> {
        let mut entries: Vec<RuleEntry> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();

        if !field.rules.is_empty() {
            for name in &field.rule_order {
                if seen.contains(name) {
                    continue;
                }
                if let Some(param) = field.rules.get(name) {
                    entries.push(RuleEntry {
                        name: name.clone(),
                        param: param.clone(),
                    });
                    seen.insert(name.clone());
                }
            }

            // Deterministic fallback for rules not covered by rule_order.
            if seen.len() < field.rules.len() {
                if !seen.contains("required") {
                    if let Some(param) = field.rules.get("required") {
                        entries.push(RuleEntry {
                            name: "required".to_string(),
                            param: param.clone(),
                        });
                        seen.insert("required".to_string());
                    }
                }
                let mut rest: Vec<String> = field
                    .rules
                    .keys()
                    .filter(|k| !seen.contains(*k))
                    .cloned()
                    .collect();
                rest.sort();
                for name in rest {
                    if let Some(param) = field.rules.get(&name) {
                        entries.push(RuleEntry {
                            name: name.clone(),
                            param: param.clone(),
                        });
                        seen.insert(name);
                    }
                }
            }
        }

        // Legacy top-level required.
        if let Some(req) = &field.required {
            if !seen.contains("required") {
                entries.insert(
                    0,
                    RuleEntry {
                        name: "required".to_string(),
                        param: req.clone(),
                    },
                );
            }
        }

        entries
    }

    fn should_display(&mut self, field: &Field, root_data: &Value, field_path: &[String]) -> bool {
        match &field.display_switch {
            None => {}
            Some(Value::Bool(b)) => {
                if !b {
                    return false;
                }
            }
            Some(Value::String(s)) => {
                if !s.is_empty() {
                    match self.condition_parser.evaluate(s, root_data, field_path) {
                        Ok(true) => {}
                        _ => return false,
                    }
                }
            }
            Some(other) if !is_truthy(other) => return false,
            Some(_) => {}
        }

        if !field.display_target.is_empty() {
            let target = self.resolve_field_reference(&field.display_target, field_path, root_data);
            match target {
                None | Some(Value::Null) => return false,
                Some(Value::String(s)) if s.is_empty() => return false,
                Some(Value::Bool(false)) => return false,
                Some(Value::Array(a)) if a.is_empty() => return false,
                Some(Value::Object(o)) if o.is_empty() => return false,
                _ => {}
            }
        }

        true
    }

    fn resolve_field_reference(
        &mut self,
        reference: &str,
        field_path: &[String],
        root_data: &Value,
    ) -> Option<Value> {
        if reference.starts_with('.') {
            return self
                .condition_parser
                .evaluate_value(reference, root_data, field_path)
                .ok();
        }

        let segments: Vec<String> = reference
            .split('.')
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .collect();
        if !field_path.is_empty() {
            let mut sibling = field_path[..field_path.len() - 1].to_vec();
            sibling.extend(segments.clone());
            if let Some(v) = get_nested_value(root_data, &sibling) {
                if !v.is_null() {
                    return Some(v.clone());
                }
            }
        }
        get_nested_value(root_data, &segments).cloned()
    }

    fn get_error_message(
        &self,
        field: &Field,
        rule_name: &str,
        default_msg: &str,
        params: &[String],
    ) -> String {
        let mut msg = default_msg.to_string();
        if let Some(custom) = field.messages.get(rule_name) {
            msg = custom.clone();
        }
        for (i, p) in params.iter().enumerate() {
            msg = msg.replace(&format!("{{{}}}", i), p);
        }
        msg
    }
}

/// parse_rule_params mirrors Go parseRuleParams: scalars become a single param;
/// arrays become per-item string params; bool yields no params.
fn parse_rule_params(rule_value: &Value) -> Vec<String> {
    match rule_value {
        Value::Bool(_) => vec![],
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                vec![i.to_string()]
            } else if let Some(u) = n.as_u64() {
                vec![u.to_string()]
            } else if let Some(f) = n.as_f64() {
                vec![format_float(f)]
            } else {
                vec![]
            }
        }
        Value::String(s) => vec![s.clone()],
        Value::Array(arr) => arr.iter().map(to_string).collect(),
        _ => vec![],
    }
}
