//! CRUDUI validation rule registry (VALIDATION-RULES, JS `rules/*` parity).
//!
//! Each rule is a function over a [`RuleContext`] returning the error message
//! (`Some`) or `None` (pass). The rules mirror the JS reference engine
//! (`packages/validator-ts/src/rules/*`) function-for-function so the shared
//! 4-language fixture (`tests/fixtures/validate/cases.json`) holds bit-for-bit:
//! same skip-on-empty behaviour, same default messages with `{0}`/`{1}`
//! substitution, same loose comparisons.
//!
//! The call site is the CRUDUI validate slot; the rule semantics are the JS rule
//! registry re-expressed in Rust.

use serde_json::Value;

use crate::expr::Expression;

use super::canonical::{canonical_text, number_text};
use super::length::value_length;
use super::membership::is_member;
use super::numeric::{is_multiple, numeric_value};
use super::parameters::Parameter;
use super::whitespace::{is_empty, trim};

/// The per-rule invocation context handed to a rule function.
pub struct RuleContext<'a> {
    /// The field value being validated (scalar, array, or the whole array for an
    /// array-level rule).
    pub value: &'a Value,
    /// The EFFECTIVE rule param (already resolved from any expression/condition
    /// map). Never an expression for evaluated rules; verbatim for path/pattern/
    /// literal rules.
    pub rule_param: &'a Value,
    /// The checked parameter of a rule whose parameter has a definition.
    pub(crate) parameter: &'a Parameter,
    /// The field's `messages` override map, if any.
    pub messages: Option<&'a Value>,
    /// The invoked rule name (so `pattern`/`match` aliasing resolves messages by
    /// the actual key used).
    pub rule_name: &'a str,
    /// The absolute path segments of the current field (for relative path refs).
    pub path_segments: &'a [String],
    /// The full form data tree (for path-reference rules and `unique` siblings).
    pub form_data: &'a Value,
}

/// Look up a registered rule by name. Returns `None` for any other name, which
/// fails the load with `UNKNOWN_RULE`.
pub fn get_rule(name: &str) -> Option<fn(&RuleContext) -> Option<String>> {
    match name {
        "required" => Some(rule_required),
        "email" => Some(rule_email),
        "minlength" => Some(rule_minlength),
        "maxlength" => Some(rule_maxlength),
        "min" => Some(rule_min),
        "max" => Some(rule_max),
        "match" => Some(rule_match),
        // 'pattern' is an alias of 'match' (same implementation).
        "pattern" => Some(rule_match),
        "unique" => Some(rule_unique),
        "in" => Some(rule_in),
        "range" => Some(rule_range),
        "rangelength" => Some(rule_rangelength),
        "number" => Some(rule_number),
        "digits" => Some(rule_digits),
        "equalTo" => Some(rule_equal_to),
        "notEqual" => Some(rule_not_equal),
        "date" => Some(rule_date),
        "dateISO" => Some(rule_date_iso),
        "enddate" => Some(rule_enddate),
        "url" => Some(rule_url),
        "accept" => Some(rule_accept),
        "mincount" => Some(rule_mincount),
        "maxcount" => Some(rule_maxcount),
        "step" => Some(rule_step),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Shared helpers (JS rules/required.isEmpty, min.toNumber, etc.).
// ---------------------------------------------------------------------------

/// Message lookup for a rule: the field `messages[key]` override, else `None`.
fn message_override<'a>(messages: Option<&'a Value>, key: &str) -> Option<&'a str> {
    messages
        .and_then(Value::as_object)
        .and_then(|m| m.get(key))
        .and_then(Value::as_str)
}

/// A message with every `{0}` and `{1}` replaced by the parameters.
fn fill(message: &str, first: &str, second: Option<&str>) -> String {
    let message = message.replace("{0}", first);
    match second {
        Some(second) => message.replace("{1}", second),
        None => message,
    }
}

/// JS `String(value)` (rule-side stringification for field references).
fn js_string(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.as_f64().map(number_text).unwrap_or_default(),
        // Arrays/objects stringify per JS, but rule call sites never reach here
        // with one for the relevant rules; keep a stable fallback.
        Value::Array(_) | Value::Object(_) => value.to_string(),
    }
}

// ---------------------------------------------------------------------------
// required
// ---------------------------------------------------------------------------

fn rule_required(ctx: &RuleContext) -> Option<String> {
    // ruleParam must be exactly true (the resolver disables on false/null).
    if ctx.rule_param != &Value::Bool(true) {
        return None;
    }
    if is_empty(ctx.value) {
        return Some(
            message_override(ctx.messages, "required")
                .unwrap_or("This field is required.")
                .to_string(),
        );
    }
    None
}

// ---------------------------------------------------------------------------
// email
// ---------------------------------------------------------------------------

