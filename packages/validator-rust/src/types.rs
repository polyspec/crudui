//! Canonical CRUDUI field model and supporting serde types.
//!
//! This module represents top-level keys, role slots, dependency buckets, design
//! nodes, condition maps and `$ref`/`$patch` composition. `deny_unknown_fields`
//! rejects unrecognized top-level keys and every unknown key inside the closed
//! buckets `design` (and its nodes), `behavior`, `multiple` and `lang`. `RuleMap`
//! accepts only registered rule names as `validate` and `messages` keys. `ExtraMap`
//! accepts extension keys inside the open buckets `options` and a dynamic `items`
//! source, and rejects every forbidden meta key during deserialization.
//!
//! Role slots and structural dimensions use `Polymorphic<T>` for `false`, an
//! explicit object or `true`. Dependent keys remain under their owning target as
//! required by SPEC §3 C. The meta-schema removes `x{key}` comments before this
//! model is decoded, so a remaining `x`-prefixed key is rejected.
//!
//! `serde_json` preserves declaration order for maps, condition maps and
//! properties. Every public model type implements both `Serialize` and
//! `Deserialize`, and the tests verify value and order preservation.

use serde::de::{self, Deserializer, MapAccess, Visitor};
use serde::ser::{SerializeMap, Serializer};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fmt;

/// Meta keys rejected at the top level and inside open buckets.
pub const FORBIDDEN_META_KEYS: &[&str] = &[
    "display_switch",
    "display_target",
    "if",
    "when",
    "show_if",
    "_",
    "seqtokey",
    "__13hex__",
    "$after",
    "$before",
    "$merge",
    "$remove",
    "xclass",
    "xstyle",
];

/// Return whether a key is explicitly forbidden or uses the `x{key}` comment prefix.
fn is_forbidden_key(key: &str) -> bool {
    if FORBIDDEN_META_KEYS.contains(&key) {
        return true;
    }
    // Canonical keys do not start with `x`; the meta-schema removes comments
    // before decoding, so any remaining `x` prefix is invalid.
    key.len() > 1 && key.starts_with('x')
}

/// A role slot or structural dimension encoded as `false`, an object or `true`.
///
/// SPEC §2 G2 applies this form to validate, design, behavior, options, multiple
/// and lang. `behavior: false` suppresses composed inheritance.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Polymorphic<T> {
    /// A Boolean toggle; `true` is the short form of an empty configuration.
    Toggle(bool),
    /// An explicit configuration object.
    Config(T),
}

/// A declaration-ordered map from expression keys to values.
///
/// Evaluation selects the first truthy expression. The literal `true` key is the
/// optional default. `serde_json` preserves the declared order.
pub type ConditionMap = Map<String, Value>;

/// The always-true default key for a condition map.
pub const DEFAULT_KEY: &str = "true";

/// A single expression or literal, or a declaration-ordered condition map.
///
/// SPEC §2 G1 expresses conditions in the value instead of separate `if`, `when`
/// or `show_if` keys. The expression engine performs evaluation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ConditionValue {
    /// A declaration-ordered condition map with an optional `true` default.
    Map(ConditionMap),
    /// An expression string, literal or static value.
    Single(Value),
}

/// Human-facing content encoded as one string or a language map.
///
/// SPEC §2 G3 separates translated content from the `lang` input dimension. A
/// missing or null content field has no rendering or validation effect. Language
/// maps may contain null entries for empty labels.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Content {
    /// A single-language string.
    Text(String),
    /// A language map such as `{ ko: …, en: … }`.
    Lang(Map<String, Value>),
}

/// Declaration-ordered extension keys for an open bucket.
///
/// `#[serde(flatten)]` stores unlisted keys while deserialization rejects every
/// forbidden meta key and `x{key}` comment prefix.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ExtraMap(pub Map<String, Value>);

impl ExtraMap {
    /// Return the stored extension map.
    pub fn as_map(&self) -> &Map<String, Value> {
        &self.0
    }
}

