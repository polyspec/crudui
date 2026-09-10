//! Textual ternary evaluation and condition/ternary detection.
//! Ports validator-go/validator/ternary.go.

use crate::legacy::condition_parser::ConditionParser;
use regex::Regex;
use serde_json::Value;
use std::sync::OnceLock;

fn ternary_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\?[^:]*:").unwrap())
}

fn condition_op_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(==|!=|>=|<=|>|<|\s+in\s+|\s+not\s+in\s+)").unwrap())
}

/// is_ternary_expression reports whether a string contains a top-level
/// "cond ? a : b" form (matches Go regexp `\?[^:]*:`).
pub fn is_ternary_expression(value: &str) -> bool {
    ternary_re().is_match(value)
}

/// is_condition_expression reports whether a string looks like a condition:
/// a leading dot path reference or a comparison operator. Ternaries excluded.
pub fn is_condition_expression(value: &str) -> bool {
    if is_ternary_expression(value) {
        return false;
    }
    value.starts_with('.') || condition_op_re().is_match(value)
}

/// evaluate_ternary_string evaluates a "cond ? a : b" expression textually.
/// The condition is evaluated with the parser; the chosen branch is returned
/// as a literal value without re-parsing, so branches may contain arbitrary
/// text (e.g. regex patterns). Returns None on malformed input.
pub fn evaluate_ternary_string(
    cp: &mut ConditionParser,
    expression: &str,
    form_data: &Value,
    current_path: &[String],
) -> Option<Value> {
    let expression = expression.trim();

    let question_pos = find_ternary_operator(expression, b'?', 0);
    if question_pos.is_none() {
        // Not a ternary: evaluate as a regular condition.
        return match cp.evaluate(expression, form_data, current_path) {
            Ok(b) => Some(Value::Bool(b)),
            Err(_) => None,
        };
    }
    let question_pos = question_pos.unwrap();

    let colon_pos = find_ternary_operator(expression, b':', question_pos + 1)?;

    let condition = expression[..question_pos].trim();
    let true_value = expression[question_pos + 1..colon_pos].trim();
    let false_value = expression[colon_pos + 1..].trim();

    let condition_result = cp
        .evaluate(condition, form_data, current_path)
        .unwrap_or(false);

    let result_expr = if condition_result {
        true_value
    } else {
        false_value
    };

    if is_ternary_expression(result_expr) {
        return evaluate_ternary_string(cp, result_expr, form_data, current_path);
    }

    Some(parse_ternary_branch_value(result_expr))
}

/// find_ternary_operator finds a top-level '?' or ':' respecting quotes,
/// parentheses/brackets, and nested ternaries. Indices are byte positions.
fn find_ternary_operator(expression: &str, operator: u8, start_pos: usize) -> Option<usize> {
    let bytes = expression.as_bytes();
    let mut depth = 0i32;
    let mut in_quote = false;
    let mut quote_char = 0u8;
    let mut ternary_depth = 0i32;

    let mut i = start_pos;
    while i < bytes.len() {
        let ch = bytes[i];

        if (ch == b'"' || ch == b'\'') && !in_quote {
            in_quote = true;
            quote_char = ch;
        } else if in_quote && ch == quote_char {
            in_quote = false;
            quote_char = 0;
        }

        if in_quote {
            i += 1;
            continue;
        }

        match ch {
            b'(' | b'[' => depth += 1,
            b')' | b']' => depth -= 1,
            b'?' => {
                if depth == 0 {
                    if operator == b'?' {
                        return Some(i);
                    }
                    ternary_depth += 1;
                }
            }
            b':' => {
                if depth == 0 && operator == b':' {
                    if ternary_depth == 0 {
                        return Some(i);
                    }
                    ternary_depth -= 1;
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

/// parse_ternary_branch_value parses a ternary branch as a literal value:
/// bracket list, quoted string, comma list, true/false/null, number, or
/// bare string.
pub fn parse_ternary_branch_value(value: &str) -> Value {
    let value = value.trim();

    // Bracket-enclosed list (e.g. [US, CA, UK]).
    if value.len() >= 2 && value.starts_with('[') && value.ends_with(']') {
        let inner = value[1..value.len() - 1].trim();
        let parts = split_value_list(inner);
        let result: Vec<Value> = parts
            .iter()
            .map(|p| parse_ternary_branch_value(p))
            .collect();
        return Value::Array(result);
    }

    // Quoted strings.
    if value.len() >= 2 {
        let bytes = value.as_bytes();
        let first = bytes[0];
        let last = bytes[value.len() - 1];
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return Value::String(value[1..value.len() - 1].to_string());
        }
    }

    // Comma-separated list without brackets.
    if value.contains(',') && !value.contains('[') {
        let parts = split_value_list(value);
        let result: Vec<Value> = parts
            .iter()
            .map(|p| parse_ternary_branch_value(p))
            .collect();
        return Value::Array(result);
    }

    match value {
        "true" => return Value::Bool(true),
        "false" => return Value::Bool(false),
        "null" => return Value::Null,
        _ => {}
    }

    if let Ok(num) = value.parse::<f64>() {
        return serde_json::json!(num);
    }

    Value::String(value.to_string())
}

/// split_value_list splits a comma-separated list respecting quotes.
fn split_value_list(value: &str) -> Vec<String> {
    let bytes = value.as_bytes();
    let mut parts = Vec::new();
    let mut sb = String::new();
    let mut in_quote = false;
    let mut quote_char = 0u8;

    let mut i = 0;
    while i < bytes.len() {
        let ch = bytes[i];
        if (ch == b'"' || ch == b'\'') && !in_quote {
            in_quote = true;
            quote_char = ch;
        } else if in_quote && ch == quote_char {
            in_quote = false;
            quote_char = 0;
        }

        if ch == b',' && !in_quote {
            parts.push(sb.trim().to_string());
            sb.clear();
            i += 1;
            continue;
        }
        sb.push(ch as char);
        i += 1;
    }
    parts.push(sb.trim().to_string());
    parts
}
