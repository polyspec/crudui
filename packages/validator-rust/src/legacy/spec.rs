//! Spec parsing: canonical form-spec JSON (type/properties/rules) -> Spec.
//! Ports validator-go/validator/spec.go. Property and rule declaration order
//! is preserved because serde_json is built with the preserve_order feature,
//! so Map iteration follows insertion order.

use crate::legacy::types::{CustomRule, Field, Spec};
use serde_json::{Map, Value};

/// ParsedSpec is the result of parsing a canonical form-spec document.
/// is_group reports whether the root was a group spec with properties;
/// non-group specs are wrapped into a single field named "value".
pub struct ParsedSpec {
    pub spec: Spec,
    pub is_group: bool,
}

/// parse_spec parses a canonical form-spec JSON value into a Spec.
pub fn parse_spec(root: &Value) -> ParsedSpec {
    let obj = match root.as_object() {
        Some(o) => o,
        None => {
            return ParsedSpec {
                spec: Spec::default(),
                is_group: false,
            }
        }
    };

    let type_str = obj.get("type").and_then(Value::as_str).unwrap_or("");
    if type_str == "group" {
        if let Some(props) = obj.get("properties").and_then(Value::as_object) {
            return ParsedSpec {
                spec: Spec {
                    fields: convert_properties(props),
                    rules: Default::default(),
                },
                is_group: true,
            };
        }
    }

    // Wrap simple field spec in a group with a 'value' property.
    ParsedSpec {
        spec: Spec {
            fields: vec![convert_field("value", obj)],
            rules: Default::default(),
        },
        is_group: false,
    }
}

/// convert_properties converts a properties object to fields in declaration
/// order.
fn convert_properties(props: &Map<String, Value>) -> Vec<Field> {
    let mut fields = Vec::with_capacity(props.len());
    for (name, raw) in props {
        if let Some(field_obj) = raw.as_object() {
            fields.push(convert_field(name, field_obj));
        }
    }
    fields
}

/// convert_field converts a single field spec object to a Field.
fn convert_field(name: &str, obj: &Map<String, Value>) -> Field {
    let mut field = Field {
        name: name.to_string(),
        ..Default::default()
    };

    field.field_type = obj.get("type").and_then(Value::as_str).unwrap_or("").to_string();
    field.label = obj.get("label").and_then(Value::as_str).unwrap_or("").to_string();

    if let Some(rules_obj) = obj.get("rules").and_then(Value::as_object) {
        for (rule_name, rule_val) in rules_obj {
            field.rules.insert(rule_name.clone(), rule_val.clone());
            field.rule_order.push(rule_name.clone());
        }
    }

    if let Some(msg_obj) = obj.get("messages").and_then(Value::as_object) {
        for (msg_key, msg_val) in msg_obj {
            if let Some(s) = msg_val.as_str() {
                if !s.is_empty() {
                    field.messages.insert(msg_key.clone(), s.to_string());
                }
            }
        }
    }

    if let Some(props_obj) = obj.get("properties").and_then(Value::as_object) {
        field.fields = convert_properties(props_obj);
    }

    if let Some(mv) = obj.get("multiple") {
        match mv {
            Value::Bool(b) => field.multiple = *b,
            Value::String(s) if s == "only" => field.multiple_only = true,
            _ => {}
        }
    }

    if let Some(ds) = obj.get("display_switch") {
        field.display_switch = Some(ds.clone());
    }

    if let Some(dt) = obj.get("display_target").and_then(Value::as_str) {
        if !dt.is_empty() {
            field.display_target = dt.to_string();
        }
    }

    // Legacy top-level required attribute (bool or condition string).
    if let Some(req) = obj.get("required") {
        if !req.is_null() {
            field.required = Some(req.clone());
        }
    }

    field
}

/// build_custom_rules parses spec-level named rules (optional; the shared
/// fixtures define rules inside fields, but this mirrors the Go Spec.Rules
/// channel).
#[allow(dead_code)]
pub fn build_custom_rules(root: &Value) -> std::collections::HashMap<String, CustomRule> {
    let mut out = std::collections::HashMap::new();
    if let Some(rules_obj) = root.get("rules").and_then(Value::as_object) {
        for (name, raw) in rules_obj {
            if let Some(obj) = raw.as_object() {
                let rule = CustomRule {
                    pattern: obj.get("pattern").and_then(Value::as_str).map(str::to_string),
                    min: obj.get("min").and_then(Value::as_i64),
                    max: obj.get("max").and_then(Value::as_i64),
                    message: obj.get("message").and_then(Value::as_str).unwrap_or("").to_string(),
                };
                out.insert(name.clone(), rule);
            }
        }
    }
    out
}