impl<'de> Deserialize<'de> for ExtraMap {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct ExtraVisitor;

        impl<'de> Visitor<'de> for ExtraVisitor {
            type Value = ExtraMap;

            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("a map of extension keys (no forbidden meta keys)")
            }

            fn visit_map<M>(self, mut access: M) -> Result<ExtraMap, M::Error>
            where
                M: MapAccess<'de>,
            {
                let mut out = Map::new();
                while let Some(key) = access.next_key::<String>()? {
                    if is_forbidden_key(&key) {
                        return Err(de::Error::custom(format!(
                            "forbidden meta key '{key}' rejected in open bucket (propertyNames not-enum)"
                        )));
                    }
                    let value: Value = access.next_value()?;
                    out.insert(key, value);
                }
                Ok(ExtraMap(out))
            }
        }

        deserializer.deserialize_map(ExtraVisitor)
    }
}

/// Declaration-ordered rule keys of `validate` or `messages`.
///
/// Deserialization rejects every key that is not a registered rule name, and in
/// `messages` every value that is not a string.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct RuleMap(pub Map<String, Value>);

impl RuleMap {
    /// Return the stored rule map.
    pub fn as_map(&self) -> &Map<String, Value> {
        &self.0
    }
}

/// Read a map whose keys are registered rule names.
fn read_rule_map<'de, D>(deserializer: D, messages: bool) -> Result<RuleMap, D::Error>
where
    D: Deserializer<'de>,
{
    struct RuleVisitor(bool);

    impl<'de> Visitor<'de> for RuleVisitor {
        type Value = RuleMap;

        fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
            f.write_str("a map keyed by registered rule names")
        }

        fn visit_map<M>(self, mut access: M) -> Result<RuleMap, M::Error>
        where
            M: MapAccess<'de>,
        {
            let mut out = Map::new();
            while let Some(key) = access.next_key::<String>()? {
                if crate::validate::rules::get_rule(&key).is_none() {
                    return Err(de::Error::custom(format!("Unknown rule: {key}")));
                }
                let value: Value = access.next_value()?;
                if self.0 && !value.is_string() {
                    return Err(de::Error::custom(format!(
                        "message for {key} is not a string"
                    )));
                }
                out.insert(key, value);
            }
            Ok(RuleMap(out))
        }
    }

    deserializer.deserialize_map(RuleVisitor(messages))
}

impl<'de> Deserialize<'de> for RuleMap {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        read_rule_map(deserializer, false)
    }
}

impl Serialize for RuleMap {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.0.serialize(serializer)
    }
}

/// Error message overrides keyed by registered rule name; every value is a string.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Messages(pub RuleMap);

impl<'de> Deserialize<'de> for Messages {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        read_rule_map(deserializer, true).map(Messages)
    }
}

impl Serialize for Messages {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.0.serialize(serializer)
    }
}

impl Serialize for ExtraMap {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (k, v) in &self.0 {
            map.serialize_entry(k, v)?;
        }
        map.end()
    }
}

