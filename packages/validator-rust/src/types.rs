//! Core types: Spec, Field, ValidationResult, ValidationError.
//! Ports validator-go/validator/types.go (Spec/Field/Rule/ValidationResult/
//! ValidationError) and the AST node set used by the condition parser.

use serde_json::Value;
use std::collections::HashMap;

/// Spec is the form specification: an ordered list of fields plus optional
/// named custom rules.
#[derive(Debug, Clone, Default)]
pub struct Spec {
    /// Ordered list of top-level fields.
    pub fields: Vec<Field>,
    /// Named custom rules declared at spec level.
    pub rules: HashMap<String, CustomRule>,
}

/// Field is a single form field definition.
#[derive(Debug, Clone, Default)]
pub struct Field {
    /// Field key (name) within its parent group.
    pub name: String,
    /// Field type (e.g. "text", "email", "group").
    pub field_type: String,
    /// Human-readable label.
    pub label: String,
    /// Legacy top-level required attribute: bool or condition string.
    pub required: Option<Value>,
    /// Rule name -> raw rule param value, plus declaration order.
    pub rules: HashMap<String, Value>,
    /// Declaration order of the `rules` keys (rules run in this order).
    pub rule_order: Vec<String>,
    /// Per-rule custom error messages, keyed by rule name.
    pub messages: HashMap<String, String>,
    /// Nested/group child fields.
    pub fields: Vec<Field>,
    /// Repeatable group (array).
    pub multiple: bool,
    /// "only" mode: single object treated like an array for wildcards.
    pub multiple_only: bool,
    /// display_switch: bool or condition string. false hides the field
    /// (validation skipped).
    pub display_switch: Option<Value>,
    /// display_target: field reference; empty target value hides the field.
    pub display_target: String,
}

impl Field {
    /// Returns true if the field declares the named rule.
    pub fn has_rule(&self, name: &str) -> bool {
        self.rules.contains_key(name)
    }
}

/// CustomRule is a custom rule definition declared at spec level.
#[derive(Debug, Clone, Default)]
pub struct CustomRule {
    /// Regex pattern the value must match, if set.
    pub pattern: Option<String>,
    /// Inclusive minimum (numeric/length), if set.
    pub min: Option<i64>,
    /// Inclusive maximum (numeric/length), if set.
    pub max: Option<i64>,
    /// Error message emitted when the rule fails.
    pub message: String,
}

/// ValidationResult is the aggregate outcome of a validation pass.
#[derive(Debug, Clone)]
pub struct ValidationResult {
    /// True when no field produced an error.
    pub is_valid: bool,
    /// Collected per-field errors (empty when valid).
    pub errors: Vec<ValidationError>,
}

impl Default for ValidationResult {
    fn default() -> Self {
        ValidationResult {
            is_valid: true,
            errors: Vec::new(),
        }
    }
}

/// ValidationError is a single field failure.
#[derive(Debug, Clone)]
pub struct ValidationError {
    /// Field name (path) that failed.
    pub field: String,
    /// Rule name that produced the failure.
    pub rule: String,
    /// Resolved error message.
    pub message: String,
    /// The value that was validated.
    pub value: Value,
}
