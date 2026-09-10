use crate::{bad, Result};
use serde_json::{json, Map, Value};

pub fn text(value: &Value) -> Result<String> {
    match value {
        Value::Null => Ok(String::new()),
        Value::String(value) => Ok(value.clone()),
        _ => Err(bad("Expected string field value")),
    }
}

pub fn valid_key(key: &str) -> bool {
    key.len() == 17
        && key.starts_with("__")
        && key.ends_with("__")
        && key.as_bytes()[2..15]
            .iter()
            .all(|v| v.is_ascii_digit() || (b'a'..=b'f').contains(v))
}

pub fn empty_rows() -> Value {
    json!({})
}

pub fn rows(value: &Value) -> Result<Vec<(String, Map<String, Value>)>> {
    let entries: Vec<(String, &Value)> = value
        .as_object()
        .ok_or_else(|| bad("Expected keyed collection"))?
        .iter()
        .map(|(key, value)| (key.clone(), value))
        .collect();
    entries
        .into_iter()
        .map(|(key, value)| {
            if !valid_key(&key) {
                return Err(bad("Invalid row key"));
            }
            Ok((
                key,
                value
                    .as_object()
                    .ok_or_else(|| bad("Expected row object"))?
                    .clone(),
            ))
        })
        .collect()
}

pub fn collection(rows: Vec<(String, Map<String, Value>)>) -> Value {
    Value::Object(
        rows.into_iter()
            .map(|(key, value)| (key, Value::Object(value)))
            .collect(),
    )
}

/// Insert one native field without sorting or rebuilding its row order.
pub fn insert_native(root: &mut Value, name: &str, value: String) -> Result<()> {
    let mut segments = Vec::new();
    let first = name.find('[').unwrap_or(name.len());
    let base = &name[..first];
    if base.is_empty()
        || !base
            .bytes()
            .enumerate()
            .all(|(i, b)| b == b'_' || b.is_ascii_alphabetic() || i > 0 && b.is_ascii_digit())
    {
        return Err(bad("Invalid native field"));
    }
    segments.push(base);
    let mut rest = &name[first..];
    while !rest.is_empty() {
        if !rest.starts_with('[') {
            return Err(bad("Invalid native field"));
        }
        let end = rest.find(']').ok_or_else(|| bad("Invalid native field"))?;
        let segment = &rest[1..end];
        if segment.is_empty() || segment.contains('[') {
            return Err(bad("Invalid native field"));
        }
        segments.push(segment);
        rest = &rest[end + 1..];
    }
    let mut current = root;
    for key in &segments[..segments.len() - 1] {
        let map = current
            .as_object_mut()
            .ok_or_else(|| bad("Conflicting native field"))?;
        current = map.entry(key.to_string()).or_insert_with(|| json!({}));
    }
    current
        .as_object_mut()
        .ok_or_else(|| bad("Conflicting native field"))?
        .insert(segments.last().unwrap().to_string(), Value::String(value));
    Ok(())
}

pub fn check_json_shape(data: &Value) -> Result<()> {
    fn walk(value: &Value, level: usize) -> Result<()> {
        for (_, row) in rows(value)? {
            if level == 1 && row.get("title").is_some_and(|v| !v.is_object()) {
                return Err(bad("Expected language object"));
            }
            if level < 2 {
                if let Some(child) = row.get(["stores", "departments"][level]) {
                    walk(child, level + 1)?;
                }
            }
        }
        Ok(())
    }
    let data = data
        .as_object()
        .ok_or_else(|| bad("Expected form object"))?;
    if let Some(value) = data.get("companies") {
        walk(value, 0)?;
    }
    Ok(())
}

/// Normalize omitted controls while retaining all submitted rows and keys.
pub fn normalize(data: &Value) -> Result<Value> {
    fn walk(value: &Value, level: usize) -> Result<Value> {
        let mut values = rows(value)?;
        for (_, row) in &mut values {
            row.insert(
                "name".into(),
                Value::String(text(row.get("name").unwrap_or(&Value::Null))?),
            );
            if level == 1 {
                for field in ["enabled", "detail"] {
                    let value = text(row.get(field).unwrap_or(&Value::Null))?;
                    if field == "enabled" && !value.is_empty() && value != "1" {
                        return Err(bad("Expected checkbox value 1 or empty string"));
                    }
                    row.insert(field.into(), Value::String(value));
                }
                let empty = json!({});
                let title = row
                    .get("title")
                    .unwrap_or(&empty)
                    .as_object()
                    .ok_or_else(|| bad("Expected language object"))?;
                if title
                    .keys()
                    .any(|language| language != "ko" && language != "en")
                {
                    return Err(bad("Expected ko or en title field"));
                }
                let title = json!({"ko":text(title.get("ko").unwrap_or(&Value::Null))?,"en":text(title.get("en").unwrap_or(&Value::Null))?});
                row.insert("title".into(), title);
            }
            if level < 2 {
                let field = ["stores", "departments"][level];
                let child = walk(row.get(field).unwrap_or(&empty_rows()), level + 1)?;
                row.insert(field.into(), child);
            }
        }
        Ok(collection(values))
    }
    let data = data
        .as_object()
        .ok_or_else(|| bad("Expected form object"))?;
    Ok(json!({"companies":walk(data.get("companies").unwrap_or(&empty_rows()),0)?}))
}