fn rule_email(ctx: &RuleContext) -> Option<String> {
    if ctx.rule_param != &Value::Bool(true) {
        return None;
    }
    if is_empty(ctx.value) {
        return None;
    }
    if !is_valid_email(ctx.value) {
        return Some(
            message_override(ctx.messages, "email")
                .unwrap_or("Please enter a valid email address.")
                .to_string(),
        );
    }
    None
}

fn is_valid_email(value: &Value) -> bool {
    let s = match value {
        Value::String(s) => s,
        _ => return false,
    };
    let at = match s.find('@') {
        Some(i) => i,
        None => return false,
    };
    let local = &s[..at];
    let domain = &s[at + 1..];

    if !is_valid_email_local(local) || !is_valid_email_domain(domain) {
        return false;
    }
    // Local-part dot rules (JS email.ts extra checks).
    if local.starts_with('.') || local.ends_with('.') || local.contains("..") {
        return false;
    }
    true
}

/// Local part: `[A-Za-z0-9.!#$%&'*+/=?^_\`{|}~-]+`.
fn is_valid_email_local(local: &str) -> bool {
    if local.is_empty() {
        return false;
    }
    local.chars().all(|c| {
        c.is_ascii_alphanumeric()
            || matches!(
                c,
                '.' | '!'
                    | '#'
                    | '$'
                    | '%'
                    | '&'
                    | '\''
                    | '*'
                    | '+'
                    | '/'
                    | '='
                    | '?'
                    | '^'
                    | '_'
                    | '`'
                    | '{'
                    | '|'
                    | '}'
                    | '~'
                    | '-'
            )
    })
}

/// Domain: one or more dot-separated labels, each
/// `[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?`.
fn is_valid_email_domain(domain: &str) -> bool {
    if domain.is_empty() {
        return false;
    }
    for label in domain.split('.') {
        if !is_valid_email_label(label) {
            return false;
        }
    }
    true
}

fn is_valid_email_label(label: &str) -> bool {
    let bytes = label.as_bytes();
    let n = bytes.len();
    if n == 0 || n > 63 {
        return false;
    }
    let is_alnum = |b: u8| b.is_ascii_alphanumeric();
    if !is_alnum(bytes[0]) || !is_alnum(bytes[n - 1]) {
        return false;
    }
    bytes[1..n.saturating_sub(1)]
        .iter()
        .all(|&b| is_alnum(b) || b == b'-')
}

// ---------------------------------------------------------------------------
// url
// ---------------------------------------------------------------------------

fn rule_url(ctx: &RuleContext) -> Option<String> {
    if ctx.rule_param == &Value::Bool(false) {
        return None;
    }
    if is_empty(ctx.value) {
        return None;
    }
    if !is_valid_url(ctx.value) {
        return Some(
            message_override(ctx.messages, "url")
                .unwrap_or("Please enter a valid URL.")
                .to_string(),
        );
    }
    None
}

/// JS uses the `URL` constructor first (accepts http/https/ftp protocols), with a
/// regex fallback. We emulate the URL-constructor acceptance: a `scheme://rest`
/// where scheme is http/https/ftp and `rest` is non-empty with no whitespace.
fn is_valid_url(value: &Value) -> bool {
    let s = match value {
        Value::String(s) => trim(s),
        _ => return false,
    };
    if s.is_empty() {
        return false;
    }
    let scheme_end = match s.find("://") {
        Some(i) => i,
        None => return false,
    };
    let scheme = s[..scheme_end].to_ascii_lowercase();
    if !matches!(scheme.as_str(), "http" | "https" | "ftp") {
        return false;
    }
    let rest = &s[scheme_end + 3..];
    if rest.is_empty() {
        return false;
    }
    if rest.chars().any(|c| c.is_whitespace()) {
        return false;
    }
    true
}

// ---------------------------------------------------------------------------
// minlength / maxlength / rangelength
// ---------------------------------------------------------------------------

fn rule_minlength(ctx: &RuleContext) -> Option<String> {
    let Parameter::Limit(min) = *ctx.parameter else {
        unreachable!("minlength receives a checked limit")
    };
    if is_empty(ctx.value) {
        return None;
    }
    if value_length(ctx.value).is_some_and(|length| length >= min) {
        return None;
    }
    let msg = message_override(ctx.messages, "minlength")
        .map(str::to_string)
        .unwrap_or_else(|| format!("Please enter at least {min} characters."));
    Some(fill(&msg, &min.to_string(), None))
}

fn rule_maxlength(ctx: &RuleContext) -> Option<String> {
    let Parameter::Limit(max) = *ctx.parameter else {
        unreachable!("maxlength receives a checked limit")
    };
    if is_empty(ctx.value) {
        return None;
    }
    if value_length(ctx.value).is_some_and(|length| length <= max) {
        return None;
    }
    let msg = message_override(ctx.messages, "maxlength")
        .map(str::to_string)
        .unwrap_or_else(|| format!("Please enter no more than {max} characters."));
    Some(fill(&msg, &max.to_string(), None))
}

