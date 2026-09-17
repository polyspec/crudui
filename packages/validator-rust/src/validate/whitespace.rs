//! Whitespace, trimming and emptiness (validation rules, "Values").
//!
//! Whitespace is exactly the `White_Space` code points of the embedded Unicode
//! data; the unit tests pin that table to the specification's enumerated set over
//! every code point.

use serde_json::Value;

use super::unicode::{contains, WHITE_SPACE};

/// Whether `c` has the Unicode `White_Space` property.
pub(crate) fn is_whitespace(c: char) -> bool {
    contains(WHITE_SPACE, u32::from(c))
}

/// Remove leading and trailing whitespace and nothing else.
pub(crate) fn trim(text: &str) -> &str {
    text.trim_matches(is_whitespace)
}

/// A missing value (passed as `null`), `null`, a string that is empty after
/// trimming, an empty array or an empty object. `0` and `false` are supplied.
pub(crate) fn is_empty(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::String(text) => trim(text).is_empty(),
        Value::Array(items) => items.is_empty(),
        Value::Object(members) => members.is_empty(),
        Value::Bool(_) | Value::Number(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// The code points the specification enumerates.
    fn specified(c: u32) -> bool {
        matches!(
            c,
            0x09..=0x0D
                | 0x20
                | 0x85
                | 0xA0
                | 0x1680
                | 0x2000..=0x200A
                | 0x2028
                | 0x2029
                | 0x202F
                | 0x205F
                | 0x3000
        )
    }

    #[test]
    fn whitespace_is_exactly_the_specified_set() {
        for code in 0..=0x10FFFFu32 {
            if let Some(c) = char::from_u32(code) {
                assert_eq!(is_whitespace(c), specified(code), "U+{code:04X}");
                // Rust's own White_Space data agrees on this set.
                assert_eq!(c.is_whitespace(), specified(code), "U+{code:04X}");
            }
        }
    }

    #[test]
    fn trimming_removes_only_whitespace() {
        assert_eq!(trim("\u{3000}\t a b \u{2028}\u{85}"), "a b");
        assert_eq!(trim("\u{0}x\u{FEFF}"), "\u{0}x\u{FEFF}");
        assert_eq!(trim(" \u{200B} "), "\u{200B}");
        assert_eq!(trim("\u{180E}"), "\u{180E}");
    }

    #[test]
    fn empty_values() {
        for value in [
            json!(null),
            json!(""),
            json!(" \u{A0}\u{3000}"),
            json!([]),
            json!({}),
        ] {
            assert!(is_empty(&value), "{value}");
        }
        for value in [
            json!(0),
            json!(false),
            json!("\u{0}"),
            json!("\u{FEFF}"),
            json!([null]),
            json!({ "a": null }),
        ] {
            assert!(!is_empty(&value), "{value}");
        }
    }
}
