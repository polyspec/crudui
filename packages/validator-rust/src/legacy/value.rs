//! Value helpers operating on serde_json::Value.
//! Ports the Go helpers in rules.go / condition_parser.go:
//! is_empty, to_string, to_float64, to_number, is_truthy, is_equal, compare,
//! to_boolean, plus the dot-path getters getNestedValue / getValueByPath.

use regex::Regex;
use serde_json::Value;
use std::sync::OnceLock;

/// is_empty mirrors Go isEmpty: nil/empty-string(trimmed)/empty-array/
/// empty-object are empty; numbers (including 0) and booleans are not.
pub fn is_empty(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::String(s) => s.trim().is_empty(),
        Value::Array(a) => a.is_empty(),
        Value::Object(o) => o.is_empty(),
        Value::Number(_) => false,
        Value::Bool(_) => false,
    }
}

/// to_string mirrors Go toString: only scalar values stringify; arrays/objects
/// become "". Numbers use the minimal float representation, booleans
/// "true"/"false".
pub fn to_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                i.to_string()
            } else if let Some(u) = n.as_u64() {
                u.to_string()
            } else if let Some(f) = n.as_f64() {
                format_float(f)
            } else {
                String::new()
            }
        }
        _ => String::new(),
    }
}

/// format_float renders a float like Go strconv.FormatFloat(f, 'f', -1, 64):
/// minimal decimal digits, no exponent, integers without a trailing ".0".
pub fn format_float(f: f64) -> String {
    if f == f.trunc() && f.is_finite() && f.abs() < 1e15 {
        // Integer-valued float prints without decimals.
        return format!("{}", f as i64);
    }
    // Minimal representation. Rust's default float formatting already yields
    // the shortest round-trippable decimal.
    let s = format!("{}", f);
    s
}

/// to_float64 mirrors Go toFloat64 (lenient, for comparison operators):
/// numbers convert; strings parse as a full float; everything else fails.
pub fn to_float64(value: &Value) -> Option<f64> {
    match value {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.parse::<f64>().ok(),
        _ => None,
    }
}

fn number_pattern() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^[-+]?(\d+\.?\d*|\d*\.?\d+)$").unwrap())
}

/// to_number mirrors Go toNumber (strict, for min/max/number value): numbers
/// convert; strings must be a full numeric token (not "12abc").
/// Validation semantics principle: an input value must be a finite real number,
/// so "Infinity"/"-Infinity"/"NaN" return None (the number rule reports them).
/// This is the input value gate only — min/max threshold parameters parse via
/// `params[0].parse()` in their rules and still accept Infinity.
pub fn to_number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(n) => {
            let f = n.as_f64()?;
            if f.is_finite() {
                Some(f)
            } else {
                None
            }
        }
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                return None;
            }
            // "Infinity"/"-Infinity"/"NaN" do not match number_pattern, so they
            // are rejected as input values.
            if !number_pattern().is_match(trimmed) {
                return None;
            }
            match trimmed.parse::<f64>() {
                Ok(f) if f.is_finite() => Some(f),
                _ => None,
            }
        }
        _ => None,
    }
}

/// is_truthy mirrors Go isTruthy: bool as-is; numbers !=0; strings are truthy
/// unless "", "0" or (case-insensitive) "false"; arrays non-empty; objects/
/// other truthy; null falsy.
pub fn is_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map(|f| f != 0.0).unwrap_or(false),
        Value::String(s) => !s.is_empty() && s != "0" && s.to_lowercase() != "false",
        Value::Array(a) => !a.is_empty(),
        Value::Object(_) => true,
    }
}

/// to_boolean mirrors Go toBoolean: bool as-is; strings "true"/"1"/"yes"
/// (case-insensitive) true; numbers !=0; otherwise false.
pub fn to_boolean(value: &Value) -> bool {
    match value {
        Value::Bool(b) => *b,
        Value::String(s) => {
            let lower = s.to_lowercase();
            lower == "true" || lower == "1" || lower == "yes"
        }
        Value::Number(n) => n.as_f64().map(|f| f != 0.0).unwrap_or(false),
        _ => false,
    }
}

/// is_equal mirrors Go isEqual: nil==nil; numeric comparison if both numeric;
/// boolean comparison if either is bool; else string comparison.
pub fn is_equal(a: &Value, b: &Value) -> bool {
    if a.is_null() || b.is_null() {
        return a.is_null() && b.is_null();
    }

    let num_a = to_float64(a);
    let num_b = to_float64(b);
    if let (Some(na), Some(nb)) = (num_a, num_b) {
        return na == nb;
    }

    if let Value::Bool(ba) = a {
        return *ba == to_boolean(b);
    }
    if let Value::Bool(bb) = b {
        return to_boolean(a) == *bb;
    }

    to_string(a) == to_string(b)
}

/// compare mirrors Go compare: numeric ordering if both numeric, else string
/// ordering. Returns -1/0/1.
pub fn compare(a: &Value, b: &Value) -> i32 {
    if let (Some(na), Some(nb)) = (to_float64(a), to_float64(b)) {
        if na < nb {
            return -1;
        } else if na > nb {
            return 1;
        }
        return 0;
    }
    let sa = to_string(a);
    let sb = to_string(b);
    match sa.cmp(&sb) {
        std::cmp::Ordering::Less => -1,
        std::cmp::Ordering::Equal => 0,
        std::cmp::Ordering::Greater => 1,
    }
}

/// get_nested_value mirrors Go getNestedValue: walk a dot path through
/// objects (by key) and arrays (by numeric index).
pub fn get_nested_value<'a>(data: &'a Value, path: &[String]) -> Option<&'a Value> {
    let mut current = data;
    for segment in path {
        match current {
            Value::Object(map) => {
                current = map.get(segment)?;
            }
            Value::Array(arr) => {
                let idx: usize = segment.parse().ok()?;
                current = arr.get(idx)?;
            }
            _ => return None,
        }
    }
    Some(current)
}

/// get_value_by_path mirrors Go getValueByPath (rules.go): resolve relative
/// (dot-prefixed) or absolute dot paths against form data. Used by
/// equalTo/notEqual/enddate.
pub fn get_value_by_path<'a>(
    data: &'a Value,
    target_path: &str,
    current_path: &[String],
) -> Option<&'a Value> {
    let resolved: Vec<String> = if let Some(stripped) = target_path.strip_prefix('.') {
        // Relative path. Start from the parent of the current field.
        let mut parent: Vec<String> = current_path.to_vec();
        if !parent.is_empty() {
            parent.pop(); // remove current field name
        }
        // Reconstruct the original parts (including the leading empty segment)
        // exactly like Go strings.Split(targetPath, ".").
        let parts: Vec<&str> = target_path.split('.').collect();
        let _ = stripped;
        for part in parts {
            if part.is_empty() {
                if !parent.is_empty() {
                    parent.pop();
                }
            } else {
                parent.push(part.to_string());
            }
        }
        parent
    } else {
        target_path
            .split('.')
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .collect()
    };

    // Navigate. Go getValueByPath only descends through objects.
    let mut current = data;
    for segment in &resolved {
        if segment.is_empty() {
            continue;
        }
        match current {
            Value::Object(map) => match map.get(segment) {
                Some(v) => current = v,
                None => return None,
            },
            _ => return None,
        }
    }
    Some(current)
}
