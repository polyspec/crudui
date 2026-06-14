//! Built-in validation rule registry.
//! Ports validator-go/validator/rules.go. Each rule returns Some(message) on
//! failure or None on success. Default messages match the Go/PHP defaults
//! verbatim.

use crate::value::{
    format_float, get_value_by_path, is_empty, to_float64, to_number, to_string,
};
use regex::Regex;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;

/// ValidationContext carries the current path and full form data into a rule.
pub struct ValidationContext<'a> {
    /// Path segments to the field currently being validated.
    pub current_path: &'a [String],
    /// The full form data object (for cross-field rules).
    pub form_data: &'a Value,
}

/// RuleFn is the signature of a built-in rule.
pub type RuleFn = fn(&Value, &[String], &Value, &ValidationContext) -> Option<String>;

/// default_rules returns the built-in rule registry. "pattern" and "match" are
/// aliases for the same implementation.
pub fn default_rules() -> HashMap<&'static str, RuleFn> {
    let mut m: HashMap<&'static str, RuleFn> = HashMap::new();
    m.insert("required", rule_required);
    m.insert("email", rule_email);
    m.insert("minlength", rule_min_length);
    m.insert("maxlength", rule_max_length);
    m.insert("min", rule_min);
    m.insert("max", rule_max);
    m.insert("match", rule_match);
    m.insert("pattern", rule_match);
    m.insert("unique", rule_unique);
    m.insert("in", rule_in);
    m.insert("range", rule_range);
    m.insert("rangelength", rule_range_length);
    m.insert("number", rule_number);
    m.insert("digits", rule_digits);
    m.insert("equalTo", rule_equal_to);
    m.insert("notEqual", rule_not_equal);
    m.insert("date", rule_date);
    m.insert("dateISO", rule_date_iso);
    m.insert("enddate", rule_end_date);
    m.insert("url", rule_url);
    m.insert("accept", rule_accept);
    m.insert("mincount", rule_min_count);
    m.insert("maxcount", rule_max_count);
    m.insert("step", rule_step);
    m
}

fn re(cell: &'static OnceLock<Regex>, pattern: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(pattern).unwrap())
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

fn rule_required(value: &Value, _p: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) {
        Some("This field is required.".to_string())
    } else {
        None
    }
}

fn rule_email(value: &Value, _p: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) {
        return None;
    }
    let s = to_string(value);
    static EMAIL: OnceLock<Regex> = OnceLock::new();
    let pattern = r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$";
    let matched = re(&EMAIL, pattern).is_match(&s);
    if !matched {
        return Some("Please enter a valid email address.".to_string());
    }

    if let Some(at_index) = s.find('@') {
        if at_index > 0 {
            let local = &s[..at_index];
            if local.starts_with('.') || local.ends_with('.') || local.contains("..") {
                return Some("Please enter a valid email address.".to_string());
            }
        }
    }
    None
}

fn rule_min_length(value: &Value, params: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) || params.is_empty() {
        return None;
    }
    let min_len: i64 = match params[0].parse() {
        Ok(n) => n,
        Err(_) => return None,
    };
    let s = to_string(value);
    let length = s.chars().count() as i64;
    if length < min_len {
        return Some(format!("Please enter at least {} characters.", params[0]));
    }
    None
}

fn rule_max_length(value: &Value, params: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) || params.is_empty() {
        return None;
    }
    let max_len: i64 = match params[0].parse() {
        Ok(n) => n,
        Err(_) => return None,
    };
    let s = to_string(value);
    let length = s.chars().count() as i64;
    if length > max_len {
        return Some(format!("Please enter no more than {} characters.", params[0]));
    }
    None
}

fn rule_min(value: &Value, params: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) || params.is_empty() {
        return None;
    }
    let min_val: f64 = match params[0].parse() {
        Ok(n) => n,
        Err(_) => return None,
    };
    let num = to_number(value)?;
    if num < min_val {
        return Some(format!("Please enter a value greater than or equal to {}.", params[0]));
    }
    None
}

fn rule_max(value: &Value, params: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) || params.is_empty() {
        return None;
    }
    let max_val: f64 = match params[0].parse() {
        Ok(n) => n,
        Err(_) => return None,
    };
    let num = to_number(value)?;
    if num > max_val {
        return Some(format!("Please enter a value less than or equal to {}.", params[0]));
    }
    None
}

/// anchor_pattern forces a full-string match (^...$) without double-anchoring.
fn anchor_pattern(pattern: &str) -> String {
    let mut anchored = pattern.to_string();
    if !anchored.starts_with('^') {
        anchored = format!("^{}", anchored);
    }
    if !anchored.ends_with('$') {
        anchored = format!("{}$", anchored);
    }
    anchored
}