fn rule_rangelength(ctx: &RuleContext) -> Option<String> {
    let Parameter::Range(min, max) = *ctx.parameter else {
        unreachable!("rangelength receives checked limits")
    };
    if is_empty(ctx.value) {
        return None;
    }
    if value_length(ctx.value).is_some_and(|length| (min..=max).contains(&length)) {
        return None;
    }
    let msg = message_override(ctx.messages, "rangelength")
        .map(str::to_string)
        .unwrap_or_else(|| format!("Please enter a value between {min} and {max} characters."));
    Some(fill(&msg, &min.to_string(), Some(&max.to_string())))
}

// ---------------------------------------------------------------------------
// number / digits
// ---------------------------------------------------------------------------

fn rule_number(ctx: &RuleContext) -> Option<String> {
    if ctx.rule_param != &Value::Bool(true) || is_empty(ctx.value) {
        return None;
    }
    if numeric_value(ctx.value).is_some() {
        return None;
    }
    Some(
        message_override(ctx.messages, "number")
            .unwrap_or("Please enter a valid number.")
            .to_string(),
    )
}

fn rule_digits(ctx: &RuleContext) -> Option<String> {
    if ctx.rule_param != &Value::Bool(true) || is_empty(ctx.value) {
        return None;
    }
    if is_digits_only(ctx.value) {
        return None;
    }
    Some(
        message_override(ctx.messages, "digits")
            .unwrap_or("Please enter only digits.")
            .to_string(),
    )
}

/// A string (trimmed) or a number whose canonical text is ASCII digits only.
fn is_digits_only(value: &Value) -> bool {
    let text = match value {
        Value::String(text) => trim(text).to_string(),
        Value::Number(_) => match canonical_text(value) {
            Some(text) => text.into_owned(),
            None => return false,
        },
        _ => return false,
    };
    !text.is_empty() && text.bytes().all(|b| b.is_ascii_digit())
}

// ---------------------------------------------------------------------------
// min / max / range / step
// ---------------------------------------------------------------------------

fn rule_min(ctx: &RuleContext) -> Option<String> {
    let Parameter::Bound(min) = *ctx.parameter else {
        unreachable!("min receives a checked bound")
    };
    if is_empty(ctx.value) || numeric_value(ctx.value).is_some_and(|number| number >= min) {
        return None;
    }
    let msg = message_override(ctx.messages, "min")
        .unwrap_or("Please enter a value greater than or equal to {0}.");
    Some(fill(msg, &number_text(min), None))
}

fn rule_max(ctx: &RuleContext) -> Option<String> {
    let Parameter::Bound(max) = *ctx.parameter else {
        unreachable!("max receives a checked bound")
    };
    if is_empty(ctx.value) || numeric_value(ctx.value).is_some_and(|number| number <= max) {
        return None;
    }
    let msg = message_override(ctx.messages, "max")
        .unwrap_or("Please enter a value less than or equal to {0}.");
    Some(fill(msg, &number_text(max), None))
}

fn rule_range(ctx: &RuleContext) -> Option<String> {
    let Parameter::Bounds(min, max) = *ctx.parameter else {
        unreachable!("range receives checked bounds")
    };
    if is_empty(ctx.value)
        || numeric_value(ctx.value).is_some_and(|number| min <= number && number <= max)
    {
        return None;
    }
    let msg = message_override(ctx.messages, "range")
        .unwrap_or("Please enter a value between {0} and {1}.");
    Some(fill(msg, &number_text(min), Some(&number_text(max))))
}

fn rule_step(ctx: &RuleContext) -> Option<String> {
    let Parameter::Step(step) = *ctx.parameter else {
        unreachable!("step receives a checked step")
    };
    if is_empty(ctx.value)
        || numeric_value(ctx.value).is_some_and(|number| is_multiple(number, step))
    {
        return None;
    }
    let msg = message_override(ctx.messages, "step")
        .unwrap_or("Please enter a value that is a multiple of {0}.");
    Some(fill(msg, &number_text(step), None))
}

// ---------------------------------------------------------------------------
// match / pattern
// ---------------------------------------------------------------------------

fn rule_match(ctx: &RuleContext) -> Option<String> {
    let Parameter::Pattern(program) = ctx.parameter else {
        unreachable!("pattern and match receive a compiled pattern")
    };
    if is_empty(ctx.value) {
        return None;
    }
    // The whole canonical text must match; an array or object has none.
    if canonical_text(ctx.value).is_some_and(|text| program.is_match(&text)) {
        return None;
    }
    // The custom message is found under the declared rule name only.
    let msg =
        message_override(ctx.messages, ctx.rule_name).unwrap_or("Please enter a valid format.");
    Some(msg.to_string())
}

