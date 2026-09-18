//! Input text (docs/spec/input-text.md).
//!
//! Every string and object member name of a specification, a composition file
//! and caller data is a sequence of Unicode scalar values. A Rust `String` is
//! always one, so the value entry points need no check. JSON text can still
//! carry an unpaired surrogate escape such as `"\ud800"`, which `serde_json`
//! refuses to decode. [`JsonText`] reads such a document without replacing
//! anything, and [`check_specification`] and [`check_inputs`] report the same
//! failures as every other runtime: the load failure `INVALID_TEXT` for a
//! specification or a file, and `INVALID_FORM_INPUT` for other caller values.

use std::collections::HashMap;
use std::fmt;

use serde_json::{Map, Number, Value};

use crate::compose::{ComposeErrorCode, ComposeLoadError};
use crate::validate::{FormInputError, ValidateError, ValidateOptions, ValidationResult};
use crate::{ValidateDetailOptions, ValidateListOptions};

/// Message of every input text failure.
pub const MESSAGE: &str = "Text must be Unicode scalar values";

/// Message of every value beyond the limits.
pub const VALUE_LIMIT_MESSAGE: &str = "Recursive or excessively nested value";

/// The nesting depth the JSON parser accepts (same as other runtimes).
const MAX_DEPTH: usize = 512;

/// Maximum nodes a value may hold: every array, object, string, number, boolean and null.
const NODE_LIMIT: usize = 1_000_000;

/// Maximum levels of arrays and objects a value may nest.
const NESTING_LIMIT: usize = 512;

/// A string or member name of a JSON document: valid text, or the UTF-16
/// code units of text that holds an unpaired surrogate.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum JsonString {
    /// A sequence of Unicode scalar values.
    Text(String),
    /// Code units that include an unpaired surrogate.
    Units(Vec<u16>),
}

impl JsonString {
    /// The text, when it is valid.
    pub fn as_str(&self) -> Option<&str> {
        match self {
            JsonString::Text(text) => Some(text),
            JsonString::Units(_) => None,
        }
    }
}

/// A JSON document read without replacing any text.
#[derive(Clone, Debug, PartialEq)]
pub enum JsonText {
    /// `null`.
    Null,
    /// `true` or `false`.
    Bool(bool),
    /// A number, kept as written.
    Number(String),
    /// A string.
    String(JsonString),
    /// An array.
    Array(Vec<JsonText>),
    /// An object; a repeated name keeps its first position and its last value.
    Object(Vec<(JsonString, JsonText)>),
}

/// JSON text that is not one JSON document.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JsonTextError {
    /// Byte offset of the first character that is not accepted.
    pub offset: usize,
}

impl fmt::Display for JsonTextError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Invalid JSON text at byte {}", self.offset)
    }
}

impl std::error::Error for JsonTextError {}