/// Canonical CRUDUI field model.
///
/// Top-level keys contain structure, identity, content and role slots. Dependent
/// details remain under their owning target (SPEC §3 C). `$ref` and `$patch` are
/// composition entry points. `deny_unknown_fields` rejects every unrecognized
/// top-level key.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FieldSpec {
    // ---- Composition (SPEC §5) ----
    /// Base inheritance by file or path. An unresolved reference is a load error.
    #[serde(rename = "$ref", default, skip_serializing_if = "Option::is_none")]
    pub ref_: Option<Value>,

    /// Add, remove, replace or deep-path changes applied after `$ref`.
    #[serde(rename = "$patch", default, skip_serializing_if = "Option::is_none")]
    pub patch: Option<Value>,

    // ---- Top-level structure and identity ----
    /// Field type such as email or group. The type defines the `options` slot.
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub field_type: Option<String>,

    /// Explicit field name used as the serialization key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// Default value used when expression path resolution has no value.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<Value>,

    /// Declaration-ordered child fields for a group or object.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub properties: Option<Map<String, Value>>,

    /// Static array, static value-to-label map or dynamic item source. Dynamic
    /// descriptors are preserved without executing queries or callbacks.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub items: Option<Items>,

    /// Repeated-row configuration encoded as `false`, an object or `true`. Row
    /// identity is supplied by runtime data rather than a specification key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multiple: Option<Polymorphic<MultipleSpec>>,

    /// Per-language input dimension encoded as `false`, an object or `true`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lang: Option<Polymorphic<LangSpec>>,

    // ---- Top-level content ----
    /// Field label, optionally represented as a language map.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<Content>,

    /// Description, optionally represented as a language map.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<Content>,

    /// Placeholder, optionally represented as a language map.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<Content>,

    /// Text displayed before the input, separate from `design.prepend`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prepend: Option<Content>,

    /// Text displayed after the input.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub append: Option<Content>,

    /// Help text, optionally represented as a language map.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub help: Option<Content>,

    /// Control text of a button or action field, optionally translated.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<Content>,

    // ---- Top-level polymorphic role slots ----
    /// Validation rules. Values may be expressions or condition maps.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub validate: Option<Polymorphic<ValidateSlot>>,

    /// Error message overrides keyed by registered rule name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub messages: Option<Messages>,

    /// Display condition and DOM-node appearance configuration.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub design: Option<Polymorphic<DesignSlot>>,

    /// Opaque behavior scripts. `false` suppresses composed inheritance.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub behavior: Option<Polymorphic<BehaviorSlot>>,

    /// Type-specific options defined and validated by the field type.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<Polymorphic<OptionsSlot>>,

    // ---- Form root declarations ----
    /// Form buttons rendered in the form footer. Honored on the form root only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub buttons: Option<Vec<FormButton>>,

    /// Submission target kept for the application. Honored on the form root only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<FormAction>,
}

// ============================================================================
// Role slots from SPEC §3. `validate` accepts the registered rule names only
// (RuleMap). The open slot `options` preserves extension keys in ExtraMap, which
// rejects forbidden meta keys during deserialization. The closed slots `design`
// and `behavior` reject every unknown key.
// ============================================================================

/// Validation rules whose values may be expressions or condition maps.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct ValidateSlot {
    /// Required rule; an expression makes the rule conditional.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<ConditionValue>,
    /// Email-format rule.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<ConditionValue>,
    /// Match target expressed as a path or expression.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r#match: Option<ConditionValue>,
    /// The other registered rules; any other key is rejected.
    #[serde(flatten)]
    pub extra: RuleMap,
}

/// Display condition and appearance configuration for named DOM nodes.
///
/// A closed bucket: `deny_unknown_fields` rejects every unlisted key.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DesignSlot {
    /// Display condition represented as an expression or condition map.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub show: Option<ConditionValue>,
    /// Class for the primary input node.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub class: Option<ConditionValue>,
    /// Style for the primary input node.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<ConditionValue>,
    /// Label-node appearance.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<DesignNode>,
    /// Wrapper-node appearance.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrapper: Option<DesignNode>,
    /// Group-node appearance.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<DesignNode>,
    /// Prepend-node appearance.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prepend: Option<DesignNode>,
}

/// Appearance configuration for one named DOM node.
///
/// A closed bucket: `deny_unknown_fields` rejects every key except class and style.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DesignNode {
    /// Node class represented as an expression or condition map.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub class: Option<ConditionValue>,
    /// Node style represented as an expression or condition map.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<ConditionValue>,
}

/// Opaque client behavior scripts shared by all field types.
///
/// A closed bucket: `deny_unknown_fields` rejects every unlisted key.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BehaviorSlot {
    /// Script executed after a value change.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub onchange: Option<Value>,
    /// Script executed after a click.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub onclick: Option<Value>,
    /// Script executed after loading.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub onload: Option<Value>,
}

