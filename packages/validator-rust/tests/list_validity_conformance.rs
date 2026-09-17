//! CRUDUI list-spec structure conformance for SPEC §9.
//!
//! `tests/fixtures/list-validity/cases.json` contains independent meta-schema and
//! runtime expectations. This test reads `engine` and passes the case `files`:
//! `"pass"` requires successful composition and forbidden-key scanning; `{ code, at }` requires the declared
//! load-error code and complete dotted trace. Row validation does not apply.

mod common;

const FEATURE: &str = "validateList";
const FIXTURE: &str = "tests/fixtures/list-validity/cases.json";

use std::path::{Path, PathBuf};

use crudui_validator::list::{validate_list, ValidateListOptions};
use serde_json::Value;

fn fixture_path() -> PathBuf {
    // tests/ -> crate root is packages/validator-rust; the shared list-validity
    // fixture lives at ../../tests/fixtures/list-validity/cases.json.
    let manifest = env!("CARGO_MANIFEST_DIR");
    Path::new(manifest)
        .join("..")
        .join("..")
        .join("tests")
        .join("fixtures")
        .join("list-validity")
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

#[test]
fn list_engine_matches_fixture() {
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

            let spec = case.get("spec").cloned().unwrap_or(Value::Null);
            let options = ValidateListOptions {
                files: case.get("files").and_then(Value::as_object).cloned(),
                loader: None,
                basepath: None,
            };

            let result = validate_list(&spec, &options);

            let engine = case
                .get("engine")
                .unwrap_or_else(|| panic!("[{}] fixture case missing the `engine` channel", name));

            match engine {
                // engine:"pass" — the structure check completes with no load failure.
                // The Rust structure API returns `Ok(())` for that result, the
                // equivalent of `{ valid: true, errors: [] }` in the other runtimes.
                Value::String(s) if s == "pass" => match &result {
                    Ok(()) => {}
                    Err(e) => failures.push(format!(
                        "[{}] engine:\"pass\" but rejected: {} ({})",
                        name, e.code, e.message
                    )),
                },
                // engine:{code,at} — the load path must reject with this code + trace.
                Value::Object(want) => {
                    let want_code = want.get("code").and_then(Value::as_str).unwrap_or("?");
                    let want_at = want.get("at").and_then(Value::as_str).unwrap_or("?");
                    match &result {
                        Ok(()) => failures.push(format!(
                            "[{}] engine expected LOAD failure {} at {} but the spec passed",
                            name, want_code, want_at
                        )),
                        Err(e) => {
                            let got_code = e.code.as_str();
                            let got_at = e.trace.join(".");
                            if got_code != want_code {
                                failures.push(format!(
                                    "[{}] LOAD code mismatch: want {} got {}",
                                    name, want_code, got_code
                                ));
                            }
                            if got_at != want_at {
                                failures.push(format!(
                                    "[{}] LOAD trace mismatch: want `{}` got `{}`",
                                    name, want_at, got_at
                                ));
                            }
                        }
                    }
                }
                other => failures.push(format!(
                    "[{}] `engine` must be \"pass\" or {{code, at}}, got {}",
                    name, other
                )),
            }
            failures
        }));
    }

    assert!(ran > 0, "no list-validity fixture cases were loaded");
    assert!(
        failures.is_empty(),
        "{}/{} list engine conformance mismatch(es):\n{}",
        failures.len(),
        ran,
        failures.join("\n")
    );
}

#[test]
fn every_case_declares_an_engine_channel() {
    // Every fixture must declare a valid runtime expectation.
    let cases = load_cases();
    for case in &cases {
        let name = case.get("name").and_then(Value::as_str).unwrap_or("?");
        let engine = case
            .get("engine")
            .unwrap_or_else(|| panic!("[{}] missing `engine` channel", name));
        let ok = matches!(engine, Value::String(s) if s == "pass")
            || matches!(engine, Value::Object(m)
                if m.get("code").and_then(Value::as_str).is_some()
                    && m.get("at").and_then(Value::as_str).is_some());
        assert!(
            ok,
            "[{}] `engine` must be \"pass\" or {{code, at}}, got {}",
            name, engine
        );
    }
    assert!(!cases.is_empty(), "fixture is empty");
}
