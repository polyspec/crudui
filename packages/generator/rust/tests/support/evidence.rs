//! Record the actual result of a generator fixture trial through the shared Rust evidence recorder.

#[path = "../../../../validator/rust/tests/common/mod.rs"]
mod conformance;

use libtest_mimic::Failed;

/// Run one trial, retaining its failure and recording a panic before it resumes.
pub fn prove(
    feature: &str,
    fixture: &str,
    case: &str,
    run: impl FnOnce() -> Result<(), Failed>,
) -> Result<(), Failed> {
    let mut result = Ok(());
    let _ = conformance::prove_case(feature, fixture, case, || {
        result = run();
        if result.is_err() {
            vec!["fixture trial failed".to_string()]
        } else {
            Vec::new()
        }
    });
    result
}