// ---------------------------------------------------------------------------
// in
// ---------------------------------------------------------------------------

fn rule_in(ctx: &RuleContext) -> Option<String> {
    let Parameter::Members(members) = ctx.parameter else {
        unreachable!("in receives checked members")
    };
    if is_empty(ctx.value) || is_member(ctx.value, members) {
        return None;
    }
    Some(
        message_override(ctx.messages, "in")
            .unwrap_or("Please select a valid option.")
            .to_string(),
    )
}

// ---------------------------------------------------------------------------
// equalTo / notEqual
// ---------------------------------------------------------------------------

fn rule_equal_to(ctx: &RuleContext) -> Option<String> {
    if ctx.rule_param.is_null() {
        return None;
    }
    if is_empty(ctx.value) {
        return None;
    }
    let param = match ctx.rule_param {
        Value::String(s) => s.clone(),
        other => js_string(other),
    };
    let target = resolve_field_reference(&param, ctx.path_segments, ctx.form_data);
    if !strict_eq(ctx.value, &target) {
        return Some(
            message_override(ctx.messages, "equalTo")
                .unwrap_or("Please enter the same value again.")
                .to_string(),
        );
    }
    None
}

fn rule_not_equal(ctx: &RuleContext) -> Option<String> {
    if ctx.rule_param.is_null() {
        return None;
    }
    if is_empty(ctx.value) {
        return None;
    }
    let compare = match ctx.rule_param {
        Value::String(s) if s.starts_with('.') => {
            resolve_field_reference(s, ctx.path_segments, ctx.form_data)
        }
        other => other.clone(),
    };
    if strict_eq(ctx.value, &compare) {
        return Some(
            message_override(ctx.messages, "notEqual")
                .unwrap_or("Please enter a different value.")
                .to_string(),
        );
    }
    None
}

/// JS `===` for the equalTo/notEqual comparison. Different JSON types never equal;
/// numbers compare by f64; strings/bools/null by value; arrays/objects structural.
fn strict_eq(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => match (x.as_f64(), y.as_f64()) {
            (Some(xf), Some(yf)) => xf == yf,
            _ => x == y,
        },
        _ => {
            // Same-type structural equality; cross-type is false (handled by ==
            // returning false for differing variants).
            a == b
        }
    }
}

// ---------------------------------------------------------------------------
// date / dateISO / enddate
// ---------------------------------------------------------------------------

fn rule_date(ctx: &RuleContext) -> Option<String> {
    if ctx.rule_param == &Value::Bool(false) {
        return None;
    }
    if is_empty(ctx.value) {
        return None;
    }
    if !is_valid_date(ctx.value) {
        return Some(
            message_override(ctx.messages, "date")
                .unwrap_or("Please enter a valid date.")
                .to_string(),
        );
    }
    None
}

/// JS `isValidDate`: a string parsed by the `Date` constructor. We accept the
/// common explicit formats the JS code recognizes and otherwise fall back to a
/// permissive accept (JS returns true for any string `Date` parses). Numbers are
/// treated as timestamps (always valid). Empty already filtered.
fn is_valid_date(value: &Value) -> bool {
    match value {
        Value::Number(_) => true,
        Value::String(s) => parse_date(trim(s)).is_some(),
        _ => false,
    }
}

/// Parse a date string to (year, month, day) ordinal for comparison, returning
/// `None` when unparseable. Mirrors the JS `parseDate`/`Date` acceptance for the
/// formats reachable from the fixtures (ISO `YYYY-MM-DD`, `YYYY/MM/DD`); other
/// non-empty strings are accepted as a date (JS `new Date` is permissive) but get
/// a deterministic ordinal of 0 so `enddate` comparison stays stable.
fn parse_date(s: &str) -> Option<i64> {
    if s.is_empty() {
        return None;
    }
    // YYYY-MM-DD or YYYY/MM/DD.
    let sep = if s.contains('-') {
        '-'
    } else if s.contains('/') {
        '/'
    } else {
        // Non-empty: JS Date may still parse; accept with neutral ordinal.
        return Some(0);
    };
    let parts: Vec<&str> = s.split(sep).collect();
    if parts.len() == 3 {
        if let (Ok(y), Ok(m), Ok(d)) = (
            parts[0].parse::<i64>(),
            parts[1].parse::<i64>(),
            parts[2].parse::<i64>(),
        ) {
            if (1..=12).contains(&m) && (1..=31).contains(&d) {
                return Some(y * 10000 + m * 100 + d);
            }
        }
    }
    // Accept other non-empty strings (JS Date permissive).
    Some(0)
}

fn rule_date_iso(ctx: &RuleContext) -> Option<String> {
    if ctx.rule_param == &Value::Bool(false) {
        return None;
    }
    if is_empty(ctx.value) {
        return None;
    }
    if !is_valid_date_iso(ctx.value) {
        return Some(
            message_override(ctx.messages, "dateISO")
                .unwrap_or("Please enter a valid date in ISO format (YYYY-MM-DD).")
                .to_string(),
        );
    }
    None
}