fn rule_match(value: &Value, params: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) || params.is_empty() {
        return None;
    }
    let pattern = anchor_pattern(&params[0]);
    let s = to_string(value);
    match Regex::new(&pattern) {
        Ok(re) => {
            if re.is_match(&s) {
                None
            } else {
                Some("Please enter a valid format.".to_string())
            }
        }
        Err(_) => Some("Please enter a valid format.".to_string()),
    }
}

fn rule_unique(value: &Value, _p: &[String], all_data: &Value, ctx: &ValidationContext) -> Option<String> {
    let msg = "Values must be unique.".to_string();

    // Array mode.
    if let Value::Array(arr) = value {
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for item in arr {
            if is_empty(item) {
                continue;
            }
            let key = unique_comparison_key(item);
            if seen.contains(&key) {
                return Some(msg);
            }
            seen.insert(key);
        }
        return None;
    }

    // Sibling mode: path must be <arrayPath>.<index>.<fieldName>.
    let path = ctx.current_path;
    if path.len() < 2 {
        return None;
    }
    let field_name = &path[path.len() - 1];
    let idx: usize = match path[path.len() - 2].parse() {
        Ok(i) => i,
        Err(_) => return None,
    };

    let array_path = &path[..path.len() - 2];
    let array_path_vec: Vec<String> = array_path.to_vec();
    let parent_array = match crate::value::get_nested_value(all_data, &array_path_vec) {
        Some(Value::Array(a)) => a,
        _ => return None,
    };

    let current_key = unique_comparison_key(value);
    for entry in parent_array.iter().take(idx) {
        let item = match entry {
            Value::Object(o) => o,
            _ => continue,
        };
        let sibling = match item.get(field_name) {
            Some(v) => v,
            None => continue,
        };
        if is_empty(sibling) {
            continue;
        }
        if unique_comparison_key(sibling) == current_key {
            return Some(msg);
        }
    }
    None
}

/// unique_comparison_key builds a type-sensitive key (string "1" != number 1).
fn unique_comparison_key(value: &Value) -> String {
    match value {
        Value::Null => "z:".to_string(),
        Value::String(s) => format!("s:{}", s),
        Value::Bool(b) => format!("b:{}", b),
        Value::Number(n) => {
            let f = n.as_f64().unwrap_or(0.0);
            format!("n:{}", format_float(f))
        }
        other => format!("j:{}", serde_json::to_string(other).unwrap_or_default()),
    }
}

fn rule_in(value: &Value, params: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) || params.is_empty() {
        return None;
    }
    let str_val = to_string(value);
    for allowed in params {
        if &str_val == allowed {
            return None;
        }
    }
    Some("Please select a valid option.".to_string())
}

fn rule_range(value: &Value, params: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) || params.len() < 2 {
        return None;
    }
    let min_val: f64 = match params[0].parse() {
        Ok(n) => n,
        Err(_) => return None,
    };
    let max_val: f64 = match params[1].parse() {
        Ok(n) => n,
        Err(_) => return None,
    };
    let num = match to_float64(value) {
        Some(n) => n,
        None => return Some("Please enter a valid number.".to_string()),
    };
    if num < min_val || num > max_val {
        return Some(format!("Please enter a value between {} and {}.", params[0], params[1]));
    }
    None
}

fn rule_range_length(value: &Value, params: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) || params.len() < 2 {
        return None;
    }
    let min_len: i64 = match params[0].parse() {
        Ok(n) => n,
        Err(_) => return None,
    };
    let max_len: i64 = match params[1].parse() {
        Ok(n) => n,
        Err(_) => return None,
    };
    let s = to_string(value);
    let length = s.chars().count() as i64;
    if length < min_len || length > max_len {
        return Some(format!(
            "Please enter a value between {} and {} characters.",
            params[0], params[1]
        ));
    }
    None
}

fn rule_number(value: &Value, _p: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) {
        return None;
    }
    if to_number(value).is_none() {
        return Some("Please enter a valid number.".to_string());
    }
    None
}

fn rule_digits(value: &Value, _p: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) {
        return None;
    }
    let s = to_string(value);
    static DIGITS: OnceLock<Regex> = OnceLock::new();
    if !re(&DIGITS, r"^\d+$").is_match(&s) {
        return Some("Please enter only digits.".to_string());
    }
    None
}

