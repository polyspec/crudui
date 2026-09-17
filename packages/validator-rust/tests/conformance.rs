//! Conformance integration test: runs every entry of the shared fixture
//! ../../../tests/fixtures/legacy-validate/cases.json through the Rust legacy
//! validator and checks valid/error/field against the expected outcome.
//! Each entry records one `validateLegacy` evidence line, passed only when all
//! of its cases pass.

mod common;

use crudui_validator::legacy::run_validation;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

const FEATURE: &str = "validateLegacy";
const FIXTURE: &str = "tests/fixtures/legacy-validate/cases.json";

fn fixture_path() -> PathBuf {
    // tests/conformance.rs -> crate root is packages/validator-rust;
    // the shared fixture lives at ../../tests/fixtures/legacy-validate/cases.json.
    let manifest = env!("CARGO_MANIFEST_DIR");
    Path::new(manifest).join("..").join("..").join(FIXTURE)
}

#[test]
fn conformance_all_cases() {
    let path = fixture_path();
    let content = fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {:?}: {}", path, e));
    let parsed: Value =
        serde_json::from_str(&content).unwrap_or_else(|e| panic!("parse {:?}: {}", path, e));
    let entries = parsed
        .as_array()
        .unwrap_or_else(|| panic!("fixture root is not an array"));
    assert!(
        !entries.is_empty(),
        "no fixture entries found in {:?}",
        path
    );

    let mut total = 0usize;
    let mut failures: Vec<String> = Vec::new();

    for entry in entries {
        let name = entry
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_else(|| panic!("fixture entry missing name"));
        let suite = entry
            .get("suite")
            .and_then(Value::as_str)
            .unwrap_or_else(|| panic!("[{}] fixture entry missing suite", name));
        let spec = entry
            .get("spec")
            .unwrap_or_else(|| panic!("[{}] fixture entry missing spec", name));
        let cases = entry
            .get("cases")
            .and_then(Value::as_array)
            .unwrap_or_else(|| panic!("[{}] fixture entry missing cases", name));
        total += cases.len();

        failures.extend(common::prove_case(FEATURE, FIXTURE, name, || {
            let mut failures: Vec<String> = Vec::new();
            for (ci, case) in cases.iter().enumerate() {
                let input = case.get("input").cloned().unwrap_or(Value::Null);
                let expected = case.get("expected").cloned().unwrap_or(Value::Null);

                let exp_valid = expected
                    .get("valid")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let exp_error = expected.get("error").and_then(Value::as_str);
                let exp_field = expected.get("field").and_then(Value::as_str);

                let resp = run_validation(spec, &input);

                let mut ok = resp.valid == exp_valid;
                if ok && !exp_valid {
                    if let Some(e) = exp_error {
                        ok = resp.error.as_deref() == Some(e);
                    }
                    if ok {
                        if let Some(f) = exp_field {
                            ok = resp.field.as_deref() == Some(f);
                        }
                    }
                }

                if !ok {
                    failures.push(format!(
                        "{}::{}::case_{} input={} expected(valid={},error={:?},field={:?}) got(valid={},error={:?},field={:?})",
                        suite, name, ci,
                        input,
                        exp_valid, exp_error, exp_field,
                        resp.valid, resp.error, resp.field,
                    ));
                }
            }
            failures
        }));
    }

    eprintln!("CONFORMANCE: {} cases, {} failed", total, failures.len());
    if !failures.is_empty() {
        let shown: Vec<String> = failures.iter().take(40).cloned().collect();
        panic!(
            "{} of {} cases failed:\n{}",
            failures.len(),
            total,
            shown.join("\n")
        );
    }
}