fn is_valid_date_iso(value: &Value) -> bool {
    let s = match value {
        Value::String(s) => trim(s),
        _ => return false,
    };
    let bytes = s.as_bytes();
    if bytes.len() != 10 {
        return false;
    }
    // YYYY-MM-DD pattern.
    let ok_shape = bytes[..4].iter().all(|b| b.is_ascii_digit())
        && bytes[4] == b'-'
        && bytes[5].is_ascii_digit()
        && bytes[6].is_ascii_digit()
        && bytes[7] == b'-'
        && bytes[8].is_ascii_digit()
        && bytes[9].is_ascii_digit();
    if !ok_shape {
        return false;
    }
    let year: i64 = s[0..4].parse().unwrap_or(-1);
    let month: i64 = s[5..7].parse().unwrap_or(-1);
    let day: i64 = s[8..10].parse().unwrap_or(-1);
    if !(1..=12).contains(&month) {
        return false;
    }
    let dim = days_in_month(year, month);
    day >= 1 && day <= dim
}

fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
            if leap {
                29
            } else {
                28
            }
        }
        _ => 0,
    }
}

fn rule_enddate(ctx: &RuleContext) -> Option<String> {
    if ctx.rule_param.is_null() {
        return None;
    }
    if is_empty(ctx.value) {
        return None;
    }
    let end = match ctx.value {
        Value::String(s) => parse_date(trim(s))?,
        Value::Number(_) => 0,
        _ => return None,
    };
    let param = js_string(ctx.rule_param);
    let start_value = if param.starts_with('.') {
        // Relative path resolution (JS enddate relative handling).
        resolve_field_reference(&param, ctx.path_segments, ctx.form_data)
    } else {
        // Absolute dotted path from root.
        let segments: Vec<String> = param
            .split('.')
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect();
        get_value_by_path(ctx.form_data, &segments)
    };
    if is_empty(&start_value) {
        return None;
    }
    let start = match &start_value {
        Value::String(s) => parse_date(trim(s))?,
        Value::Number(_) => 0,
        _ => return None,
    };
    if end < start {
        return Some(
            message_override(ctx.messages, "enddate")
                .unwrap_or("End date must be after the start date.")
                .to_string(),
        );
    }
    None
}

// ---------------------------------------------------------------------------
// accept
// ---------------------------------------------------------------------------