fn rule_equal_to(value: &Value, params: &[String], all_data: &Value, ctx: &ValidationContext) -> Option<String> {
    if is_empty(value) || params.is_empty() {
        return None;
    }
    let target_path = &params[0];
    let target_value = get_value_by_path(all_data, target_path, ctx.current_path);
    let target_str = target_value.map(to_string).unwrap_or_default();
    if to_string(value) != target_str {
        return Some("Please enter the same value again.".to_string());
    }
    None
}

fn rule_not_equal(value: &Value, params: &[String], all_data: &Value, ctx: &ValidationContext) -> Option<String> {
    if is_empty(value) || params.is_empty() {
        return None;
    }
    let compare_value = &params[0];
    if compare_value.starts_with('.') {
        let target_value = get_value_by_path(all_data, compare_value, ctx.current_path);
        let target_str = target_value.map(to_string).unwrap_or_default();
        if to_string(value) == target_str {
            return Some("Please enter a different value.".to_string());
        }
    } else if &to_string(value) == compare_value {
        return Some("Please enter a different value.".to_string());
    }
    None
}

fn rule_date(value: &Value, _p: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) {
        return None;
    }
    let s = to_string(value);
    if parse_date(&s).is_some() {
        return None;
    }
    Some("Please enter a valid date.".to_string())
}

fn rule_date_iso(value: &Value, _p: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) {
        return None;
    }
    let s = to_string(value);
    static ISO: OnceLock<Regex> = OnceLock::new();
    if !re(&ISO, r"^\d{4}-\d{2}-\d{2}$").is_match(&s) {
        return Some("Please enter a valid date in ISO format (YYYY-MM-DD).".to_string());
    }
    if parse_iso_date(&s).is_none() {
        return Some("Please enter a valid date in ISO format (YYYY-MM-DD).".to_string());
    }
    None
}

fn rule_end_date(value: &Value, params: &[String], all_data: &Value, ctx: &ValidationContext) -> Option<String> {
    if is_empty(value) || params.is_empty() {
        return None;
    }
    // invalid format -> let date rule handle it
    let end_date = parse_date(&to_string(value))?;
    let start_date_path = &params[0];
    let start_value = get_value_by_path(all_data, start_date_path, ctx.current_path);
    let start_value = match start_value {
        Some(v) if !is_empty(v) => v,
        _ => return None,
    };
    let start_date = parse_date(&to_string(start_value))?;
    if end_date < start_date {
        return Some("End date must be after the start date.".to_string());
    }
    None
}

fn rule_url(value: &Value, _p: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) {
        return None;
    }
    let s = to_string(value);
    match parse_url(&s) {
        Some((scheme, host)) => {
            let scheme = scheme.to_lowercase();
            if scheme != "http" && scheme != "https" && scheme != "ftp" {
                return Some("Please enter a valid URL.".to_string());
            }
            if host.is_empty() {
                return Some("Please enter a valid URL.".to_string());
            }
            None
        }
        None => Some("Please enter a valid URL.".to_string()),
    }
}

fn rule_accept(value: &Value, params: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) || params.is_empty() {
        return None;
    }
    let accept_list = parse_accept_list(params);
    let s = to_string(value);
    if s.contains('/') {
        if !matches_mime_type(&s, &accept_list) {
            return Some("Please upload a file with a valid format.".to_string());
        }
    } else if !matches_extension(&s, &accept_list) {
        return Some("Please upload a file with a valid format.".to_string());
    }
    None
}

fn rule_min_count(value: &Value, params: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if params.is_empty() {
        return None;
    }
    let min_count: f64 = match params[0].parse() {
        Ok(n) => n,
        Err(_) => return None,
    };
    if (countable_length(value) as f64) < min_count {
        return Some(format!("Please select at least {} items.", params[0]));
    }
    None
}

fn rule_max_count(value: &Value, params: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) || params.is_empty() {
        return None;
    }
    let max_count: f64 = match params[0].parse() {
        Ok(n) => n,
        Err(_) => return None,
    };
    if (countable_length(value) as f64) > max_count {
        return Some(format!("Please select no more than {} items.", params[0]));
    }
    None
}

