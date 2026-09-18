use crate::{bad, Result};
use serde_json::{json, Map, Value};

/// One part of the submitted form (docs/spec/form-comparison.md, "Record resource"): a text or
/// checkbox leaf, an object of exactly these text members, an object of fields, or keyed rows of
/// one object of fields.
pub enum Shape {
    Text,
    Checkbox,
    Texts(&'static [&'static str]),
    Fields(&'static [Field]),
    Rows(&'static Shape),
}

/// One member of an object of fields; only a required field must be present.
pub struct Field {
    name: &'static str,
    shape: Shape,
    required: bool,
}

pub const fn field(name: &'static str, shape: Shape) -> Field {
    Field {
        name,
        shape,
        required: false,
    }
}

pub const fn required(name: &'static str, shape: Shape) -> Field {
    Field {
        name,
        shape,
        required: true,
    }
}

const DEPARTMENT: Shape = Shape::Fields(&[field("name", Shape::Text)]);
const STORE: Shape = Shape::Fields(&[
    field("name", Shape::Text),
    field("enabled", Shape::Checkbox),
    field("detail", Shape::Text),
    field("title", Shape::Texts(&["ko", "en"])),
    field("departments", Shape::Rows(&DEPARTMENT)),
]);
const COMPANY: Shape = Shape::Fields(&[
    field("name", Shape::Text),
    field("stores", Shape::Rows(&STORE)),
]);
/// The submitted `companies`, of the record form and of the benchmark form.
pub const COMPANIES: Shape = Shape::Rows(&COMPANY);
/// The benchmark form, which holds only `companies`.
pub const SCENARIO: Shape = Shape::Fields(&[field("companies", COMPANIES)]);

/// The value of an absent field: empty text, empty texts or no rows.
fn empty(shape: &Shape) -> Value {
    match shape {
        Shape::Text | Shape::Checkbox => json!(""),
        Shape::Texts(names) => Value::Object(
            names
                .iter()
                .map(|name| ((*name).into(), json!("")))
                .collect(),
        ),
        Shape::Fields(_) | Shape::Rows(_) => json!({}),
    }
}

/// The one rule for submitted form data, of the record save and the benchmark save and
/// validation: the submitted `value` of `shape` at `path`, completed and in the member order of
/// the shape, with row keys in submitted order. Form data leaves out a field that holds no value,
/// so an absent field other than a required one completes as its empty value in both media
/// types. Any other difference answers 400.
pub fn shaped(value: &Value, shape: &Shape, path: &str) -> Result<Value> {
    let members: Vec<(&str, &Shape, bool)> = match shape {
        Shape::Text | Shape::Checkbox => {
            let text = value
                .as_str()
                .ok_or_else(|| bad(format!("Expected text at {path}")))?;
            if matches!(shape, Shape::Checkbox) && !text.is_empty() && text != "1" {
                return Err(bad(format!("Expected \"\" or \"1\" at {path}")));
            }
            return Ok(json!(text));
        }
        Shape::Rows(row) => {
            let mut result = Map::new();
            for (key, value) in object(value, path)? {
                if !valid_key(key) {
                    return Err(bad(format!("Expected a row key at {path}: {key}")));
                }
                result.insert(key.clone(), shaped(value, row, &format!("{path}.{key}"))?);
            }
            return Ok(Value::Object(result));
        }
        // An object of texts holds every member; a field may be absent unless it is required.
        Shape::Texts(names) => names
            .iter()
            .map(|name| (*name, &Shape::Text, true))
            .collect(),
        Shape::Fields(fields) => fields
            .iter()
            .map(|field| (field.name, &field.shape, field.required))
            .collect(),
    };
    let given = object(value, path)?;
    if let Some(name) = given
        .keys()
        .find(|name| !members.iter().any(|(member, _, _)| member == name))
    {
        return Err(bad(format!("Unexpected member {path}.{name}")));
    }
    let mut result = Map::new();
    for (name, shape, required) in members {
        let value = match given.get(name) {
            Some(value) => shaped(value, shape, &format!("{path}.{name}"))?,
            None if required => return Err(bad(format!("Missing member {path}.{name}"))),
            None => empty(shape),
        };
        result.insert(name.into(), value);
    }
    Ok(Value::Object(result))
}

fn object<'a>(value: &'a Value, path: &str) -> Result<&'a Map<String, Value>> {
    value
        .as_object()
        .ok_or_else(|| bad(format!("Expected an object at {path}")))
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
