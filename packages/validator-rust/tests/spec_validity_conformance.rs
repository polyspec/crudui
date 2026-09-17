//! CRUDUI recursive forbidden-scan conformance (SPEC §6).
//!
//! The shared fixture tests/fixtures/spec-validity/cases.json defines each
//! expected result. A clean spec
//! passes the load path; a forbidden meta key found at ANY depth (slot/bucket
//! body and one level below, deep child subtrees, array elements, $ref-inherited
//! bases) is a LOAD ERROR (`ComposeLoadError`, code `FORBIDDEN_META_KEY`), never
//! `valid:true`. The test compares both the code and the complete dotted path
//! (`trace`) against the fixture `at_path`.
//!
//! Fixture format:
//!   { name, note, spec, files?, expect: "ok" }
//!   { name, note, spec, files?, expect: { error_code, at_path } }

mod common;

const FEATURE: &str = "validate";
const FIXTURE: &str = "tests/fixtures/spec-validity/cases.json";

use crudui_validator::validate::{validate, ValidateOptions};
use serde_json::Value;
use std::path::{Path, PathBuf};

fn fixture_path() -> PathBuf {
    // tests/spec_validity_conformance.rs -> crate root is packages/validator-rust;
    // the shared fixture lives at ../../tests/fixtures/spec-validity/cases.json.
    let manifest = env!("CARGO_MANIFEST_DIR");
    Path::new(manifest)
        .join("..")
        .join("..")
        .join("tests")
        .join("fixtures")
        .join("spec-validity")
        .join("cases.json")
}

fn load_cases() -> Vec<Value> {
    let path = fixture_path();
    let raw =
        std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read fixture {:?}: {}", path, e));
    let parsed: Value =
        serde_json::from_str(&raw).unwrap_or_else(|e| panic!("parse fixture {:?}: {}", path, e));
    parsed
        .as_array()
        .unwrap_or_else(|| panic!("fixture root is not an array"))
        .clone()
}

/// Run the real LOAD path (compose -> forbidden-scan -> validate) for a case.
/// Data is irrelevant to the scan; pass an empty object — the scan runs before
/// any data-driven validation. A load failure carries `code|at`.
fn run(case: &Value) -> Result<(bool, usize), String> {
    let spec = case.get("spec").expect("case missing spec");
    let files = case.get("files").and_then(Value::as_object).cloned();
    let options = ValidateOptions {
        files,
        loader: None,
        basepath: None,
    };
    let data = Value::Object(Default::default());
    match validate(spec, &data, &options) {
        Ok(result) => Ok((result.valid, result.errors.len())),
        Err(e) => Err(format!("{}|{}", e.code(), e.at())),
    }
}

#[test]
fn spec_validity_matches_fixture() {
    let cases = load_cases();
    let mut failures: Vec<String> = Vec::new();
    let mut ran = 0usize;

    for case in &cases {
        ran += 1;
        let name = case
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_else(|| panic!("fixture case missing name"));
        failures.extend(common::prove_case(FEATURE, FIXTURE, name, || {
            let mut failures: Vec<String> = Vec::new();
            let engine = case.get("engine").expect("case missing engine");

            let result = run(case);

            match engine {
                // "pass" — no load failure and { valid: true, errors: [] }.
                Value::String(s) if s == "pass" => match result {
                    Ok((true, 0)) => {}
                    Ok((valid, errors)) => failures.push(format!(
                        "[{}] engine:\"pass\" but valid={} with {} error(s)",
                        name, valid, errors
                    )),
                    Err(got) => failures.push(format!(
                        "[{}] engine:\"pass\" but got load error: {}",
                        name, got
                    )),
                },
                // { code, at } — must be a LOAD ERROR with that exact code AND that
                // exact dotted path (depth is load-bearing).
                Value::Object(want) => {
                    let code = want.get("code").and_then(Value::as_str).unwrap_or("?");
                    let at = want.get("at").and_then(Value::as_str).unwrap_or("?");
                    let expected = format!("{}|{}", code, at);
                    match result {
                        Ok(_) => failures.push(format!(
                            "[{}] expected load error {} but loaded successfully",
                            name, expected
                        )),
                        Err(got) => {
                            if got != expected {
                                failures.push(format!(
                                    "[{}] mismatch: expected {} got {}",
                                    name, expected, got
                                ));
                            }
                        }
                    }
                }
                other => failures.push(format!(
                    "[{}] engine must be \"pass\" | {{code, at}}, got {}",
                    name, other
                )),
            }
            failures
        }));
    }

    assert!(ran > 0, "no spec-validity fixture cases were loaded");
    assert!(
        failures.is_empty(),
        "{}/{} spec-validity mismatch(es):\n{}",
        failures.len(),
        ran,
        failures.join("\n")
    );
}