/// One form button. A button or link needs text; a link needs href.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FormButton {
    /// Button type: submit, reset, button or link.
    #[serde(rename = "type")]
    pub button_type: String,
    /// Button text, optionally represented as a language map.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<Content>,
    /// Submitted name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Submitted value.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    /// Link target.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub href: Option<String>,
    /// Button appearance.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub design: Option<Polymorphic<DesignSlot>>,
    /// Opaque behavior scripts.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub behavior: Option<Polymorphic<BehaviorSlot>>,
}

/// Submission target of the form, kept for the application.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FormAction {
    /// HTTP method.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    /// Submission URL.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Submission encoding.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enctype: Option<String>,
}

/// Type-specific options. Field types define and validate their own option keys.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct OptionsSlot {
    /// Minimum keyword length.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keyword_min_length: Option<Value>,
    /// Whether a map marker is draggable.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub marker_draggable: Option<Value>,
    /// Map zoom level.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub zoom: Option<Value>,
    /// Geometry type.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry_type: Option<Value>,
    /// Maximum tag count.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_tags: Option<Value>,
    /// Checkbox label.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checkbox_label: Option<Value>,
    /// Enabled-state label.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub on_label: Option<Value>,
    /// Container collapse setting.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collapse: Option<Value>,
    /// Container expansion setting.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expend: Option<Value>,
    /// Container total display setting.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub view_total: Option<Value>,
    /// Container stepper setting.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stepper: Option<Value>,
    /// Empty-state message.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blank_message: Option<Value>,
    /// Type-specific callback.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub callback: Option<Value>,
    /// Type-specific event configuration.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event: Option<Value>,
    /// Additional type-specific options.
    #[serde(flatten)]
    pub extra: ExtraMap,
}

// ============================================================================
// Dependency buckets under their structural targets (SPEC §3 C).
// ============================================================================

/// Repeated-row options stored under `multiple`.
///
/// Row identity is not a field of this structure. Repeated data is an object
/// keyed by row identity, and object member order is row order. A closed
/// bucket: `deny_unknown_fields` rejects every unlisted key.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MultipleSpec {
    /// Minimum row count.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<Value>,
    /// Maximum row count.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<Value>,
    /// Row copy control.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub copy: Option<Value>,
    /// Whether rows are sortable.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sortable: Option<Value>,
    /// Direct child field of a repeated group whose value titles each row.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<Value>,
    /// Position of row controls: header, footer or outline.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub controls: Option<Value>,
    /// Static or sticky row headers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub header: Option<Value>,
    /// Click behavior for repeated-row controls.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub onclick: Option<Value>,
}

/// Per-language input options stored under `lang`.
///
/// A closed bucket: `deny_unknown_fields` rejects every unlisted key.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LangSpec {
    /// Language-input mode.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<Value>,
    /// Language allowlist or per-language role-slot overrides. `Value` preserves
    /// both input forms during serialization.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub only: Option<Value>,
    /// Language-dimension name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<Value>,
    /// Language-dimension key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<Value>,
    /// Language-group frame setting.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frame: Option<Value>,
    /// Language-group title.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<Value>,
    /// Language-group class.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_class: Option<Value>,
}

/// Static choices or a dynamic item-source descriptor.
///
/// A static map uses each key as the option value and each string, language map
/// or null value as its display label. An object is dynamic only when all of its
/// keys belong to the source descriptor set.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum Items {
    /// A boxed dynamic source descriptor.
    Dynamic(Box<ItemsSource>),
    /// A static array or declaration-ordered value-to-label map.
    Static(Value),
}

/// Keys that identify a complete object as a dynamic item source.
const ITEMS_DYNAMIC_KEYS: &[&str] = &[
    "model",
    "method",
    "table",
    "relations",
    "api_server",
    "items",
];