struct Parser<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl Parser<'_> {
    fn error<T>(&self) -> Result<T, JsonTextError> {
        Err(JsonTextError { offset: self.pos })
    }

    fn space(&mut self) {
        while matches!(self.bytes.get(self.pos), Some(b' ' | b'\t' | b'\n' | b'\r')) {
            self.pos += 1;
        }
    }

    fn literal(&mut self, word: &[u8], value: JsonText) -> Result<JsonText, JsonTextError> {
        if self.bytes[self.pos..].starts_with(word) {
            self.pos += word.len();
            Ok(value)
        } else {
            self.error()
        }
    }

    fn value(&mut self, depth: usize) -> Result<JsonText, JsonTextError> {
        self.space();
        match self.bytes.get(self.pos) {
            Some(b'{') => {
                if depth >= MAX_DEPTH {
                    return self.error();
                }
                self.pos += 1;
                let mut members: Vec<(JsonString, JsonText)> = Vec::new();
                // The position of each name in `members`.
                let mut positions: HashMap<JsonString, usize> = HashMap::new();
                self.space();
                if self.bytes.get(self.pos) == Some(&b'}') {
                    self.pos += 1;
                    return Ok(JsonText::Object(members));
                }
                loop {
                    self.space();
                    if self.bytes.get(self.pos) != Some(&b'"') {
                        return self.error();
                    }
                    let name = self.string()?;
                    self.space();
                    if self.bytes.get(self.pos) != Some(&b':') {
                        return self.error();
                    }
                    self.pos += 1;
                    let value = self.value(depth + 1)?;
                    match positions.get(&name) {
                        Some(&position) => members[position].1 = value,
                        None => {
                            positions.insert(name.clone(), members.len());
                            members.push((name, value));
                        }
                    }
                    self.space();
                    match self.bytes.get(self.pos) {
                        Some(b',') => self.pos += 1,
                        Some(b'}') => {
                            self.pos += 1;
                            return Ok(JsonText::Object(members));
                        }
                        _ => return self.error(),
                    }
                }
            }
            Some(b'[') => {
                if depth >= MAX_DEPTH {
                    return self.error();
                }
                self.pos += 1;
                let mut items = Vec::new();
                self.space();
                if self.bytes.get(self.pos) == Some(&b']') {
                    self.pos += 1;
                    return Ok(JsonText::Array(items));
                }
                loop {
                    items.push(self.value(depth + 1)?);
                    self.space();
                    match self.bytes.get(self.pos) {
                        Some(b',') => self.pos += 1,
                        Some(b']') => {
                            self.pos += 1;
                            return Ok(JsonText::Array(items));
                        }
                        _ => return self.error(),
                    }
                }
            }
            Some(b'"') => Ok(JsonText::String(self.string()?)),
            Some(b't') => self.literal(b"true", JsonText::Bool(true)),
            Some(b'f') => self.literal(b"false", JsonText::Bool(false)),
            Some(b'n') => self.literal(b"null", JsonText::Null),
            Some(b'-' | b'0'..=b'9') => self.number(),
            _ => self.error(),
        }
    }

    fn digits(&mut self) -> usize {
        let start = self.pos;
        while matches!(self.bytes.get(self.pos), Some(b'0'..=b'9')) {
            self.pos += 1;
        }
        self.pos - start
    }

    fn number(&mut self) -> Result<JsonText, JsonTextError> {
        let start = self.pos;
        if self.bytes[self.pos] == b'-' {
            self.pos += 1;
        }
        match self.bytes.get(self.pos) {
            Some(b'0') => self.pos += 1,
            Some(b'1'..=b'9') => {
                self.digits();
            }
            _ => return self.error(),
        }
        if self.bytes.get(self.pos) == Some(&b'.') {
            self.pos += 1;
            if self.digits() == 0 {
                return self.error();
            }
        }
        if matches!(self.bytes.get(self.pos), Some(b'e' | b'E')) {
            self.pos += 1;
            if matches!(self.bytes.get(self.pos), Some(b'+' | b'-')) {
                self.pos += 1;
            }
            if self.digits() == 0 {
                return self.error();
            }
        }
        let text = std::str::from_utf8(&self.bytes[start..self.pos]).expect("ASCII digits");
        Ok(JsonText::Number(text.to_owned()))
    }

    fn hex(&mut self) -> Result<u16, JsonTextError> {
        let digits = self
            .bytes
            .get(self.pos..self.pos + 4)
            .ok_or(JsonTextError { offset: self.pos })?;
        let text = std::str::from_utf8(digits).map_err(|_| JsonTextError { offset: self.pos })?;
        if !text.bytes().all(|b| b.is_ascii_hexdigit()) {
            return self.error();
        }
        self.pos += 4;
        Ok(u16::from_str_radix(text, 16).expect("hex digits"))
    }

    fn string(&mut self) -> Result<JsonString, JsonTextError> {
        self.pos += 1;
        let mut units: Vec<u16> = Vec::new();
        loop {
            let Some(&byte) = self.bytes.get(self.pos) else {
                return self.error();
            };
            match byte {
                b'"' => {
                    self.pos += 1;
                    return Ok(match String::from_utf16(&units) {
                        Ok(text) => JsonString::Text(text),
                        Err(_) => JsonString::Units(units),
                    });
                }
                b'\\' => {
                    self.pos += 1;
                    let unit = match self.bytes.get(self.pos) {
                        Some(b'"') => u16::from(b'"'),
                        Some(b'\\') => u16::from(b'\\'),
                        Some(b'/') => u16::from(b'/'),
                        Some(b'b') => 0x08,
                        Some(b'f') => 0x0c,
                        Some(b'n') => u16::from(b'\n'),
                        Some(b'r') => u16::from(b'\r'),
                        Some(b't') => u16::from(b'\t'),
                        Some(b'u') => {
                            self.pos += 1;
                            units.push(self.hex()?);
                            continue;
                        }
                        _ => return self.error(),
                    };
                    self.pos += 1;
                    units.push(unit);
                }
                0x00..=0x1f => return self.error(),
                _ => {
                    // The input is a `str`, so each character is whole.
                    let length = match byte {
                        0x00..=0x7f => 1,
                        0xc0..=0xdf => 2,
                        0xe0..=0xef => 3,
                        _ => 4,
                    };
                    let character = std::str::from_utf8(&self.bytes[self.pos..self.pos + length])
                        .ok()
                        .and_then(|text| text.chars().next())
                        .ok_or(JsonTextError { offset: self.pos })?;
                    let mut buffer = [0u16; 2];
                    units.extend_from_slice(character.encode_utf16(&mut buffer));
                    self.pos += character.len_utf8();
                }
            }
        }
    }
}

