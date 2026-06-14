//! v2 — 정규 모델(SPEC-V2.md 헌법의 기계화). v1(`crate::types` 등)과 병행하며
//! 안정 확보까지 독립이다(SPEC-V2 R7). 소비자는 v2 타입만 본다.

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
