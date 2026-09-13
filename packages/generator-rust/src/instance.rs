use crate::template::repeats;
use crate::util::{segments, value_at};
use crate::{bind_form, BindOptions, FieldTemplate, FormError, FormResult, FormTemplate};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

/// Format a nonnegative sequence containing at most 13 decimal digits.
pub fn sequence_row_key(sequence: &str) -> FormResult<String> {
    if sequence.is_empty() || sequence.len() > 13 || !sequence.bytes().all(|c| c.is_ascii_digit()) {
        return Err(FormError::input(
            "A sequence must contain 1–13 decimal digits",
        ));
    }
    Ok(format!("__{sequence:0>13}__"))
}

/// Generate a random 13-character hexadecimal row key using the OS random source.
pub fn create_row_key() -> FormResult<String> {
    let mut bytes = [0u8; 7];
    getrandom::fill(&mut bytes)
        .map_err(|e| FormError::input(format!("Unable to generate a row key: {e}")))?;
    let digits = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
    Ok(format!("__{}__", &digits[..13]))
}

fn check_key(key: &str) -> FormResult<()> {
    if key.is_empty()
        || !key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        || key.bytes().all(|b| b.is_ascii_digit())
        || ["__proto__", "prototype", "constructor"].contains(&key)
    {
        return Err(FormError::input(format!(
            "Invalid row key: {key}; use sequenceRowKey for numeric ids"
        )));
    }
    Ok(())
}

fn checked_segments(path: &str) -> FormResult<Vec<String>> {
    let parts = segments(path);
    if parts.is_empty()
        || parts
            .iter()
            .any(|s| ["__proto__", "prototype", "constructor"].contains(&s.as_str()))
    {
        return Err(FormError::input(format!("Invalid form path: {path}")));
    }
    Ok(parts)
}

fn put_at(data: &Value, path: &[String], value: Value) -> Value {
    let mut object = data.as_object().cloned().unwrap_or_default();
    let head = &path[0];
    let next = if path.len() == 1 {
        value
    } else {
        put_at(object.get(head).unwrap_or(&Value::Null), &path[1..], value)
    };
    object.insert(head.clone(), next);
    object.into()
}

fn fresh_key(used: &Map<String, Value>) -> FormResult<String> {
    for _ in 0..100 {
        let key = create_row_key()?;
        if !used.contains_key(&key) {
            return Ok(key);
        }
    }
    Err(FormError::input("Unable to generate an unused row key"))
}

fn normalize_row(field: &FieldTemplate, value: Option<&Value>) -> FormResult<Value> {
    if field.spec.get("type").is_some_and(|t| t == "group") {
        normalize_fields(&field.children, value)
    } else {
        Ok(value
            .or_else(|| field.spec.get("default"))
            .cloned()
            .unwrap_or(json!("")))
    }
}

fn normalize_fields(fields: &[FieldTemplate], value: Option<&Value>) -> FormResult<Value> {
    let mut data = match value {
        None => Map::new(),
        Some(Value::Object(map)) => map.clone(),
        _ => return Err(FormError::input("Group data must be an object")),
    };
    for field in fields {
        let raw = data.get(&field.name);
        if repeats(field) {
            let mut rows = Map::new();
            match raw {
                None => {
                    rows.insert(fresh_key(&rows)?, normalize_row(field, None)?);
                }
                Some(Value::Object(map)) => {
                    for (key, value) in map {
                        check_key(key)?;
                        rows.insert(key.clone(), normalize_row(field, Some(value))?);
                    }
                }
                _ => {
                    return Err(FormError::input(format!(
                        "Repeated data must be a keyed object: {}",
                        field.name
                    )))
                }
            }
            data.insert(field.name.clone(), rows.into());
        } else if field.spec.get("type").is_some_and(|t| t == "group") {
            let group = normalize_fields(&field.children, raw)?;
            data.insert(field.name.clone(), group);
        } else if raw.is_none() {
            if let Some(default) = field.spec.get("default") {
                data.insert(field.name.clone(), default.clone());
            }
        }
    }
    Ok(data.into())
}

