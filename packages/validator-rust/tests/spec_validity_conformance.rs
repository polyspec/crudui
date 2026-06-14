//! CRUDUI recursive forbidden-scan conformance (schema §6).
//!
//! Single truth = the shared 4-language fixture
//! tests/fixtures/spec-validity/cases.json (JS-generated). All four engines
//! (JS / PHP / Go / Rust) load this ONE file and must reproduce it: a clean spec
//! passes the load path; a forbidden meta key found at ANY depth (slot/bucket
//! body and one level below, deep child subtrees, array elements, $ref-inherited
//! bases) is a LOAD ERROR (`ComposeLoadError`, code `FORBIDDEN_META_KEY`), never
//! `valid:true`. The depth is load-bearing, so the dotted path (`trace`) is
//! asserted against the fixture `at_path`, not just the code.
//!
//! Never weaken an assertion to turn red green; fix the engine or the fixture at
//! their shared source — not this test.
//!
//! Fixture format:
//!   { name, note, spec, files?, expect: "ok" }
//!   { name, note, spec, files?, expect: { error_code, at_path } }

use formspec_validator::validate::{validate, ValidateOptions};
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
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("read fixture {:?}: {}", path, e));
    let parsed: Value =
        serde_json::from_str(&raw).unwrap_or_else(|e| panic!("parse fixture {:?}: {}", path, e));
    parsed
        .as_array()
        .unwrap_or_else(|| panic!("fixture root is not an array"))
        .clone()
}

/// Run the real LOAD path (compose -> forbidden-scan -> validate) for a case.
/// Data is irrelevant to the scan; pass an empty object — the scan runs before
/// any data-driven validation.
fn run(case: &Value) -> Result<(), String> {
    let spec = case.get("spec").expect("case missing spec");
    let files = case.get("files").and_then(Value::as_object).cloned();
    let options = ValidateOptions {
        files,
        loader: None,
        basepath: None,
    };
    let data = Value::Object(Default::default());
    match validate(spec, &data, &options) {
        Ok(_) => Ok(()),
        // A load failure is the only relevant signal for this contract; carry the
        // code and path so the caller can assert them against the fixture.
        Err(e) => Err(format!("{}|{}", e.code.as_str(), e.trace.join("."))),
    }
}

#[test]
fn spec_validity_matches_fixture() {
    let cases = load_cases();
    let mut failures: Vec<String> = Vec::new();
    let mut ran = 0usize;

    for case in &cases {
        ran += 1;
        let name = case.get("name").and_then(Value::as_str).unwrap_or("?");
        let expect = case.get("expect").expect("case missing expect");

        let result = run(case);

        match expect {
            // "ok" — must load without a forbidden-scan error.
            Value::String(s) if s == "ok" => {
                if let Err(got) = result {
                    failures.push(format!(
                        "[{}] expected ok but got load error: {}",
                        name, got
                    ));
                }
            }
            // { error_code, at_path } — must be a LOAD ERROR with that exact code
            // AND that exact dotted path (depth is load-bearing).
            Value::Object(want) => {
                let code = want.get("error_code").and_then(Value::as_str).unwrap_or("?");
                let at = want.get("at_path").and_then(Value::as_str).unwrap_or("?");
                let expected = format!("{}|{}", code, at);
                match result {
                    Ok(()) => failures.push(format!(
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
                "[{}] expect must be \"ok\" | {{error_code, at_path}}, got {}",
                name, other
            )),
        }
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