impl JsonText {
    /// Read one JSON document with the grammar and nesting limit `serde_json`
    /// applies, keeping every string as written.
    pub fn parse(text: &str) -> Result<JsonText, JsonTextError> {
        let mut parser = Parser {
            bytes: text.as_bytes(),
            pos: 0,
        };
        let value = parser.value(0)?;
        parser.space();
        if parser.pos != parser.bytes.len() {
            return parser.error();
        }
        Ok(value)
    }

    /// The member `name` of an object.
    pub fn get(&self, name: &str) -> Option<&JsonText> {
        match self {
            JsonText::Object(members) => members
                .iter()
                .find(|(member, _)| member.as_str() == Some(name))
                .map(|(_, value)| value),
            _ => None,
        }
    }

    /// The item at `index` of an array.
    pub fn item(&self, index: usize) -> Option<&JsonText> {
        match self {
            JsonText::Array(items) => items.get(index),
            _ => None,
        }
    }

    /// The value as [`Value`], or `None` when it holds invalid text or a number
    /// `serde_json` does not accept.
    pub fn to_value(&self) -> Option<Value> {
        Some(match self {
            JsonText::Null => Value::Null,
            JsonText::Bool(value) => Value::Bool(*value),
            JsonText::Number(text) => Value::Number(serde_json::from_str::<Number>(text).ok()?),
            JsonText::String(text) => Value::String(text.as_str()?.to_owned()),
            JsonText::Array(items) => Value::Array(
                items
                    .iter()
                    .map(JsonText::to_value)
                    .collect::<Option<_>>()?,
            ),
            JsonText::Object(members) => {
                let mut map = Map::new();
                for (name, value) in members {
                    map.insert(name.as_str()?.to_owned(), value.to_value()?);
                }
                Value::Object(map)
            }
        })
    }

    /// The document's shape for request checks that read only kinds and valid
    /// names: invalid text becomes an empty string, an invalid member name a
    /// name no valid request member uses, and a number `serde_json` does not
    /// accept `null`. The shape is never an operation input; the text checks run
    /// before any part of it reaches an operation.
    pub fn shape(&self) -> Value {
        match self {
            JsonText::Array(items) => Value::Array(items.iter().map(JsonText::shape).collect()),
            JsonText::Object(members) => {
                let mut map = Map::new();
                for (index, (name, value)) in members.iter().enumerate() {
                    let name = match name {
                        JsonString::Text(text) => text.clone(),
                        JsonString::Units(_) => format!("\u{FFFF}{index}"),
                    };
                    map.insert(name, value.shape());
                }
                Value::Object(map)
            }
            JsonText::String(JsonString::Units(_)) => Value::String(String::new()),
            other => other.to_value().unwrap_or(Value::Null),
        }
    }

