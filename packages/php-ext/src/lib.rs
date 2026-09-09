//! Native engine operations and direct PHP value conversion.
//!
//! The C binding owns arguments and results. Engine operations borrow arguments,
//! return owned results, and retain no references to PHP values. PHP object
//! destruction releases form instances through `ps_form_free`.

mod engine;
mod value;
