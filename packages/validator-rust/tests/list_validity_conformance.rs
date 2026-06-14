//! CRUDUI list-spec STRUCTURAL conformance (schema §9) — the read sister of the
//! crudui load-path conformance.
//!
//! Single truth = the shared fixture tests/fixtures/list-validity/cases.json,
//! the SAME file the JS meta-schema gate reads
//! (`packages/validator-ts/src/list-metaschema.conformance.test.ts`). That
//! fixture carries TWO independent expectation channels, one per gate:
//!
//!   - `expect` / `reason` — the META-SCHEMA (ajv) channel: a list-spec's
//!     JSON-Schema shape (1급 닫힘 `additionalProperties`, `enum`, `anyOf`,
//!     `required`). NOT this test's concern (schema §8: the engine does no
//!     JSON-Schema validation).
//!   - `engine` — the 4-LANGUAGE ENGINE channel, the contract THIS test pins.
//!     `"pass"` means compose + forbidden-scan let the spec through (a valid
//!     spec, OR a meta-schema-only shape violation the engine does not own).
//!     `{ code, at }` means compose/forbidden-scan reject it as a LOAD failure
//!     with this `ComposeErrorCode` and this dotted trace path.
//!
//! The list engine = the form load path's first two passes REUSED verbatim
//! (`crate::list::validate_list` = compose → forbidden-scan); list has no data
//! (rows are injected, §9.1), so the DATA pass does not apply. A future JS engine
//! test consumes the SAME `engine` field the SAME way — this is the cross-language
//! contract, isomorphic by construction.
//!
//! Do not weaken assertions to force GREEN. If Rust disagrees with the fixture,
//! the fixture is NOT the engine's output and the cross-language contract is
//! broken — fix the engine or the fixture at the shared source, not this test.

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
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("read fixture {:?}: {}", path, e));
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
        let name = case.get("name").and_then(Value::as_str).unwrap_or("?");

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
            // engine:"pass" — the load path must NOT reject (valid OR a
            // meta-schema-only shape the engine does not own).
            Value::String(s) if s == "pass" => {
                if let Err(e) = &result {
                    failures.push(format!(
                        "[{}] engine:\"pass\" but rejected: {} ({})",
                        name, e.code, e.message
                    ));
                }
            }
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
    // The cross-language engine contract is load-bearing: a case with no `engine`
    // field would silently escape the gate. Pin its presence + shape.
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
