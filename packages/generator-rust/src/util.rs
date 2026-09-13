pub(crate) use crate::css::style_string as style;
use serde_json::{Map, Value};

fn number_string(number: &serde_json::Number) -> String {
    if number.is_f64() {
        ryu_js::Buffer::new()
            .format(number.as_f64().expect("JSON number"))
            .into()
    } else {
        number.to_string()
    }
}

pub(crate) fn scalar(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Bool(true)) => "1".into(),
        Some(Value::Number(n)) => number_string(n),
        _ => String::new(),
    }
}

pub(crate) fn js_string(value: &Value) -> String {
    match value {
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => number_string(n),
        Value::String(s) => s.clone(),
        Value::Array(a) => a
            .iter()
            .map(|v| {
                if v.is_null() {
                    String::new()
                } else {
                    js_string(v)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".into(),
    }
}

pub(crate) fn default_string(value: Option<&Value>, spec: &Value) -> String {
    scalar(value.or_else(|| spec.get("default")))
}

pub(crate) fn join_class(parts: &[&str]) -> String {
    parts
        .iter()
        .flat_map(|s| s.split_whitespace())
        .collect::<Vec<_>>()
        .join(" ")
}

pub(crate) fn segments(path: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut bracket = false;
    for character in path.chars() {
        if (character == '[' && !bracket)
            || (character == ']' && bracket)
            || (character == '.' && !bracket)
        {
            if !current.is_empty() {
                result.push(std::mem::take(&mut current));
            }
            if character == '[' {
                bracket = true;
            }
            if character == ']' {
                bracket = false;
            }
        } else {
            current.push(character);
        }
    }
    if !current.is_empty() {
        result.push(current);
    }
    result
}

pub(crate) fn value_at<'a>(data: &'a Value, path: &str) -> Option<&'a Value> {
    let mut value = data;
    for segment in segments(path) {
        let key = segment.as_str();
        value = match value {
            Value::Object(map) => map.get(key)?,
            Value::Array(list) => list.get(key.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    Some(value)
}

pub(crate) fn bracket(path: &str, prefix: Option<&str>) -> String {
    let mut parts = segments(path);
    if let Some(prefix) = prefix.filter(|s| !s.is_empty()) {
        parts.insert(0, prefix.into());
    }
    let Some((head, tail)) = parts.split_first() else {
        return String::new();
    };
    head.clone() + &tail.iter().map(|s| format!("[{s}]")).collect::<String>()
}

pub(crate) fn rule_name(path: &str, rows: &[usize]) -> String {
    let parts = segments(path);
    let suffix = if path.ends_with("[]") { "[]" } else { "" };
    let Some((head, tail)) = parts.split_first() else {
        return suffix.into();
    };
    head.clone()
        + &tail
            .iter()
            .enumerate()
            .map(|(i, s)| {
                if rows.contains(&(i + 1)) {
                    "[]".into()
                } else {
                    format!("[{s}]")
                }
            })
            .collect::<String>()
        + suffix
}

pub(crate) fn leaf_name(path: &str, rows: &[usize]) -> String {
    let parts = segments(path);
    let Some(last) = parts.last() else {
        return path.into();
    };
    if rows.contains(&(parts.len() - 1)) {
        format!(
            "{}[]",
            parts
                .get(parts.len().wrapping_sub(2))
                .map(String::as_str)
                .unwrap_or("")
        )
    } else {
        last.clone() + if path.ends_with("[]") { "[]" } else { "" }
    }
}

fn encode_component(value: &str) -> String {
    let mut out = String::new();
    for b in value.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

pub(crate) fn control_id(prefix: &str, path: &str) -> String {
    format!("{}:{}", encode_component(prefix), encode_component(path))
}

pub(crate) fn translate(value: Option<&Value>, language: &str) -> String {
    match value {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Object(map)) => {
            for key in [language, "en", "ko"]
                .into_iter()
                .chain(map.keys().next().map(String::as_str))
            {
                if let Some(Value::String(s)) = map.get(key) {
                    if !s.is_empty() {
                        return s.clone();
                    }
                }
            }
            String::new()
        }
        _ => String::new(),
    }
}

pub(crate) fn put_string(map: &mut Map<String, Value>, key: &str, value: impl Into<String>) {
    map.insert(key.into(), Value::String(value.into()));
}

pub(crate) fn put_nonempty(map: &mut Map<String, Value>, key: &str, value: String) {
    if !value.is_empty() {
        put_string(map, key, value);
    }
}
