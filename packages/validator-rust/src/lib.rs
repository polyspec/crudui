//! CRUDUI schema composition and validation.

pub mod compose;
pub mod expr;
pub mod forbidden_scan;
pub mod types;
pub mod validate;

pub use forbidden_scan::scan_forbidden_keys;
pub use types::{
    BehaviorSlot, Content, ConditionMap, ConditionValue, DesignNode, DesignSlot, ExtraMap,
    FieldSpec, Items, ItemsSource, LangSpec, MultipleSpec, OptionsSlot, Polymorphic, ValidateSlot,
    DEFAULT_KEY, FORBIDDEN_META_KEYS,
};

/// Legacy schema and validation APIs.
pub mod legacy;
