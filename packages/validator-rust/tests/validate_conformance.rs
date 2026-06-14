//! CRUDUI validation-engine conformance (schema §2 pipeline, G-B 4-language idempotence).
//!
//! Single truth = the shared 4-language fixture tests/fixtures/validate/cases.json.
//! All four engines (JS / PHP / Go / Rust) load this ONE file and must reproduce
//! it bit-for-bit: the validation result (`expected = { valid, errors }`) or the
//! compose load-error code (`expectLoadError.code`). The values are the JS
//! reference engine's actual output. Never weaken an assertion to turn red green;
//! fix the engine, the fixture, or both at their shared source — not this test.
//!
//! errors are compared IN ORDER (declaration / traversal order), key by key:
//! path, field, rule, message, value. A reorder is a failure.

use crudui_validator::validate::{validate, ValidateOptions};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

fn fixture_path() -> PathBuf {
    let manifest = env!("CARGO_MANIFEST_DIR");
    Path::new(manifest)
        .join("..")
        .join("..")
        .join("tests")
        .join("fixtures")
        .join("validate")
        .join("cases.json")
}

/// Canonicalize numbers to f64 (JSON loses int/float, so 5 and 5.0 must match);
/// arrays preserve order; objects compared key-wise (recursively normalized).
/// Object KEY ORDER is NOT normalized away (serde_json preserve_order keeps
/// insertion order and the fixture is emitted in the same order).
fn normalize(v: &Value) -> Value {
    match v {
        Value::Number(n) => Value::from(n.as_f64().unwrap_or(0.0)),
        Value::Array(items) => Value::Array(items.iter().map(normalize).collect()),
        Value::Object(map) => {
            let mut out = Map::new();
            for (k, val) in map {
                out.insert(k.clone(), normalize(val));
            }
            Value::Object(out)
        }
        other => other.clone(),
    }
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

/// Build the `{ valid, errors }` value shape from a result for ordered comparison.
fn result_to_value(result: &crudui_validator::validate::ValidationResult) -> Value {
    let errors: Vec<Value> = result.errors.iter().map(|e| e.to_value()).collect();
    let mut m = Map::new();
    m.insert("valid".to_string(), Value::Bool(result.valid));
    m.insert("errors".to_string(), Value::Array(errors));
    Value::Object(m)
}

#[test]
fn validate_matches_fixture() {
    let cases = load_cases();
    let mut failures: Vec<String> = Vec::new();
    let mut ran = 0usize;

    for case in &cases {
        ran += 1;
        let name = case.get("name").and_then(Value::as_str).unwrap_or("?");
        let spec = case.get("spec").expect("case missing spec");
        let data = case.get("data").cloned().unwrap_or(Value::Null);

        let files = case
            .get("files")
            .and_then(Value::as_object)
            .cloned();
        let options = ValidateOptions {
            files,
            loader: None,
            basepath: None,
        };

        let result = validate(spec, &data, &options);

        match (case.get("expected"), case.get("expectLoadError")) {
            (Some(expected), None) => match result {
                Ok(actual) => {
                    let actual_v = result_to_value(&actual);
                    if normalize(expected) != normalize(&actual_v) {
                        failures.push(format!(
                            "[{}] result mismatch\n  expected: {}\n  actual:   {}",
                            name, expected, actual_v
                        ));
                    }
                }
                Err(e) => failures.push(format!(
                    "[{}] expected validation result but got load error {}: {}",
                    name, e.code, e.message
                )),
            },
            (None, Some(expect_load_error)) => {
                let want = expect_load_error
                    .get("code")
                    .and_then(Value::as_str)
                    .unwrap_or("?");
                match result {
                    Ok(actual) => failures.push(format!(
                        "[{}] expected load error {} but validated successfully: {}",
                        name,
                        want,
                        result_to_value(&actual)
                    )),
                    Err(e) => {
                        let got = e.code.as_str();
                        if got != want {
                            failures.push(format!(
                                "[{}] load-error code mismatch: expected {} got {} ({})",
                                name, want, got, e.message
                            ));
                        }
                    }
                }
            }
            _ => failures.push(format!(
                "[{}] case has neither (or both) expected/expectLoadError",
                name
            )),
        }
    }

    assert!(ran > 0, "no validate fixture cases were loaded");
    assert!(
        failures.is_empty(),
        "{}/{} validate mismatch(es):\n{}",
        failures.len(),
        ran,
        failures.join("\n")
    );
}
