//! Conformance integration test: runs every shared fixture case from
//! ../../../tests/cases/*.json through the Rust validator and checks
//! valid/error/field against the expected outcome.
//! Models validator-go tests/runner/go/run_test.go.

use formspec_validator::run_validation;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

fn cases_dir() -> PathBuf {
    // tests/conformance.rs -> crate root is packages/validator-rust;
    // shared fixtures live at ../../tests/cases.
    let manifest = env!("CARGO_MANIFEST_DIR");
    Path::new(manifest).join("..").join("..").join("tests").join("cases")
}

#[test]
fn conformance_all_cases() {
    let dir = cases_dir();
    let mut files: Vec<PathBuf> = fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("read_dir {:?}: {}", dir, e))
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map(|x| x == "json").unwrap_or(false))
        .collect();
    files.sort();
    assert!(!files.is_empty(), "no fixture files found in {:?}", dir);

    let mut total = 0usize;
    let mut passed = 0usize;
    let mut failures: Vec<String> = Vec::new();

    for file in &files {
        let content = fs::read_to_string(file).unwrap();
        let suite: Value = serde_json::from_str(&content)
            .unwrap_or_else(|e| panic!("parse {:?}: {}", file, e));
        let suite_name = file.file_name().unwrap().to_string_lossy().to_string();

        let tests = match suite.get("tests").and_then(Value::as_array) {
            Some(t) => t,
            None => continue,
        };

        for test_def in tests {
            let id = test_def.get("id").and_then(Value::as_str).unwrap_or("?");
            let spec = match test_def.get("spec") {
                Some(s) => s,
                None => continue,
            };
            let cases = match test_def.get("cases").and_then(Value::as_array) {
                Some(c) => c,
                None => continue,
            };

            for (ci, case) in cases.iter().enumerate() {
                total += 1;
                let input = case.get("input").cloned().unwrap_or(Value::Null);
                let expected = case.get("expected").cloned().unwrap_or(Value::Null);

                let exp_valid = expected.get("valid").and_then(Value::as_bool).unwrap_or(false);
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

                if ok {
                    passed += 1;
                } else {
                    failures.push(format!(
                        "{}::{}::case_{} input={} expected(valid={},error={:?},field={:?}) got(valid={},error={:?},field={:?})",
                        suite_name, id, ci,
                        input,
                        exp_valid, exp_error, exp_field,
                        resp.valid, resp.error, resp.field,
                    ));
                }
            }
        }
    }

    eprintln!("CONFORMANCE: {}/{} passed", passed, total);
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
