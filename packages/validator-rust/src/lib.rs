//! CRUDUI schema composition and validation.
#![deny(missing_docs)]

pub mod compose;
pub mod detail;
pub mod expr;
pub mod forbidden_scan;
pub mod list;
mod structure;
pub mod types;
pub mod validate;

pub use detail::{validate_detail, ValidateDetailOptions};
pub use forbidden_scan::scan_forbidden_keys;
pub use list::{validate_list, ValidateListOptions};
pub use types::{
    BehaviorSlot, ConditionMap, ConditionValue, Content, DesignNode, DesignSlot, ExtraMap,
    FieldSpec, Items, ItemsSource, LangSpec, MultipleSpec, OptionsSlot, Polymorphic, ValidateSlot,
    DEFAULT_KEY, FORBIDDEN_META_KEYS,
};

/// Explicit legacy schema and validator APIs.
pub mod legacy;
pub use validate::{validate, FormInputError, ValidateError, ValidateOptions, Validator};