    /// Whether any string or member name is invalid text.
    pub fn has_invalid_text(&self) -> bool {
        match self {
            JsonText::String(text) => text.as_str().is_none(),
            JsonText::Array(items) => items.iter().any(JsonText::has_invalid_text),
            JsonText::Object(members) => members
                .iter()
                .any(|(name, value)| name.as_str().is_none() || value.has_invalid_text()),
            _ => false,
        }
    }

    /// The path of the first invalid text: the path of a string, or of the
    /// object whose member name is invalid. Members are visited in code point
    /// order of their names and array items in index order.
    pub fn invalid_path(&self) -> Option<Vec<String>> {
        if !self.has_invalid_text() {
            return None;
        }
        let mut path = Vec::new();
        self.first_invalid(&mut path).then_some(path)
    }

    fn first_invalid(&self, path: &mut Vec<String>) -> bool {
        match self {
            JsonText::String(text) => text.as_str().is_none(),
            JsonText::Array(items) => items.iter().enumerate().any(|(index, item)| {
                path.push(index.to_string());
                let found = item.first_invalid(path);
                if !found {
                    path.pop();
                }
                found
            }),
            JsonText::Object(members) => {
                let mut named = Vec::with_capacity(members.len());
                for (name, value) in members {
                    match name.as_str() {
                        Some(text) => named.push((text, value)),
                        None => return true,
                    }
                }
                // Byte order of UTF-8 is code point order.
                named.sort_by(|a, b| a.0.cmp(b.0));
                named.into_iter().any(|(name, value)| {
                    path.push(name.to_owned());
                    let found = value.first_invalid(path);
                    if !found {
                        path.pop();
                    }
                    found
                })
            }
            _ => false,
        }
    }

    /// Whether this value holds a limit violation (too many nodes or too deep nesting).
    pub fn has_limit_violation(&self) -> bool {
        let mut nodes = 0;
        self.check_limits(&mut nodes, 0)
    }

    /// Count nodes and check nesting depth; true when limits are exceeded.
    fn check_limits(&self, nodes: &mut usize, depth: usize) -> bool {
        *nodes += 1;
        if *nodes > NODE_LIMIT {
            return true;
        }
        match self {
            JsonText::Array(items) => {
                if depth >= NESTING_LIMIT {
                    return true;
                }
                items.iter().any(|item| item.check_limits(nodes, depth + 1))
            }
            JsonText::Object(members) => {
                if depth >= NESTING_LIMIT {
                    return true;
                }
                members
                    .iter()
                    .any(|(_, value)| value.check_limits(nodes, depth + 1))
            }
            _ => false,
        }
    }
}

/// Check a specification and then the composition files an operation reads.
/// Invalid text is the `INVALID_TEXT` load failure located at its
/// specification path, or at the file name followed by its path in the file;
/// an invalid file name is located at the empty path. A value beyond its limits
/// is `INVALID_FORM_INPUT` naming `spec` or `files`.
pub fn check_specification(
    spec: Option<&JsonText>,
    files: Option<&JsonText>,
) -> Result<(), ValidateError> {
    for (name, value) in [("spec", spec), ("files", files)] {
        if let Some(value) = value {
            if value.has_limit_violation() {
                return Err(ValidateError::Input(FormInputError::new(format!(
                    "{VALUE_LIMIT_MESSAGE}: {name}"
                ))));
            }
            if let Some(trace) = value.invalid_path() {
                return Err(ValidateError::Load(ComposeLoadError::with_trace(
                    ComposeErrorCode::InvalidText,
                    MESSAGE,
                    trace,
                )));
            }
        }
    }
    Ok(())
}