fn rule_step(value: &Value, params: &[String], _d: &Value, _c: &ValidationContext) -> Option<String> {
    if is_empty(value) || params.is_empty() {
        return None;
    }
    let step: f64 = match params[0].parse() {
        Ok(n) => n,
        Err(_) => return None,
    };
    if step <= 0.0 {
        return None;
    }
    let num = to_float64(value)?;

    let decimal_places = get_decimal_places(num).max(get_decimal_places(step));
    let multiplier = 10f64.powi(decimal_places as i32);
    let int_value = (num * multiplier).round() as i64;
    let int_step = (step * multiplier).round() as i64;
    if int_step != 0 && int_value % int_step != 0 {
        return Some(format!("Please enter a value that is a multiple of {}.", params[0]));
    }
    None
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn get_decimal_places(num: f64) -> usize {
    let s = format_float(num);
    match s.find('.') {
        Some(idx) => s.len() - idx - 1,
        None => 0,
    }
}

fn countable_length(value: &Value) -> usize {
    match value {
        Value::Array(a) => a.len(),
        // Object-key multiple group: data arrives as an object keyed by unique
        // ids instead of an array. Count its entries so mincount/maxcount see
        // the repeated-group size. PHP counts assoc arrays identically
        // (Rules/MinCount.php count($value)).
        Value::Object(o) => o.len(),
        _ => 0,
    }
}

/// parse_date parses common date formats; returns a comparable (y, m, d, hms)
/// tuple-derived ordering value (days since epoch-ish). For ordering only.
fn parse_date(s: &str) -> Option<i64> {
    // ISO: YYYY-MM-DD
    if let Some(v) = parse_iso_date(s) {
        return Some(v);
    }
    // YYYY/MM/DD
    static YMD_SLASH: OnceLock<Regex> = OnceLock::new();
    if let Some(c) = re(&YMD_SLASH, r"^(\d{4})/(\d{2})/(\d{2})$").captures(s) {
        return ymd_to_ord(&c[1], &c[2], &c[3]);
    }
    // MM/DD/YYYY or DD/MM/YYYY. Go tries 01/02/2006 then 02/01/2006; the first
    // that parses wins. Emulate: try MM/DD/YYYY first, then DD/MM/YYYY.
    static MDY: OnceLock<Regex> = OnceLock::new();
    if let Some(c) = re(&MDY, r"^(\d{2})/(\d{2})/(\d{4})$").captures(s) {
        // try MM/DD/YYYY
        if let Some(v) = ymd_to_ord(&c[3], &c[1], &c[2]) {
            return Some(v);
        }
        // fall back DD/MM/YYYY
        if let Some(v) = ymd_to_ord(&c[3], &c[2], &c[1]) {
            return Some(v);
        }
    }
    // RFC3339 (date portion sufficient for ordering)
    static RFC: OnceLock<Regex> = OnceLock::new();
    if let Some(c) = re(&RFC, r"^(\d{4})-(\d{2})-(\d{2})T").captures(s) {
        return ymd_to_ord(&c[1], &c[2], &c[3]);
    }
    None
}

fn parse_iso_date(s: &str) -> Option<i64> {
    static ISO: OnceLock<Regex> = OnceLock::new();
    let c = re(&ISO, r"^(\d{4})-(\d{2})-(\d{2})$").captures(s)?;
    ymd_to_ord(&c[1], &c[2], &c[3])
}

/// ymd_to_ord validates a Y/M/D and returns a monotonically ordered integer.
/// Returns None if the date components are out of range (Go time.Parse rejects
/// invalid days/months).
fn ymd_to_ord(y: &str, m: &str, d: &str) -> Option<i64> {
    let yi: i64 = y.parse().ok()?;
    let mi: i64 = m.parse().ok()?;
    let di: i64 = d.parse().ok()?;
    if !(1..=12).contains(&mi) {
        return None;
    }
    let days_in_month = days_in_month(yi, mi)?;
    if di < 1 || di > days_in_month {
        return None;
    }
    // Ordinal: a simple monotone value (not a real calendar count, but order-
    // preserving across valid dates).
    Some(yi * 372 + mi * 31 + di)
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0)
}

fn days_in_month(y: i64, m: i64) -> Option<i64> {
    let d = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap(y) {
                29
            } else {
                28
            }
        }
        _ => return None,
    };
    Some(d)
}

/// parse_url extracts (scheme, host) like Go url.Parse for the fields the URL
/// rule inspects. Returns None only on gross malformation (Go url.Parse rarely
/// errors, so we mirror its leniency).
fn parse_url(s: &str) -> Option<(String, String)> {
    // scheme://host... or scheme:opaque
    if let Some(scheme_end) = s.find(':') {
        let scheme = &s[..scheme_end];
        // scheme must be a valid scheme token (alpha first); else Go treats the
        // whole thing as a path with empty scheme.
        if scheme.is_empty()
            || !scheme.chars().next().map(|c| c.is_ascii_alphabetic()).unwrap_or(false)
            || !scheme.chars().all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '-' || c == '.')
        {
            return Some((String::new(), String::new()));
        }
        let rest = &s[scheme_end + 1..];
        if let Some(after) = rest.strip_prefix("//") {
            // authority ends at first '/', '?', or '#'
            let host_end = after.find(['/', '?', '#']).unwrap_or(after.len());
            let authority = &after[..host_end];
            // strip userinfo
            let host = authority.rsplit('@').next().unwrap_or(authority);
            return Some((scheme.to_string(), host.to_string()));
        }
        return Some((scheme.to_string(), String::new()));
    }
    Some((String::new(), String::new()))
}

