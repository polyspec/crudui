//! Conformance evidence for Rust integration tests (runtime key `rust`).
//!
//! Mirrors tests/conformance/evidence.mjs: when CRUDUI_CONFORMANCE_EVIDENCE names
//! a directory, each shared fixture case appends one JSON line
//! `{"feature","fixture","runtime","case","passed"}` to `<dir>/rust-<pid>.jsonl`.
//! Nothing is written when the variable is unset or empty.
//! scripts/check-conformance.mjs reads these files.

use serde_json::{Map, Value};
use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::panic::{catch_unwind, resume_unwind, AssertUnwindSafe};
use std::path::Path;

const RUNTIME: &str = "rust";

/// Record one case result. `feature`, `fixture` and `case` must be non-empty.
pub fn record_conformance(feature: &str, fixture: &str, case: &str, passed: bool) {
    for (key, value) in [("feature", feature), ("fixture", fixture), ("case", case)] {
        assert!(
            !value.is_empty(),
            "Conformance evidence {key} must be a non-empty string"
        );
    }
    let directory = match std::env::var("CRUDUI_CONFORMANCE_EVIDENCE") {
        Ok(dir) if !dir.is_empty() => dir,
        _ => return,
    };
    create_dir_all(&directory)
        .unwrap_or_else(|e| panic!("create evidence directory {directory}: {e}"));
    // serde_json is built with preserve_order, so keys keep this insertion order.
    let mut item = Map::new();
    item.insert("feature".into(), Value::from(feature));
    item.insert("fixture".into(), Value::from(fixture));
    item.insert("runtime".into(), Value::from(RUNTIME));
    item.insert("case".into(), Value::from(case));
    item.insert("passed".into(), Value::Bool(passed));
    let file = Path::new(&directory).join(format!("{RUNTIME}-{}.jsonl", std::process::id()));
    let mut out = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file)
        .unwrap_or_else(|e| panic!("open evidence file {file:?}: {e}"));
    writeln!(out, "{}", Value::Object(item))
        .unwrap_or_else(|e| panic!("write evidence file {file:?}: {e}"));
}

/// Run one fixture case and record it. `run` returns the case's failure
/// messages; the case passes only when it returns none and does not panic.
/// A panic is recorded as a failure and then resumed. The failures are
/// returned so the caller can assert on them with full messages.
pub fn prove_case<F>(feature: &str, fixture: &str, case: &str, run: F) -> Vec<String>
where
    F: FnOnce() -> Vec<String>,
{
    match catch_unwind(AssertUnwindSafe(run)) {
        Ok(failures) => {
            record_conformance(feature, fixture, case, failures.is_empty());
            failures
        }
        Err(panic) => {
            record_conformance(feature, fixture, case, false);
            resume_unwind(panic)
        }
    }
}