/// Check named caller values in order; absent values are skipped. Invalid text
/// is `INVALID_FORM_INPUT` naming the value and its path, and a value beyond its limits
/// is `INVALID_FORM_INPUT` naming the value.
pub fn check_inputs(inputs: &[(&str, Option<&JsonText>)]) -> Result<(), FormInputError> {
    for (name, value) in inputs {
        if let Some(value) = value {
            if value.has_limit_violation() {
                return Err(FormInputError::new(format!(
                    "{VALUE_LIMIT_MESSAGE}: {name}"
                )));
            }
            if let Some(path) = value.invalid_path() {
                let mut location = vec![(*name).to_owned()];
                location.extend(path);
                return Err(FormInputError::new(format!(
                    "{MESSAGE}: {}",
                    location.join(".")
                )));
            }
        }
    }
    Ok(())
}

/// Convert JsonText to serde_json::Value with iterative approach to handle 512+ levels.
/// Invalid text (already checked) becomes None; invalid numbers become None.
fn json_text_to_value(value: &JsonText) -> Option<Value> {
    enum StackFrame<'a> {
        // Process a value and push its result
        Process(&'a JsonText),
        // Collect array items (count, accumulated items)
        CollectArray(usize, Vec<Value>),
        // Collect object members (names to process, accumulated object)
        CollectObject(Vec<&'a JsonString>, Map<String, Value>),
    }

    let mut stack = vec![StackFrame::Process(value)];
    let mut result_stack: Vec<Value> = Vec::new();

    while let Some(frame) = stack.pop() {
        match frame {
            StackFrame::Process(val) => {
                match val {
                    JsonText::Null => result_stack.push(Value::Null),
                    JsonText::Bool(b) => result_stack.push(Value::Bool(*b)),
                    JsonText::Number(text) => {
                        let num = serde_json::from_str::<Number>(text).ok()?;
                        result_stack.push(Value::Number(num));
                    }
                    JsonText::String(s) => {
                        let text = s.as_str()?;
                        result_stack.push(Value::String(text.to_owned()));
                    }
                    JsonText::Array(items) => {
                        // Push a marker to collect results
                        stack.push(StackFrame::CollectArray(items.len(), Vec::new()));
                        // Push items in reverse order
                        for item in items.iter().rev() {
                            stack.push(StackFrame::Process(item));
                        }
                    }
                    JsonText::Object(members) => {
                        // Verify all member names are valid first
                        for (name, _) in members {
                            name.as_str()?;
                        }
                        // Create list of names in reverse order
                        let names: Vec<&JsonString> =
                            members.iter().map(|(n, _)| n).rev().collect();
                        // Push a marker to collect results
                        stack.push(StackFrame::CollectObject(names, Map::new()));
                        // Push members in reverse order
                        for (_, val) in members.iter().rev() {
                            stack.push(StackFrame::Process(val));
                        }
                    }
                }
            }
            StackFrame::CollectArray(count, mut items) => {
                // Pop 'count' results from result_stack and add to items
                for _ in 0..count {
                    if let Some(item) = result_stack.pop() {
                        items.push(item);
                    }
                }
                items.reverse();
                result_stack.push(Value::Array(items));
            }
            StackFrame::CollectObject(mut names, mut obj) => {
                // Pop one result and add it to the object
                if let Some(name) = names.pop() {
                    if let Some(val) = result_stack.pop() {
                        if let Some(name_str) = name.as_str() {
                            obj.insert(name_str.to_owned(), val);
                        }
                    }
                }
                if names.is_empty() {
                    result_stack.push(Value::Object(obj));
                } else {
                    // Continue processing more members
                    stack.push(StackFrame::CollectObject(names, obj));
                }
            }
        }
    }

    result_stack.pop()
}

/// A JSON text member that is not text, or a number `serde_json` does not
/// accept, after the text checks passed.
fn decoded(value: Option<&JsonText>) -> Result<Option<Value>, ValidateError> {
    value
        .map(|value| {
            json_text_to_value(value).ok_or_else(|| {
                ValidateError::Input(FormInputError::new("Numbers must be finite JSON numbers"))
            })
        })
        .transpose()
}

/// The decoded files and base path of a JSON text validation.
type Composition = (Option<Map<String, Value>>, Option<String>);

/// Decode the files and base path of a JSON text validation.
fn composition(
    files: Option<&JsonText>,
    basepath: Option<&JsonText>,
) -> Result<Composition, ValidateError> {
    let files = decoded(files)?.and_then(|files| match files {
        Value::Object(files) => Some(files),
        _ => None,
    });
    let basepath = decoded(basepath)?.and_then(|basepath| basepath.as_str().map(str::to_owned));
    Ok((files, basepath))
}

/// [`validate`](crate::validate()) over JSON text. The specification, the files,
/// the data and the base path are checked for invalid text in that order; each
/// argument is then decoded and validated. Absent data validates an empty
/// object.
pub fn validate_text(
    spec: &JsonText,
    data: Option<&JsonText>,
    files: Option<&JsonText>,
    basepath: Option<&JsonText>,
) -> Result<ValidationResult, ValidateError> {
    check_specification(Some(spec), files)?;
    check_inputs(&[("data", data), ("options.basepath", basepath)])?;
    let (files, basepath) = composition(files, basepath)?;
    let spec = decoded(Some(spec))?.unwrap_or(Value::Null);
    let data = decoded(data)?.unwrap_or_else(|| Value::Object(Map::new()));
    crate::validate(
        &spec,
        &data,
        &ValidateOptions {
            files,
            loader: None,
            basepath,
        },
    )
}

/// [`validate_list`](crate::validate_list()) over JSON text, with the checks of
/// [`validate_text`] for the specification, the files and the base path.
pub fn validate_list_text(
    spec: &JsonText,
    files: Option<&JsonText>,
    basepath: Option<&JsonText>,
) -> Result<(), ValidateError> {
    check_specification(Some(spec), files)?;
    check_inputs(&[("options.basepath", basepath)])?;
    let (files, basepath) = composition(files, basepath)?;
    let spec = decoded(Some(spec))?.unwrap_or(Value::Null);
    Ok(crate::validate_list(
        &spec,
        &ValidateListOptions {
            files,
            loader: None,
            basepath,
        },
    )?)
}

/// [`validate_detail`](crate::validate_detail()) over JSON text, with the checks
/// of [`validate_text`] for the specification, the files and the base path.
pub fn validate_detail_text(
    spec: &JsonText,
    files: Option<&JsonText>,
    basepath: Option<&JsonText>,
) -> Result<(), ValidateError> {
    check_specification(Some(spec), files)?;
    check_inputs(&[("options.basepath", basepath)])?;
    let (files, basepath) = composition(files, basepath)?;
    let spec = decoded(Some(spec))?.unwrap_or(Value::Null);
    Ok(crate::validate_detail(
        &spec,
        &ValidateDetailOptions {
            files,
            loader: None,
            basepath,
        },
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    /// An object of `count` distinct members.
    fn object(count: usize) -> String {
        let members: Vec<String> = (0..count).map(|i| format!("\"m{i}\":{i}")).collect();
        format!("{{{}}}", members.join(","))
    }

    /// The shortest of three reads of `text`.
    fn read_time(text: &str) -> Duration {
        (0..3)
            .map(|_| {
                let started = Instant::now();
                JsonText::parse(text).unwrap();
                started.elapsed()
            })
            .min()
            .unwrap()
    }

    #[test]
    fn repeated_member_keeps_first_position_and_last_value() {
        let text = JsonText::parse(r#"{"a":1,"b":2,"a":3}"#).unwrap();
        let JsonText::Object(members) = &text else {
            panic!("object expected");
        };
        let names: Vec<_> = members.iter().map(|(name, _)| name.as_str()).collect();
        assert_eq!(names, [Some("a"), Some("b")]);
        assert_eq!(text.get("a"), Some(&JsonText::Number("3".to_owned())));
    }

    #[test]
    fn reading_members_takes_time_linear_in_their_count() {
        // Four times the members takes about four times as long when each
        // member is found in constant time, and sixteen times as long when each
        // is compared with every earlier one.
        let small = read_time(&object(5_000));
        let large = read_time(&object(20_000));
        assert!(
            large < small * 8,
            "5000 members: {small:?}, 20000 members: {large:?}"
        );
    }
}