impl<'de> Deserialize<'de> for Items {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;
        match &value {
            // Arrays are static choices.
            Value::Array(_) => Ok(Items::Static(value)),
            // An object is dynamic only when every key belongs to the descriptor.
            Value::Object(map) => {
                let all_dynamic =
                    !map.is_empty() && map.keys().all(|k| ITEMS_DYNAMIC_KEYS.contains(&k.as_str()));
                if all_dynamic {
                    let source = ItemsSource::deserialize(value).map_err(de::Error::custom)?;
                    Ok(Items::Dynamic(Box::new(source)))
                } else {
                    // A static map uses keys as values and entries as labels.
                    Ok(Items::Static(value))
                }
            }
            // Other values remain static.
            _ => Ok(Items::Static(value)),
        }
    }
}

/// Dynamic item-source descriptor stored under `items`.
///
/// This model preserves query and callback values without executing them. A
/// placeholder static item set may coexist with the dynamic source.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct ItemsSource {
    /// Model name or nested relational-query descriptor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<Value>,
    /// Source method.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub method: Option<Value>,
    /// Top-level table shorthand.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub table: Option<Value>,
    /// Relation descriptors.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relations: Option<Value>,
    /// Opaque HTTP endpoint callback preserved without execution.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_server: Option<Value>,
    /// Static placeholder items displayed before the dynamic source resolves.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub items: Option<Value>,
    /// Additional source descriptor properties.
    #[serde(flatten)]
    pub extra: ExtraMap,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(s: &str) -> FieldSpec {
        serde_json::from_str(s).expect("valid field spec")
    }

    #[test]
    fn minimal_type_only() {
        let f = parse(r#"{ "type": "email" }"#);
        assert_eq!(f.field_type.as_deref(), Some("email"));
    }

    #[test]
    fn slot_polymorphic_toggle() {
        // behavior:false suppresses composed inheritance (G2).
        let f = parse(r#"{ "type": "text", "behavior": false }"#);
        assert_eq!(f.behavior, Some(Polymorphic::Toggle(false)));

        // validate:true is the short form of an empty configuration (G2).
        let f = parse(r#"{ "type": "text", "validate": true }"#);
        assert_eq!(f.validate, Some(Polymorphic::Toggle(true)));
    }

    #[test]
    fn slot_polymorphic_config() {
        let f = parse(
            r#"{ "type": "email",
                 "validate": { "required": ".subscribe", "email": true } }"#,
        );
        match f.validate {
            Some(Polymorphic::Config(v)) => {
                assert_eq!(
                    v.required,
                    Some(ConditionValue::Single(Value::String(".subscribe".into())))
                );
                assert_eq!(v.email, Some(ConditionValue::Single(Value::Bool(true))));
            }
            other => panic!("expected validate config, got {other:?}"),
        }
    }

    #[test]
    fn design_node_map() {
        let f = parse(
            r#"{ "type": "text",
                 "design": {
                   "show": ".subscribe",
                   "class": { ".vip": "gold", "true": "plain" },
                   "label": { "class": "lbl" }
                 } }"#,
        );
        match f.design {
            Some(Polymorphic::Config(d)) => {
                assert!(d.show.is_some());
                // Condition maps preserve declaration order and the true default.
                match d.class {
                    Some(ConditionValue::Map(m)) => {
                        let keys: Vec<&String> = m.keys().collect();
                        assert_eq!(keys, vec![".vip", DEFAULT_KEY]);
                    }
                    other => panic!("expected class condition map, got {other:?}"),
                }
                assert_eq!(
                    d.label.and_then(|n| n.class),
                    Some(ConditionValue::Single(Value::String("lbl".into())))
                );
            }
            other => panic!("expected design config, got {other:?}"),
        }
    }

    #[test]
    fn type_dependency_isolated_to_options() {
        let f = parse(r#"{ "type": "checkbox", "options": { "checkbox_label": "agree" } }"#);
        match f.options {
            Some(Polymorphic::Config(o)) => {
                assert_eq!(o.checkbox_label, Some(Value::String("agree".into())))
            }
            other => panic!("expected options config, got {other:?}"),
        }
    }

    #[test]
    fn multiple_dependency_isolated_under_multiple() {
        let f = parse(
            r#"{ "type": "group", "multiple": { "min": 1, "max": 5, "sortable": true, "title": "name", "controls": "footer", "header": "sticky" } }"#,
        );
        match f.multiple {
            Some(Polymorphic::Config(m)) => {
                assert_eq!(m.min, Some(Value::from(1)));
                assert_eq!(m.max, Some(Value::from(5)));
                assert_eq!(m.title, Some(Value::from("name")));
                assert_eq!(m.controls, Some(Value::from("footer")));
                assert_eq!(m.header, Some(Value::from("sticky")));
            }
            other => panic!("expected multiple config, got {other:?}"),
        }
    }

    #[test]
    fn lang_dependency_isolated_under_lang() {
        let f = parse(r#"{ "type": "text", "lang": { "mode": "append", "only": ["ko","en"] } }"#);
        match f.lang {
            Some(Polymorphic::Config(l)) => {
                assert_eq!(l.mode, Some(Value::String("append".into())))
            }
            other => panic!("expected lang config, got {other:?}"),
        }
    }

    #[test]
    fn items_dynamic_source() {
        let f = parse(r#"{ "type": "select", "items": { "model": "User", "method": "all" } }"#);
        match f.items {
            Some(Items::Dynamic(s)) => assert_eq!(s.model, Some(Value::String("User".into()))),
            other => panic!("expected dynamic items, got {other:?}"),
        }
    }

    #[test]
    fn items_static_array() {
        let f = parse(r#"{ "type": "select", "items": ["a","b"] }"#);
        assert!(matches!(f.items, Some(Items::Static(_))));
    }

    // A search source preserves an API callback and placeholder items together.
    #[test]
    fn items_dynamic_source_api_server_and_placeholder() {
        let f = parse(
            r#"{ "type": "search",
                 "items": {
                   "api_server": "function() { return '../search'; }",
                   "items": []
                 } }"#,
        );
        match f.items {
            Some(Items::Dynamic(s)) => {
                assert_eq!(
                    s.api_server,
                    Some(Value::String("function() { return '../search'; }".into()))
                );
                assert_eq!(s.items, Some(Value::Array(vec![])));
            }
            other => panic!("expected dynamic items, got {other:?}"),
        }
    }

    // A source preserves a nested model, API callback and placeholder label map.
    #[test]
    fn items_dynamic_source_nested_model() {
        let f = parse(
            r#"{ "type": "search",
                 "items": {
                   "model": { "table": "service_member",
                              "relations": [ { "table": "user", "left": "user_seq", "right": "seq" } ],
                              "keys": [ { "table": "service_member", "field": "seq", "append": ". " } ] },
                   "api_server": "function() { return '/admin/user/search'; }",
                   "items": { "": "선택하세요" }
                 } }"#,
        );
        match f.items {
            Some(Items::Dynamic(s)) => {
                // The model remains a nested object.
                match s.model {
                    Some(Value::Object(m)) => {
                        assert_eq!(
                            m.get("table"),
                            Some(&Value::String("service_member".into()))
                        );
                        assert!(m.get("relations").unwrap().is_array());
                        assert!(m.get("keys").unwrap().is_array());
                    }
                    other => panic!("expected nested model object, got {other:?}"),
                }
                assert!(s.api_server.is_some());
                assert!(s.items.is_some());
            }
            other => panic!("expected dynamic items, got {other:?}"),
        }
    }

    #[test]
    fn label_language_map() {
        let f = parse(r#"{ "type": "text", "label": { "ko": "이메일", "en": "Email" } }"#);
        assert!(matches!(f.label, Some(Content::Lang(_))));
    }

    #[test]
    fn composition_ref_and_patch() {
        let f = parse(
            r#"{ "$ref": "Base.yml",
                 "$patch": { "field.validate.required": ".other" } }"#,
        );
        assert!(f.ref_.is_some());
        assert!(f.patch.is_some());
    }

    // deny_unknown_fields rejects forbidden, unrecognized and x-prefixed keys.
    #[test]
    fn forbidden_meta_keys_rejected_top_level() {
        let mut keys: Vec<String> = FORBIDDEN_META_KEYS.iter().map(|s| s.to_string()).collect();
        keys.push("xclassname".to_string()); // x{key} comment
                                             // Unrecognized names are also invalid at the top level.
        keys.push("multiple_max".to_string());
        keys.push("langs".to_string());
        for k in keys {
            let json = format!(r#"{{ "type": "text", "{k}": true }}"#);
            let r: Result<FieldSpec, _> = serde_json::from_str(&json);
            assert!(
                r.is_err(),
                "forbidden/non-canonical top key must be rejected: {k}"
            );
        }
    }

    // Open buckets accept extensions but reject every forbidden meta key; closed
    // buckets reject a forbidden key as an unknown key.
    #[test]
    fn forbidden_meta_keys_rejected_one_level_below() {
        for k in FORBIDDEN_META_KEYS {
            // Open options bucket.
            let json = format!(r#"{{ "type": "text", "options": {{ "{k}": true }} }}"#);
            let r: Result<FieldSpec, _> = serde_json::from_str(&json);
            assert!(
                r.is_err(),
                "forbidden key in options bucket must be rejected: {k}"
            );

            // Closed multiple dependency bucket.
            let json = format!(r#"{{ "type": "group", "multiple": {{ "{k}": true }} }}"#);
            let r: Result<FieldSpec, _> = serde_json::from_str(&json);
            assert!(
                r.is_err(),
                "forbidden key in multiple bucket must be rejected: {k}"
            );
        }
        // An x-prefixed comment is invalid inside a canonical bucket.
        let json = r#"{ "type": "text", "options": { "xnote": "comment" } }"#;
        let r: Result<FieldSpec, _> = serde_json::from_str(json);
        assert!(r.is_err(), "x{{key}} comment in bucket must be rejected");
    }

    // Open buckets preserve widget extension keys.
    #[test]
    fn open_bucket_allows_extension_keys() {
        let f = parse(r#"{ "type": "widget", "options": { "future_widget_opt": 42 } }"#);
        match f.options {
            Some(Polymorphic::Config(o)) => {
                assert_eq!(
                    o.extra.as_map().get("future_widget_opt"),
                    Some(&Value::from(42))
                );
            }
            other => panic!("expected options config, got {other:?}"),
        }
    }

    // Parsing, serializing and parsing again preserves value and declaration order.
    #[test]
    fn round_trip_preserves_value_and_order() {
        let inputs = [
            r#"{"type":"email","name":"e","validate":{"required":".subscribe","email":true}}"#,
            r#"{"type":"text","design":{"show":".s","class":{".vip":"gold","true":"plain"},"label":{"class":"lbl"}}}"#,
            r#"{"type":"group","multiple":{"max":5,"sortable":true},"properties":{"a":{"type":"text"},"b":{"type":"email"}}}"#,
            r#"{"type":"select","items":{"model":"User","method":"all"},"label":{"ko":"선택","en":"Select"}}"#,
            r#"{"type":"search","items":{"api_server":"function() { return '../search'; }","items":[]}}"#,
            r#"{"type":"search","items":{"model":{"table":"service_member","relations":[{"table":"user","left":"user_seq","right":"seq"}],"keys":[{"table":"service_member","field":"seq","append":". "}]},"api_server":"function() { return '/admin/user/search'; }","items":{"":"선택하세요"}}}"#,
            r#"{"type":"text","behavior":false,"lang":true}"#,
            r#"{"$ref":"Base.yml","$patch":{"field.validate.required":".other"}}"#,
            r#"{"type":"widget","options":{"future_widget_opt":42,"max_tags":3}}"#,
        ];
        for src in inputs {
            let original: Value = serde_json::from_str(src).unwrap();
            let spec: FieldSpec = serde_json::from_value(original.clone()).unwrap();
            let reser = serde_json::to_value(&spec).unwrap();
            assert_eq!(reser, original, "round-trip mismatch for: {src}");
            // A second parse preserves the same typed value.
            let spec2: FieldSpec = serde_json::from_value(reser).unwrap();
            assert_eq!(spec, spec2, "double round-trip mismatch for: {src}");
        }
    }

    // validate and messages keys are registered rule names.
    #[test]
    fn rule_keys_are_registered_rules() {
        for src in [
            r#"{"type":"text","validate":{"future_rule":1}}"#,
            r#"{"type":"text","validate":{"required":true,"equalto":".a"}}"#,
            r#"{"type":"text","messages":{"requird":"x"}}"#,
            r#"{"type":"text","messages":{"required":1}}"#,
        ] {
            let r: Result<FieldSpec, _> = serde_json::from_str(src);
            assert!(r.is_err(), "unknown rule key must be rejected: {src}");
        }
        let src = r#"{"type":"text","validate":{"required":true,"minlength":2,"dateISO":true,"step":0.5},"messages":{"number":"n","required":"r"}}"#;
        let original: Value = serde_json::from_str(src).unwrap();
        let spec: FieldSpec = serde_json::from_value(original.clone()).unwrap();
        assert_eq!(serde_json::to_value(&spec).unwrap(), original);
    }

    // The model has a field for every top-level key of the schema's field definition.
    #[test]
    fn top_level_keys_are_the_schema_field_keys() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../schema/crudui.schema.json"
        );
        let schema: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        let samples = serde_json::json!({
            "type": "button", "name": "n", "default": 1, "properties": {}, "items": {"model": "m"},
            "multiple": true, "lang": true, "label": "l", "description": "d", "placeholder": "p",
            "prepend": "p", "append": "a", "help": "h", "content": "c", "validate": true,
            "messages": {"required": "r"}, "design": true, "behavior": true, "options": true,
            "buttons": [], "action": {"method": "post"}, "$ref": "Base.yml", "$patch": {},
        });
        let keys: Vec<&String> = schema["definitions"]["Field"]["properties"]
            .as_object()
            .unwrap()
            .keys()
            .collect();
        let sample_keys: Vec<&String> = samples.as_object().unwrap().keys().collect();
        assert_eq!(keys, sample_keys);
        for key in keys {
            let field = serde_json::json!({ key.as_str(): samples[key.as_str()].clone() });
            let r: Result<FieldSpec, _> = serde_json::from_value(field);
            assert!(r.is_ok(), "{key}: {r:?}");
        }
    }

    // Closed buckets reject every unknown key, including a design node key.
    #[test]
    fn closed_buckets_reject_unknown_keys() {
        for src in [
            r#"{"type":"text","design":{"label":{"class":"lbl","text":"Name","style":"x"}}}"#,
            r#"{"type":"text","design":{"class":"a","text":"Name"}}"#,
            r#"{"type":"text","behavior":{"onsubmit":"x"}}"#,
            r#"{"type":"group","multiple":{"min":1,"foo":1}}"#,
            r#"{"type":"text","lang":{"mode":"append","langs":["ko"]}}"#,
        ] {
            let r: Result<FieldSpec, _> = serde_json::from_str(src);
            assert!(
                r.is_err(),
                "unknown key in closed bucket must be rejected: {src}"
            );
        }
        // An open bucket keeps accepting unknown keys.
        let src = r#"{"type":"search","items":{"model":"User","method":"all"}}"#;
        let r: Result<FieldSpec, _> = serde_json::from_str(src);
        assert!(r.is_ok(), "open bucket must accept: {src}");
    }

    // Condition-map serialization preserves declaration order.
    #[test]
    fn condition_map_order_preserved_through_serialize() {
        let src = r#"{"type":"text","design":{"class":{".a":"1",".b":"2","true":"d"}}}"#;
        let spec: FieldSpec = serde_json::from_str(src).unwrap();
        let out = serde_json::to_string(&spec).unwrap();
        assert!(
            out.contains(r#"".a":"1",".b":"2","true":"d""#),
            "order lost: {out}"
        );
    }
}
