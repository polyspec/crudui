//! Membership (`in`) (validation rules, "Values").

use serde_json::Value;

use super::canonical::canonical_text;
use super::whitespace::{is_empty, trim};

/// Why an `in` parameter is outside the definition.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MembersError {
    /// Not a list, a comma-separated string or a map.
    Shape,
    /// A list element that is not a string, number or boolean.
    MemberType,
    /// No members, or a member whose canonical text is empty after trimming.
    Empty,
}

impl MembersError {
    /// The shared parameter-error message.
    pub(crate) fn message(self) -> &'static str {
        match self {
            MembersError::Shape => {
                "Invalid in parameter: expected a list, a comma-separated string or a map"
            }
            MembersError::MemberType => {
                "Invalid in parameter: members must be strings, numbers or booleans"
            }
            MembersError::Empty => "Invalid in parameter: members must not be empty",
        }
    }
}

/// A comparable scalar: its canonical text and, for a number or a decimal string,
/// its value as a double.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Comparable {
    text: String,
    number: Option<f64>,
}

impl Comparable {
    fn of_text(text: String) -> Self {
        let number = decimal_value(&text);
        Comparable { text, number }
    }

    fn of_scalar(value: &Value) -> Option<Self> {
        let text = canonical_text(value)?.into_owned();
        Some(match value {
            Value::Number(number) => Comparable {
                text,
                number: number.as_f64(),
            },
            Value::String(_) => Comparable::of_text(text),
            _ => Comparable { text, number: None },
        })
    }

    fn matches(&self, member: &Comparable) -> bool {
        self.text == member.text
            || matches!((self.number, member.number), (Some(a), Some(b)) if a == b)
    }
}

/// The members of an `in` parameter that is neither `false` nor `null`.
pub(crate) fn members(parameter: &Value) -> Result<Vec<Comparable>, MembersError> {
    let members: Vec<Comparable> = match parameter {
        Value::Array(elements) => elements
            .iter()
            .map(|element| match element {
                Value::String(_) | Value::Number(_) | Value::Bool(_) => {
                    Comparable::of_scalar(element).ok_or(MembersError::MemberType)
                }
                _ => Err(MembersError::MemberType),
            })
            .map(|member| member.and_then(nonblank))
            .collect::<Result<_, _>>()?,
        Value::String(text) => text
            .split(',')
            .map(|item| nonblank(Comparable::of_text(trim(item).to_string())))
            .collect::<Result<_, _>>()?,
        Value::Object(map) => map
            .keys()
            .map(|key| nonblank(Comparable::of_text(key.clone())))
            .collect::<Result<_, _>>()?,
        _ => return Err(MembersError::Shape),
    };
    if members.is_empty() {
        return Err(MembersError::Empty);
    }
    Ok(members)
}

fn nonblank(member: Comparable) -> Result<Comparable, MembersError> {
    if trim(&member.text).is_empty() {
        Err(MembersError::Empty)
    } else {
        Ok(member)
    }
}

/// Whether a nonempty value is a member: a string is trimmed; an array passes when
/// every element passes, where an empty element passes and a nonempty array or
/// object element fails; an object never matches.
pub(crate) fn is_member(value: &Value, members: &[Comparable]) -> bool {
    match value {
        Value::Array(elements) => elements
            .iter()
            .all(|element| is_empty(element) || scalar_is_member(element, members)),
        _ => scalar_is_member(value, members),
    }
}

fn scalar_is_member(value: &Value, members: &[Comparable]) -> bool {
    let comparable = match value {
        Value::String(text) => Comparable::of_text(trim(text).to_string()),
        Value::Number(_) | Value::Bool(_) => match Comparable::of_scalar(value) {
            Some(comparable) => comparable,
            None => return false,
        },
        Value::Null | Value::Array(_) | Value::Object(_) => return false,
    };
    members.iter().any(|member| comparable.matches(member))
}

/// The value of a string matching `^[-+]?([0-9]+\.?[0-9]*|[0-9]*\.?[0-9]+)$`.
fn decimal_value(text: &str) -> Option<f64> {
    if !is_decimal_text(text) {
        return None;
    }
    text.parse::<f64>().ok()
}

