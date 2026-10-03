//! Choice lists: `items` arrays of value and label pairs kept in list order.

use crate::template::check_declared_attributes;
use crate::util::{scalar, style};
use crate::{FormError, FormResult};
use serde_json::{Map, Value};
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

/// The members a choice of a choice or multichoice field may declare besides `value` and
/// `label`.
const APPEARANCE_MEMBERS: [&str; 3] = ["class", "style", "attributes"];

/// The canonical value text and label of each pair in list order, or `None` when an element
/// has another member (an appearance member is accepted with `appearance`), lacks `value` or
/// `label`, has a value that is not a string or a finite number, or repeats the canonical text
/// of an earlier value.
pub(crate) fn choice_pairs(items: &Value, appearance: bool) -> Option<Vec<(String, &Value)>> {
    let mut seen = HashSet::new();
    let mut pairs = Vec::new();
    for item in items.as_array()? {
        let object = item.as_object()?;
        let extra = object.keys().any(|key| {
            key != "value"
                && key != "label"
                && !(appearance && APPEARANCE_MEMBERS.contains(&key.as_str()))
        });
        if extra {
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
    choice_pairs(items, false)?
        .into_iter()
        .find(|(value, _)| value == text)
        .map(|(_, label)| label)
}

/// Reject the appearance of a valid choice list whose `class` or `style` is not a string or
/// whose `attributes` break the declared attribute rules, choice by choice in list order.
pub(crate) fn check_choice_appearance(items: &Value, path: &str) -> FormResult<()> {
    for (index, choice) in items.as_array().into_iter().flatten().enumerate() {
        for member in ["class", "style"] {
            if choice.get(member).is_some_and(|value| !value.is_string()) {
                return Err(FormError::input(format!(
                    "Invalid items.{index}.{member} at {path}: expected a string"
                )));
            }
        }
        if let Some(attributes) = choice.get("attributes") {
            check_declared_attributes(attributes, &format!("items.{index}.attributes"), path)?;
        }
    }
    Ok(())
}

/// The appearance members of each choice of a checked choice list in list order: the label
/// class (`className`) and style and the input attributes, each only when declared.
pub(crate) fn choice_appearances(items: &Value) -> Vec<Map<String, Value>> {
    items
        .as_array()
        .into_iter()
        .flatten()
        .map(|choice| {
            let mut appearance = Map::new();
            if let Some(class) = choice["class"].as_str().filter(|class| !class.is_empty()) {
                appearance.insert("className".into(), class.into());
            }
            let inline = style(choice["style"].as_str().unwrap_or(""));
            if !inline.is_empty() {
                appearance.insert("style".into(), inline.into());
            }
            if let Some(attributes) = choice["attributes"].as_object().filter(|a| !a.is_empty()) {
                appearance.insert("attributes".into(), attributes.clone().into());
            }
            appearance
        })
        .collect()
}
