//! CRUDUI composition engine — schema §5, G5.
//!
//! The parser's first pass: expand `$ref` (base inheritance) then `$patch`
//! (add/remove/replace + deep-path set) into a single, composition-free spec,
//! BEFORE the field layer / validation / render. Unresolved composition is a LOAD
//! ERROR (`ComposeLoadError`) — never `valid:true` (the legacy LargeForm.yml:873
//! bug). CRUDUI-NEW only: this never touches the legacy model or loader (R7 parallel run).
//!
//! Byte-for-byte parity with the JS reference engine
//! (`packages/validator-js/src/compose`); the shared 4-language fixture
//! `tests/fixtures/compose/cases.json` is the single source of truth.

pub mod compose;
pub mod errors;
pub mod loader;
pub mod patch;
pub mod ref_;

pub use compose::{compose_properties, compose_spec, ComposeOptions};
pub use errors::{ComposeErrorCode, ComposeLoadError, ComposeResult};
pub use loader::{FileLoader, LoadedDoc, MemoryLoader};
pub use patch::apply_patch;
pub use ref_::resolve_ref;