// --- accept helpers ---

fn extension_to_mime() -> &'static HashMap<&'static str, Vec<&'static str>> {
    static MAP: OnceLock<HashMap<&'static str, Vec<&'static str>>> = OnceLock::new();
    MAP.get_or_init(|| {
        let mut m: HashMap<&'static str, Vec<&'static str>> = HashMap::new();
        m.insert("jpg", vec!["image/jpeg"]);
        m.insert("jpeg", vec!["image/jpeg"]);
        m.insert("png", vec!["image/png"]);
        m.insert("gif", vec!["image/gif"]);
        m.insert("webp", vec!["image/webp"]);
        m.insert("svg", vec!["image/svg+xml"]);
        m.insert("bmp", vec!["image/bmp"]);
        m.insert("ico", vec!["image/x-icon", "image/vnd.microsoft.icon"]);

        m.insert("pdf", vec!["application/pdf"]);
        m.insert("doc", vec!["application/msword"]);
        m.insert(
            "docx",
            vec!["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        );
        m.insert("xls", vec!["application/vnd.ms-excel"]);
        m.insert(
            "xlsx",
            vec!["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
        );
        m.insert("ppt", vec!["application/vnd.ms-powerpoint"]);
        m.insert(
            "pptx",
            vec!["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
        );
        m.insert("txt", vec!["text/plain"]);
        m.insert("csv", vec!["text/csv", "application/csv"]);

        m.insert("mp3", vec!["audio/mpeg", "audio/mp3"]);
        m.insert("wav", vec!["audio/wav", "audio/x-wav"]);
        m.insert("ogg", vec!["audio/ogg"]);
        m.insert("flac", vec!["audio/flac"]);

        m.insert("mp4", vec!["video/mp4"]);
        m.insert("webm", vec!["video/webm"]);
        m.insert("avi", vec!["video/x-msvideo"]);
        m.insert("mov", vec!["video/quicktime"]);
        m.insert("mkv", vec!["video/x-matroska"]);

        m.insert("zip", vec!["application/zip", "application/x-zip-compressed"]);
        m.insert("rar", vec!["application/x-rar-compressed", "application/vnd.rar"]);
        m.insert("tar", vec!["application/x-tar"]);
        m.insert("gz", vec!["application/gzip"]);
        m.insert("7z", vec!["application/x-7z-compressed"]);

        m.insert("json", vec!["application/json"]);
        m.insert("xml", vec!["application/xml", "text/xml"]);
        m.insert("html", vec!["text/html"]);
        m.insert("css", vec!["text/css"]);
        m.insert("js", vec!["application/javascript", "text/javascript"]);
        m
    })
}

fn parse_accept_list(params: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for p in params {
        for part in p.split(',') {
            let part = part.trim().to_lowercase();
            if part.is_empty() {
                continue;
            }
            if let Some(ext) = part.strip_prefix('.') {
                if let Some(mimes) = extension_to_mime().get(ext) {
                    for mime in mimes {
                        out.push(mime.to_string());
                    }
                } else {
                    out.push(part);
                }
            } else if part.contains('/') {
                out.push(part);
            }
        }
    }
    out
}

fn matches_mime_type(mime_type: &str, accept_list: &[String]) -> bool {
    let normalized = mime_type.to_lowercase();
    for accept in accept_list {
        let accept = accept.trim().to_lowercase();
        if accept == "*/*" {
            return true;
        }
        if accept.ends_with("/*") {
            let prefix = &accept[..accept.len() - 1]; // keep trailing slash, drop '*'
            if normalized.starts_with(prefix) {
                return true;
            }
        } else if !accept.starts_with('.') && normalized == accept {
            return true;
        }
    }
    false
}

fn matches_extension(filename: &str, accept_list: &[String]) -> bool {
    let parts: Vec<&str> = filename.split('.').collect();
    if parts.len() < 2 {
        return false;
    }
    let ext = parts[parts.len() - 1].to_lowercase();

    for accept in accept_list {
        let accept = accept.trim().to_lowercase();
        if let Some(stripped) = accept.strip_prefix('.') {
            if stripped == ext {
                return true;
            }
        }
    }

    if let Some(mimes) = extension_to_mime().get(ext.as_str()) {
        for mime in mimes {
            if matches_mime_type(mime, accept_list) {
                return true;
            }
        }
    }
    false
}