fn copy_row_value(field: &FieldTemplate, value: &Value) -> FormResult<Value> {
    if field.spec.get("type").is_none_or(|t| t != "group") {
        return Ok(value.clone());
    }
    let mut row = value.as_object().cloned().unwrap_or_default();
    for child in &field.children {
        let Some(raw) = row.get(&child.name).filter(|v| v.is_object()) else {
            continue;
        };
        if repeats(child) {
            let mut used = raw.as_object().unwrap().clone();
            let mut copied = Map::new();
            for value in raw.as_object().unwrap().values() {
                let key = fresh_key(&used)?;
                used.insert(key.clone(), Value::Null);
                copied.insert(key, copy_row_value(child, value)?);
            }
            row.insert(child.name.clone(), copied.into());
        } else if child.spec.get("type").is_some_and(|t| t == "group") {
            let copied = copy_row_value(child, raw)?;
            row.insert(child.name.clone(), copied);
        }
    }
    Ok(row.into())
}

/// Values, identity and insertion position for an added or copied row.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddRowOptions {
    /// Supplied row key; omitted to generate a new key.
    pub key: Option<String>,
    /// Existing row after which insertion occurs; omitted to append.
    pub after_key: Option<String>,
    /// Initial value; omitted to apply field defaults.
    #[serde(
        default,
        deserialize_with = "present_value",
        skip_serializing_if = "Option::is_none"
    )]
    pub value: Option<Value>,
}

fn present_value<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Value>, D::Error> {
    Value::deserialize(deserializer).map(Some)
}

/// An independent editable form instance using a compiled structure.
#[derive(Clone)]
pub struct Form {
    template: FormTemplate,
    data: Value,
    fields: Vec<Value>,
    options: BindOptions,
    revision: u64,
}

impl Form {
    /// Create an instance, prepare default data and evaluate fields.
    pub fn new(template: FormTemplate, data: &Value, options: BindOptions) -> FormResult<Self> {
        let data = normalize_fields(&template.fields, Some(data))?;
        let fields = bind_form(&template, &data, &options)?;
        Ok(Self {
            template,
            data,
            fields,
            options,
            revision: 0,
        })
    }

    /// Return the shared structure without instance values.
    pub fn template(&self) -> &FormTemplate {
        &self.template
    }

    /// Return the current field models.
    pub fn fields(&self) -> &[Value] {
        &self.fields
    }

    /// Number of successful instance updates.
    pub fn revision(&self) -> u64 {
        self.revision
    }

    /// Return detached submission data.
    pub fn get_data(&self) -> Value {
        self.data.clone()
    }

    /// Replace record data and reevaluate the form atomically.
    pub fn set_data(&mut self, data: &Value) -> FormResult<()> {
        self.commit(normalize_fields(&self.template.fields, Some(data))?)
    }

    /// Return a detached value relative to the data root.
    pub fn get_value(&self, path: &str) -> FormResult<Value> {
        checked_segments(path)?;
        Ok(value_at(&self.data, path).cloned().unwrap_or(Value::Null))
    }

    /// Update one data path and reevaluate the form atomically.
    pub fn set_value(&mut self, path: &str, value: Value) -> FormResult<()> {
        let data = put_at(&self.data, &checked_segments(path)?, value);
        self.set_data(&data)
    }

    fn commit(&mut self, data: Value) -> FormResult<()> {
        let fields = bind_form(&self.template, &data, &self.options)?;
        self.data = data;
        self.fields = fields;
        self.revision += 1;
        Ok(())
    }

    fn collection(&self, path: &str) -> FormResult<(&FieldTemplate, &Map<String, Value>)> {
        let parts = checked_segments(path)?;
        let mut fields = &self.template.fields;
        let mut selected = None;
        let mut i = 0;
        while i < parts.len() {
            let field = fields
                .iter()
                .find(|f| f.name == parts[i])
                .ok_or_else(|| FormError::input(format!("Unknown collection: {path}")))?;
            if i + 1 == parts.len() {
                selected = Some(field);
                break;
            }
            if repeats(field) {
                i += 1;
            }
            fields = &field.children;
            i += 1;
        }
        let field = selected
            .filter(|f| repeats(f))
            .ok_or_else(|| FormError::input(format!("Not a keyed collection: {path}")))?;
        let rows = value_at(&self.data, path)
            .and_then(Value::as_object)
            .ok_or_else(|| FormError::input(format!("Not a keyed collection: {path}")))?;
        Ok((field, rows))
    }