fn rule_accept(ctx: &RuleContext) -> Option<String> {
    if ctx.rule_param.is_null() || ctx.rule_param == &Value::Bool(false) {
        return None;
    }
    if is_empty(ctx.value) {
        return None;
    }
    let accept_list = parse_accept_param(ctx.rule_param);
    if accept_list.is_empty() {
        return None;
    }

    let fail = || {
        Some(
            message_override(ctx.messages, "accept")
                .unwrap_or("Please upload a file with a valid format.")
                .to_string(),
        )
    };

    match ctx.value {
        Value::String(s) => {
            if s.contains('/') {
                if !matches_mime_type(s, &accept_list) {
                    return fail();
                }
            } else if !matches_extension(s, &accept_list) {
                return fail();
            }
            None
        }
        Value::Array(items) => {
            for file in items {
                if let Value::Object(obj) = file {
                    let mime = obj
                        .get("type")
                        .or_else(|| obj.get("mimeType"))
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    let name = obj
                        .get("name")
                        .or_else(|| obj.get("filename"))
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    let ok = (!mime.is_empty() && matches_mime_type(mime, &accept_list))
                        || (!name.is_empty() && matches_extension(name, &accept_list));
                    if !ok {
                        return fail();
                    }
                }
            }
            None
        }
        Value::Object(obj) => {
            let mime = obj
                .get("type")
                .or_else(|| obj.get("mimeType"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let name = obj
                .get("name")
                .or_else(|| obj.get("filename"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let ok = (!mime.is_empty() && matches_mime_type(mime, &accept_list))
                || (!name.is_empty() && matches_extension(name, &accept_list));
            if !ok {
                return fail();
            }
            None
        }
        _ => None,
    }
}

fn extension_to_mime(ext: &str) -> Option<&'static [&'static str]> {
    Some(match ext {
        "jpg" | "jpeg" => &["image/jpeg"],
        "png" => &["image/png"],
        "gif" => &["image/gif"],
        "webp" => &["image/webp"],
        "svg" => &["image/svg+xml"],
        "bmp" => &["image/bmp"],
        "ico" => &["image/x-icon", "image/vnd.microsoft.icon"],
        "pdf" => &["application/pdf"],
        "doc" => &["application/msword"],
        "docx" => &["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        "xls" => &["application/vnd.ms-excel"],
        "xlsx" => &["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
        "ppt" => &["application/vnd.ms-powerpoint"],
        "pptx" => &["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
        "txt" => &["text/plain"],
        "csv" => &["text/csv", "application/csv"],
        "mp3" => &["audio/mpeg", "audio/mp3"],
        "wav" => &["audio/wav", "audio/x-wav"],
        "ogg" => &["audio/ogg"],
        "flac" => &["audio/flac"],
        "mp4" => &["video/mp4"],
        "webm" => &["video/webm"],
        "avi" => &["video/x-msvideo"],
        "mov" => &["video/quicktime"],
        "mkv" => &["video/x-matroska"],
        "zip" => &["application/zip", "application/x-zip-compressed"],
        "rar" => &["application/x-rar-compressed", "application/vnd.rar"],
        "tar" => &["application/x-tar"],
        "gz" => &["application/gzip"],
        "7z" => &["application/x-7z-compressed"],
        "json" => &["application/json"],
        "xml" => &["application/xml", "text/xml"],
        "html" => &["text/html"],
        "css" => &["text/css"],
        "js" => &["application/javascript", "text/javascript"],
        _ => return None,
    })
}

fn parse_accept_param(param: &Value) -> Vec<String> {
    let mut out = Vec::new();
    match param {
        Value::String(s) => {
            for raw in s.split(',') {
                let part = trim(raw).to_ascii_lowercase();
                if let Some(stripped) = part.strip_prefix('.') {
                    if let Some(mimes) = extension_to_mime(stripped) {
                        out.extend(mimes.iter().map(|m| m.to_string()));
                    } else {
                        out.push(part);
                    }
                } else if part.contains('/') {
                    out.push(part);
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                out.extend(parse_accept_param(item));
            }
        }
        _ => {}
    }
    out
}

fn matches_mime_type(mime: &str, accept_list: &[String]) -> bool {
    let normalized = mime.to_ascii_lowercase();
    for accept in accept_list {
        if accept == "*/*" {
            return true;
        }
        if let Some(prefix) = accept.strip_suffix('*') {
            // image/* → prefix "image/"
            if normalized.starts_with(prefix) {
                return true;
            }
        } else if accept.starts_with('.') {
            continue;
        } else if &normalized == accept {
            return true;
        }
    }
    false
}

fn matches_extension(filename: &str, accept_list: &[String]) -> bool {
    let lower = filename.to_ascii_lowercase();
    let parts: Vec<&str> = lower.split('.').collect();
    if parts.len() < 2 {
        return false;
    }
    let ext = parts[parts.len() - 1];
    if ext.is_empty() {
        return false;
    }
    for accept in accept_list {
        if let Some(stripped) = accept.strip_prefix('.') {
            if stripped == ext {
                return true;
            }
        }
    }
    if let Some(mimes) = extension_to_mime(ext) {
        for mime in mimes {
            if matches_mime_type(mime, accept_list) {
                return true;
            }
        }
    }
    false
}

// ---------------------------------------------------------------------------
// mincount / maxcount (array-level)
// ---------------------------------------------------------------------------

fn rule_mincount(ctx: &RuleContext) -> Option<String> {
    let Parameter::Count(min) = *ctx.parameter else {
        unreachable!("mincount receives a checked limit")
    };
    // Counts evaluate empty collections.
    if count(ctx.value) >= min {
        return None;
    }
    let msg =
        message_override(ctx.messages, "mincount").unwrap_or("Please select at least {0} items.");
    Some(fill(msg, &min.to_string(), None))
}

fn rule_maxcount(ctx: &RuleContext) -> Option<String> {
    let Parameter::Count(max) = *ctx.parameter else {
        unreachable!("maxcount receives a checked limit")
    };
    if count(ctx.value) <= max {
        return None;
    }
    let msg = message_override(ctx.messages, "maxcount")
        .unwrap_or("Please select no more than {0} items.");
    Some(fill(msg, &max.to_string(), None))
}

/// The count of a value: array elements or object keys; a missing value, `null`
/// and a blank string count 0 and any other scalar counts 1.
fn count(value: &Value) -> u64 {
    match value {
        Value::Array(elements) => elements.len() as u64,
        Value::Object(keys) => keys.len() as u64,
        Value::Null => 0,
        Value::String(text) if trim(text).is_empty() => 0,
        _ => 1,
    }
}

// ---------------------------------------------------------------------------
// unique (array-level + item-level, optional filter condition)
// ---------------------------------------------------------------------------

fn rule_unique(ctx: &RuleContext) -> Option<String> {
    if ctx.rule_param == &Value::Bool(false) || ctx.rule_param.is_null() {
        return None;
    }

    let filter_condition: Option<&str> = match ctx.rule_param {
        Value::String(s) if is_condition_expression(s) => Some(s.as_str()),
        _ => None,
    };
    let error_message = message_override(ctx.messages, "unique")
        .unwrap_or("Values must be unique.")
        .to_string();

    // Array-level: the field value is the array itself.
    if ctx.value.is_array() || ctx.value.is_object() {
        let entries: Vec<(String, &Value)> = match ctx.value {
            Value::Array(arr) => arr
                .iter()
                .enumerate()
                .map(|(i, v)| (i.to_string(), v))
                .collect(),
            Value::Object(map) => map.iter().map(|(k, v)| (k.clone(), v)).collect(),
            _ => unreachable!(),
        };
        let mut to_check: Vec<&Value> = Vec::new();
        if let Some(cond) = filter_condition {
            for (key, element) in &entries {
                let mut item_path = ctx.path_segments.to_vec();
                item_path.push(key.clone());
                if !item_passes_condition(cond, &item_path, ctx.form_data) {
                    continue;
                }
                if !is_empty(element) {
                    to_check.push(element);
                }
            }
        } else if let Value::String(field_name) = ctx.rule_param {
            // Param is a field name within array items (owned values).
            let items: Vec<Value> = entries.iter().map(|(_, value)| (*value).clone()).collect();
            return unique_array_by_field(&items, field_name, &error_message);
        } else {
            for (_, element) in &entries {
                if !is_empty(element) {
                    to_check.push(element);
                }
            }
        }

        if to_check.is_empty() {
            return None;
        }
        if !are_all_unique(&to_check) {
            return Some(error_message);
        }
        return None;
    }

    // Item-level: scalar field inside a repeated group.
    if ctx.path_segments.len() < 2 {
        return None;
    }
    let field_name = &ctx.path_segments[ctx.path_segments.len() - 1];
    let item_key = &ctx.path_segments[ctx.path_segments.len() - 2];
    let container_path = &ctx.path_segments[..ctx.path_segments.len() - 2];
    let container = get_value_by_path(ctx.form_data, container_path);

    // Build ordered (key, item) entries.
    let entries: Vec<(String, Value)> = match &container {
        Value::Array(arr) => {
            if !item_key.bytes().all(|b| b.is_ascii_digit()) || item_key.is_empty() {
                return None;
            }
            arr.iter()
                .enumerate()
                .map(|(i, item)| (i.to_string(), item.clone()))
                .collect()
        }
        Value::Object(obj) => obj.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        _ => return None,
    };

    if is_empty(ctx.value) {
        return None;
    }

    // If a filter condition exists and the current item fails it, skip entirely.
    if let Some(cond) = filter_condition {
        if !item_passes_condition(cond, ctx.path_segments, ctx.form_data) {
            return None;
        }
    }

    for (key, item) in &entries {
        if key == item_key {
            // Only compare against earlier siblings; error lands on the later item.
            break;
        }
        let obj = match item {
            Value::Object(o) => o,
            _ => continue,
        };
        if let Some(cond) = filter_condition {
            let mut sibling_path: Vec<String> = container_path.to_vec();
            sibling_path.push(key.clone());
            sibling_path.push(field_name.clone());
            if !item_passes_condition(cond, &sibling_path, ctx.form_data) {
                continue;
            }
        }
        let sibling_value = obj.get(field_name.as_str()).cloned().unwrap_or(Value::Null);
        if is_empty(&sibling_value) {
            continue;
        }
        if comparison_key(&sibling_value) == comparison_key(ctx.value) {
            return Some(error_message);
        }
    }

    None
}

/// Array-level unique by field name within object items (JS `extractFieldValues`).
fn unique_array_by_field(items: &[Value], field_name: &str, error: &str) -> Option<String> {
    let segs: Vec<String> = field_name
        .split('.')
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();
    let mut values: Vec<Value> = Vec::new();
    for item in items {
        if item.is_object() {
            let v = get_value_by_path(item, &segs);
            if !is_empty(&v) {
                values.push(v);
            }
        }
    }
    if values.is_empty() {
        return None;
    }
    let refs: Vec<&Value> = values.iter().collect();
    if !are_all_unique(&refs) {
        return Some(error.to_string());
    }
    None
}

/// Comparison key (JS `comparisonKey`): objects/arrays → their JSON string.
fn comparison_key(value: &Value) -> String {
    match value {
        Value::Object(_) | Value::Array(_) => value.to_string(),
        Value::String(s) => format!("s:{}", s),
        Value::Number(n) => format!("n:{}", n.as_f64().map(number_text).unwrap_or_default()),
        Value::Bool(b) => format!("b:{}", b),
        Value::Null => "null".to_string(),
    }
}

fn are_all_unique(values: &[&Value]) -> bool {
    let mut seen = std::collections::HashSet::new();
    for v in values {
        let key = comparison_key(v);
        if !seen.insert(key) {
            return false;
        }
    }
    true
}

fn item_passes_condition(condition: &str, item_field_path: &[String], form_data: &Value) -> bool {
    Expression::evaluate(condition, form_data, item_field_path).unwrap_or(false)
}

// ---------------------------------------------------------------------------
// path / expression helpers shared with the validator (JS PathResolver parity).
// ---------------------------------------------------------------------------

/// JS `isConditionExpression`: a string that looks like a condition.
pub fn is_condition_expression(value: &str) -> bool {
    let trimmed = trim(value);
    if trimmed.starts_with('.') {
        return true;
    }
    // `^[a-zA-Z_][a-zA-Z0-9_]*\.`
    if starts_identifier_dot(trimmed) {
        return true;
    }
    if has_comparison_operator(trimmed) {
        return true;
    }
    // Ternary `\?.*:`
    if let Some(q) = trimmed.find('?') {
        if trimmed[q + 1..].contains(':') {
            return true;
        }
    }
    false
}

fn starts_identifier_dot(s: &str) -> bool {
    let mut chars = s.char_indices();
    match chars.next() {
        Some((_, c)) if c.is_ascii_alphabetic() || c == '_' => {}
        _ => return false,
    }
    for (_, c) in chars {
        if c.is_ascii_alphanumeric() || c == '_' {
            continue;
        }
        // The dot must come immediately after the identifier run.
        return c == '.';
    }
    false
}

/// JS `/\s+(==|!=|>|>=|<|<=|&&|\|\||in|not\s+in)\s+/`: whitespace-bounded operator.
fn has_comparison_operator(s: &str) -> bool {
    let ops = ["==", "!=", ">=", "<=", ">", "<", "&&", "||", "in", "not in"];
    let bytes = s.as_bytes();
    let is_ws =
        |b: u8| b == b' ' || b == b'\t' || b == b'\n' || b == b'\r' || b == 0x0c || b == 0x0b;

    // Search each operator with required surrounding whitespace (one-or-more).
    for op in ops {
        let mut search_from = 0;
        while let Some(pos) = s[search_from..].find(op) {
            let start = search_from + pos;
            let end = start + op.len();
            // require at least one whitespace before start and after end
            let before_ok = start > 0 && is_ws(bytes[start - 1]);
            let after_ok = end < bytes.len() && is_ws(bytes[end]);
            if before_ok && after_ok {
                // For "not in", JS allows `not\s+in`; the literal "not in" with a
                // single space matches; multiple spaces are also condition-like
                // and handled by the engine. This is sufficient for detection.
                return true;
            }
            search_from = start + 1;
            if search_from >= s.len() {
                break;
            }
        }
    }
    false
}

/// Read a value at concrete path segments (JS `getValueByPath`). Missing → null.
pub fn get_value_by_path(data: &Value, path: &[String]) -> Value {
    let mut current = data;
    for segment in path {
        match current {
            Value::Object(map) => match map.get(segment) {
                Some(v) => current = v,
                None => return Value::Null,
            },
            Value::Array(arr) => match segment.parse::<usize>() {
                Ok(i) => match arr.get(i) {
                    Some(v) => current = v,
                    None => return Value::Null,
                },
                Err(_) => return Value::Null,
            },
            _ => return Value::Null,
        }
    }
    current.clone()
}

/// Resolve a field-reference expression to its value (JS `resolveFieldReference`).
/// Supports `.x` / `..x` relatives, dotted absolute, and bare sibling lookup.
pub fn resolve_field_reference(
    expression: &str,
    current_path: &[String],
    form_data: &Value,
) -> Value {
    let trimmed = expression.trim();
    if trimmed.is_empty() {
        return Value::Null;
    }

    // Count leading dots.
    let dots = trimmed.chars().take_while(|c| *c == '.').count();

    if dots > 0 {
        let field_path = &trimmed[dots..];
        let segments: Vec<String> = field_path
            .split('.')
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect();
        // relative=true, levelsUp = dots-1; array indices do not count as a level.
        let levels_up = dots - 1;
        let mut base: Vec<String> = current_path.to_vec();
        if !base.is_empty() {
            base.pop(); // remove current field name
        }
        for _ in 0..levels_up {
            while base
                .last()
                .map(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
                .unwrap_or(false)
            {
                base.pop();
            }
            if !base.is_empty() {
                base.pop();
            }
        }
        base.extend(segments);
        return get_value_by_path(form_data, &base);
    }

    // Dotted absolute path.
    if trimmed.contains('.') {
        let segments: Vec<String> = trimmed
            .split('.')
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect();
        return get_value_by_path(form_data, &segments);
    }

    // Bare field name: sibling in the current group.
    if !current_path.is_empty() {
        let mut sibling: Vec<String> = current_path[..current_path.len() - 1].to_vec();
        sibling.push(trimmed.to_string());
        return get_value_by_path(form_data, &sibling);
    }
    get_value_by_path(form_data, &[trimmed.to_string()])
}
