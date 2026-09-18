use crate::{bad, Result};
use serde_json::{json, Map, Value};

/// The members of one row of `companies`, of its `stores` and of their `departments`, in order.
const ROW_MEMBERS: [&[&str]; 3] = [
    &["name", "stores"],
    &["name", "enabled", "detail", "title", "departments"],
    &["name"],
];
/// The languages of a store `title`, in order.
const TITLE_LANGUAGES: [&str; 2] = ["ko", "en"];
pub fn text_member(value: Option<&Value>, name: &str) -> Result<Value> {
    value
        .filter(|value| value.is_string())
        .cloned()
        .ok_or_else(|| bad(format!("Expected text member {name}")))
}

/// The one rule for submitted `companies` data, of the record save and the benchmark save and
/// validation: keyed rows of companies, stores and departments with their keys in submitted
/// order and exactly their members in specification order. A native submission omits an
/// unchecked `enabled` and a collection without rows; they complete as `""` and `{}`.
pub fn companies(value: Option<&Value>, native: bool) -> Result<Value> {
    keyed_rows(value, native, 0)
}

pub fn valid_key(key: &str) -> bool {
    key.len() == 17
        && key.starts_with("__")
        && key.ends_with("__")
        && key.as_bytes()[2..15]
            .iter()
            .all(|v| v.is_ascii_digit() || (b'a'..=b'f').contains(v))
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

/// Insert one native field without sorting or rebuilding its row order. A name sent twice, or
/// a name that is also the parent of another field, is rejected.
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
    let members = current
        .as_object_mut()
        .ok_or_else(|| bad("Conflicting native field"))?;
    let last = segments.last().unwrap().to_string();
    if members.contains_key(&last) {
        return Err(bad(format!("Repeated native field {name}")));
    }
    members.insert(last, Value::String(value));
    Ok(())
}

/// Keyed rows of `companies` at one depth (companies, stores, departments): row keys in
/// submitted order, each row with exactly its members in specification order.
fn keyed_rows(value: Option<&Value>, native: bool, depth: usize) -> Result<Value> {
    let rows = match value {
        None if native => return Ok(json!({})),
        None => return Err(bad("Expected keyed rows")),
        Some(value) => value
            .as_object()
            .ok_or_else(|| bad("Expected keyed rows"))?,
    };
    let names = ROW_MEMBERS[depth];
    let mut result = Map::new();
    for (key, row) in rows {
        if !valid_key(key) {
            return Err(bad(format!("Expected a row key instead of {key}")));
        }
        let row = row
            .as_object()
            .ok_or_else(|| bad("Expected a row object"))?;
        if let Some(name) = row.keys().find(|name| !names.contains(&name.as_str())) {
            return Err(bad(format!("Unexpected row member {name}")));
        }
        let mut members = Map::new();
        for name in names {
            let value = row.get(*name);
            let value = match *name {
                "stores" | "departments" => keyed_rows(value, native, depth + 1)?,
                "enabled" => match value {
                    None if native => json!(""),
                    Some(Value::String(text)) if text.is_empty() || text == "1" => json!(text),
                    _ => return Err(bad("Expected enabled as \"\" or \"1\"")),
                },
                "title" => {
                    let title = value
                        .and_then(Value::as_object)
                        .filter(|title| title.len() == TITLE_LANGUAGES.len())
                        .ok_or_else(|| bad("Expected title with exactly ko and en"))?;
                    let mut languages = Map::new();
                    for language in TITLE_LANGUAGES {
                        languages
                            .insert(language.into(), text_member(title.get(language), "title")?);
                    }
                    Value::Object(languages)
                }
                _ => text_member(value, name)?,
            };
            members.insert((*name).into(), value);
        }
        result.insert(key.clone(), Value::Object(members));
    }
    Ok(Value::Object(result))
}