    /// Insert a row with supplied data or field defaults.
    pub fn add_row(&mut self, path: &str, options: AddRowOptions) -> FormResult<String> {
        let (field, rows) = self.collection(path)?;
        if field
            .spec
            .get("multiple")
            .and_then(|v| v.get("max"))
            .and_then(Value::as_f64)
            .is_some_and(|max| rows.len() as f64 >= max)
        {
            return Err(FormError::input(format!(
                "Maximum row count reached: {path}"
            )));
        }
        let key = match options.key {
            Some(key) => key,
            None => fresh_key(rows)?,
        };
        check_key(&key)?;
        if rows.contains_key(&key) {
            return Err(FormError::input(format!("Row key already exists: {key}")));
        }
        let mut entries = rows
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect::<Vec<_>>();
        let at = match &options.after_key {
            None => entries.len(),
            Some(after) => {
                entries
                    .iter()
                    .position(|(k, _)| k == after)
                    .ok_or_else(|| FormError::input(format!("Unknown row: {after}")))?
                    + 1
            }
        };
        entries.insert(
            at,
            (key.clone(), normalize_row(field, options.value.as_ref())?),
        );
        self.commit(put_at(
            &self.data,
            &checked_segments(path)?,
            Value::Object(entries.into_iter().collect()),
        ))?;
        Ok(key)
    }

    /// Copy current values and generate new identities for nested repeated rows.
    pub fn copy_row(
        &mut self,
        path: &str,
        key: &str,
        mut options: AddRowOptions,
    ) -> FormResult<String> {
        let (field, rows) = self.collection(path)?;
        let value = rows
            .get(key)
            .ok_or_else(|| FormError::input(format!("Unknown row: {key}")))?;
        options.value = Some(copy_row_value(field, value)?);
        if options.after_key.is_none() {
            options.after_key = Some(key.into());
        }
        self.add_row(path, options)
    }

    /// Remove a row while enforcing the minimum count.
    pub fn remove_row(&mut self, path: &str, key: &str) -> FormResult<()> {
        let (field, rows) = self.collection(path)?;
        if !rows.contains_key(key) {
            return Err(FormError::input(format!("Unknown row: {key}")));
        }
        if field
            .spec
            .get("multiple")
            .and_then(|v| v.get("min"))
            .and_then(Value::as_f64)
            .is_some_and(|min| rows.len() as f64 <= min)
        {
            return Err(FormError::input(format!(
                "Minimum row count reached: {path}"
            )));
        }
        let mut rows = rows.clone();
        rows.shift_remove(key);
        self.commit(put_at(&self.data, &checked_segments(path)?, rows.into()))
    }

    /// Move a row without changing its identity or values.
    pub fn move_row(&mut self, path: &str, key: &str, index: usize) -> FormResult<()> {
        let (_, rows) = self.collection(path)?;
        let mut entries = rows
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect::<Vec<_>>();
        let from = entries
            .iter()
            .position(|(k, _)| k == key)
            .ok_or_else(|| FormError::input(format!("Unknown row: {key}")))?;
        if index >= entries.len() {
            return Err(FormError::input(format!("Invalid row position: {index}")));
        }
        if from == index {
            return Ok(());
        }
        let row = entries.remove(from);
        entries.insert(index, row);
        self.commit(put_at(
            &self.data,
            &checked_segments(path)?,
            Value::Object(entries.into_iter().collect()),
        ))
    }

    /// Apply a saved sequence key to one row and update its descendant paths.
    pub fn rekey_row(&mut self, path: &str, old_key: &str, new_key: &str) -> FormResult<()> {
        let (_, rows) = self.collection(path)?;
        check_key(new_key)?;
        if !rows.contains_key(old_key) {
            return Err(FormError::input(format!("Unknown row: {old_key}")));
        }
        if old_key == new_key {
            return Ok(());
        }
        if rows.contains_key(new_key) {
            return Err(FormError::input(format!(
                "Row key already exists: {new_key}"
            )));
        }
        let rows = rows
            .iter()
            .map(|(k, v)| {
                (
                    if k == old_key {
                        new_key.to_owned()
                    } else {
                        k.clone()
                    },
                    v.clone(),
                )
            })
            .collect::<Map<_, _>>();
        self.commit(put_at(&self.data, &checked_segments(path)?, rows.into()))
    }
}
