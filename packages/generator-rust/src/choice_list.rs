//! Choice lists: `items` arrays of value and label pairs kept in list order.

use crate::util::scalar;
use serde_json::Value;
use std::collections::HashSet;

/// The expected-value text of a choice list declaration failure.
pub(crate) const CHOICE_LIST_EXPECTED: &str =
    "value and label pairs with distinct string or number values";

/// Whether `items` is a choice list: an array with an object element that has a `value` member.
pub(crate) fn is_choice_list(items: &Value) -> bool {
    items.as_array().is_some_and(|array| {
        array
            .iter()
            .any(|item| item.as_object().is_some_and(|o| o.contains_key("value")))
    })
}

/// The canonical value text and label of each pair in list order, or `None` when an element
/// has another member, lacks `value` or `label`, has a value that is not a string or a finite
/// number, or repeats the canonical text of an earlier value.
pub(crate) fn choice_pairs(items: &Value) -> Option<Vec<(String, &Value)>> {
    let mut seen = HashSet::new();
    let mut pairs = Vec::new();
    for item in items.as_array()? {
        let object = item.as_object()?;
        if object.len() != 2 {
            return None;
        }
        let (value, label) = (object.get("value")?, object.get("label")?);
        if !value.is_string() && !value.is_number() {
            return None;
        }
        let text = scalar(Some(value));
        if !seen.insert(text.clone()) {
            return None;
        }
        pairs.push((text, label));
    }
    Some(pairs)
}

/// The label of the pair whose value has the canonical text `text`.
pub(crate) fn choice_label<'a>(items: &'a Value, text: &str) -> Option<&'a Value> {
    choice_pairs(items)?
        .into_iter()
        .find(|(value, _)| value == text)
        .map(|(_, label)| label)
}