/// Whether `text` matches `^[-+]?([0-9]+\.?[0-9]*|[0-9]*\.?[0-9]+)$`.
pub(crate) fn is_decimal_text(text: &str) -> bool {
    let unsigned = text.strip_prefix(['-', '+']).unwrap_or(text);
    let (integer, fraction) = match unsigned.split_once('.') {
        Some((integer, fraction)) => (integer, Some(fraction)),
        None => (unsigned, None),
    };
    let digits = |part: &str| part.bytes().all(|b| b.is_ascii_digit());
    if !digits(integer) || !fraction.is_none_or(digits) {
        return false;
    }
    !integer.is_empty() || fraction.is_some_and(|f| !f.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn check(parameter: Value, value: Value) -> bool {
        is_member(&value, &members(&parameter).unwrap())
    }

    #[test]
    fn decimal_grammar() {
        for text in [
            "1",
            "1.",
            ".5",
            "1.5",
            "+2",
            "-3",
            "007",
            "-.0",
            "1234567890",
        ] {
            assert!(is_decimal_text(text), "{text}");
        }
        for text in [
            "", ".", "+", "-", "1.2.3", "Infinity", "NaN", "1e0", "0x1", " 1", "+-1", "1_0",
            "\u{661}",
        ] {
            assert!(!is_decimal_text(text), "{text}");
        }
    }

    #[test]
    fn parameter_errors() {
        for (parameter, error) in [
            (json!(5), MembersError::Shape),
            (json!(true), MembersError::Shape),
            (json!([]), MembersError::Empty),
            (json!({}), MembersError::Empty),
            (json!(" \u{3000}"), MembersError::Empty),
            (json!(""), MembersError::Empty),
            (json!("a,,b"), MembersError::Empty),
            (json!("a,"), MembersError::Empty),
            (json!(["a", " "]), MembersError::Empty),
            (json!([""]), MembersError::Empty),
            (json!({ " ": "blank" }), MembersError::Empty),
            (json!([["a"]]), MembersError::MemberType),
            (json!(["a", null]), MembersError::MemberType),
            (json!([{}]), MembersError::MemberType),
            (json!(["a", 5, [1], ""]), MembersError::MemberType),
            (json!(["", [1]]), MembersError::Empty),
        ] {
            assert_eq!(members(&parameter), Err(error), "{parameter}");
        }
        assert!(members(&json!("\u{0}")).is_ok());
        assert!(members(&json!([false, 0])).is_ok());
    }

    #[test]
    fn matching() {
        let comma = json!("a, b,1");
        assert!(check(comma.clone(), json!(" b\u{3000}")));
        assert!(check(comma.clone(), json!("1.0")));
        assert!(check(comma.clone(), json!("01")));
        assert!(check(comma.clone(), json!(1)));
        assert!(check(comma.clone(), json!(true)));
        assert!(check(comma.clone(), json!(["a", "b"])));
        assert!(check(comma.clone(), json!(["a", "", " ", null, [], {}])));
        for value in [
            json!("0x1"),
            json!("1e0"),
            json!("A"),
            json!("a\u{0}"),
            json!(false),
            json!(["a", "z"]),
            json!([["a"]]),
            json!({ "a": 1 }),
            json!([{ "a": "a" }]),
        ] {
            assert!(!check(comma.clone(), value.clone()), "{value}");
        }
        let list = json!(["a,b", " c ", 2.5, false]);
        assert!(check(list.clone(), json!("a,b")));
        assert!(!check(list.clone(), json!("a")));
        assert!(!check(list.clone(), json!("c")));
        // A string value is trimmed, so it never equals an untrimmed member.
        assert!(!check(list.clone(), json!(" c ")));
        assert!(check(list.clone(), json!("2.50")));
        assert!(check(list.clone(), json!(0)));
        assert!(check(list, json!(false)));
        let map = json!({ "x": "X", "2": "Two" });
        assert!(check(map.clone(), json!(2)));
        assert!(check(map.clone(), json!("2.0")));
        assert!(!check(map, json!("X")));
        // Negative zero equals zero as a double; boolean members are not numbers.
        assert!(check(json!(["-0"]), json!(0)));
        assert!(!check(json!([true]), json!("1.0")));
        // Unicode normalization never matches.
        assert!(!check(json!(["\u{E9}"]), json!("e\u{301}")));
    }
}
