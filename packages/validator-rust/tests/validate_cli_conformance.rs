//! Rust CRUDUI validate CLI — stdin/stdout BOUNDARY conformance.
//!
//! The validate ENGINE is already pinned by tests/validate_conformance.rs.
//! This test owns only the CLI wrapper boundary (src/bin/validate.rs):
//! serialization (stdin JSON → validate → stdout {valid,errors}), exit codes,
//! and the Rust-specific LOAD-failure wire. It does NOT re-verify rule semantics
//! — it asserts the wrapper streams the engine result verbatim and routes a load
//! failure onto the Rust wire, never a valid:false masquerade.
//!
//! It executes Cargo's compiled `validate` binary and sends a UTF-8 request
//! through stdin. A wrong exit code, a missing field or a load error reported as
//! valid fails this test.
//!
//! Failure wire (identical in every language): a load or input failure exits 2
//! with stdout exactly {error, code, at} and no "valid" key. A bad request
//! (no/non-object spec, bad JSON): exit 1, {error} with no "code". The CLI must
//! reproduce the fixture output on stdout.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::{json, Map, Value};

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

/// Canonicalize numbers to f64 so int/float spellings (5 vs 5.0) compare equal.
/// Object key order is preserved (serde_json preserve_order + the fixture is
/// emitted in the same order).
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

struct CliRun {
    code: Option<i32>,
    stdout: String,
    stderr: String,
}

/// Spawn the compiled CLI with the request on stdin (gateway protocol).
fn run_cli(input: &str) -> CliRun {
    let bin = env!("CARGO_BIN_EXE_validate");
    let mut child = Command::new(bin)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn validate CLI");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(input.as_bytes())
        .expect("write stdin");
    let out = child.wait_with_output().expect("wait CLI");
    CliRun {
        code: out.status.code(),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    }
}

fn request_of(case: &Value) -> String {
    let spec = case.get("spec").cloned().unwrap_or(Value::Null);
    let data = case
        .get("data")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));
    let files = case
        .get("files")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));
    let basepath = case
        .get("basepath")
        .cloned()
        .unwrap_or_else(|| Value::String(String::new()));
    json!({
        "spec": spec,
        "data": data,
        "files": files,
        "basepath": basepath,
    })
    .to_string()
}

#[test]
fn cli_boundary_matches_fixture() {
    let cases = load_cases();
    let mut failures: Vec<String> = Vec::new();
    let mut ran = 0usize;

    for case in &cases {
        ran += 1;
        let name = case.get("name").and_then(Value::as_str).unwrap_or("?");
        let run = run_cli(&request_of(case));

        match (case.get("expected"), case.get("expectFailure")) {
            (Some(expected), None) => {
                if run.code != Some(0) {
                    failures.push(format!(
                        "[{}] result case exit: want 0, got {:?} (stderr: {})",
                        name, run.code, run.stderr
                    ));
                    continue;
                }
                let out: Value = match serde_json::from_str(run.stdout.trim()) {
                    Ok(v) => v,
                    Err(e) => {
                        failures.push(format!(
                            "[{}] stdout not JSON: {:?} ({})",
                            name, run.stdout, e
                        ));
                        continue;
                    }
                };
                // Exactly the two contract keys, nothing dropped or added.
                let keys: Vec<&str> = out
                    .as_object()
                    .map(|m| m.keys().map(String::as_str).collect())
                    .unwrap_or_default();
                if !(keys.len() == 2 && keys.contains(&"valid") && keys.contains(&"errors")) {
                    failures.push(format!(
                        "[{}] stdout must carry exactly {{valid, errors}}, got keys {:?}",
                        name, keys
                    ));
                    continue;
                }
                if normalize(expected) != normalize(&out) {
                    failures.push(format!(
                        "[{}] CLI stdout mismatch\n  expected: {}\n  actual:   {}",
                        name, expected, out
                    ));
                }
            }
            (None, Some(expect_failure)) => {
                if run.code != Some(2) {
                    failures.push(format!(
                        "[{}] failure exit: want 2, got {:?} (stderr: {})",
                        name, run.code, run.stderr
                    ));
                    continue;
                }
                let out: Value = match serde_json::from_str(run.stdout.trim()) {
                    Ok(v) => v,
                    Err(e) => {
                        failures.push(format!(
                            "[{}] failure stdout not JSON: {:?} ({})",
                            name, run.stdout, e
                        ));
                        continue;
                    }
                };
                let want = json!({
                    "error": expect_failure.get("message").cloned().unwrap_or(Value::Null),
                    "code": expect_failure.get("code").cloned().unwrap_or(Value::Null),
                    "at": expect_failure.get("at").cloned().unwrap_or(Value::Null),
                });
                if out != want {
                    failures.push(format!(
                        "[{}] failure stdout mismatch\n  expected: {}\n  actual:   {}",
                        name, want, out
                    ));
                }
            }
            _ => failures.push(format!(
                "[{}] case must declare exactly one of expected/expectFailure",
                name
            )),
        }
    }

    assert!(ran > 0, "no CLI fixture cases were loaded");
    assert!(
        failures.is_empty(),
        "{}/{} CLI boundary mismatch(es):\n{}",
        failures.len(),
        ran,
        failures.join("\n")
    );
}

#[test]
fn cli_malformed_empty_stdin_exits_1() {
    let run = run_cli("");
    assert_eq!(
        run.code,
        Some(1),
        "empty stdin must exit 1 (stderr: {})",
        run.stderr
    );
    let out: Value = serde_json::from_str(run.stdout.trim())
        .unwrap_or_else(|e| panic!("malformed stdout not JSON: {:?} ({})", run.stdout, e));
    assert!(
        out.get("error").is_some(),
        "malformed request must carry {{error}}: {}",
        out
    );
    assert!(
        out.get("valid").is_none(),
        "malformed request must not carry \"valid\": {}",
        out
    );
}

#[test]
fn cli_malformed_bad_json_exits_1() {
    let run = run_cli("{not json");
    assert_eq!(run.code, Some(1), "bad JSON must exit 1");
    let out: Value = serde_json::from_str(run.stdout.trim())
        .unwrap_or_else(|e| panic!("bad-JSON stdout not JSON: {:?} ({})", run.stdout, e));
    assert!(
        out.get("error").is_some(),
        "bad JSON must carry {{error}}: {}",
        out
    );
}

#[test]
fn cli_malformed_non_object_spec_exits_1() {
    let run = run_cli(&json!({ "spec": "not-an-object", "data": {} }).to_string());
    assert_eq!(run.code, Some(1), "non-object spec must exit 1");
    let out: Value = serde_json::from_str(run.stdout.trim())
        .unwrap_or_else(|_e| panic!("non-object-spec stdout not JSON: {:?}", run.stdout));
    assert!(
        out.get("error").is_some(),
        "non-object spec must carry {{error}}: {}",
        out
    );
    assert!(
        out.get("valid").is_none(),
        "non-object spec must not carry \"valid\": {}",
        out
    );
}

/// Parse CLI stdout as one JSON value.
fn stdout_json(run: &CliRun) -> Value {
    serde_json::from_str(run.stdout.trim())
        .unwrap_or_else(|e| panic!("stdout not JSON: {:?} ({})", run.stdout, e))
}

#[test]
fn cli_detail_mode_clean_structure_is_valid() {
    let req = json!({
        "mode": "detail",
        "spec": { "fields": { "name": { "field": ".name", "label": "Name" } } }
    });
    let run = run_cli(&req.to_string());
    assert_eq!(
        run.code,
        Some(0),
        "detail success must exit 0 ({})",
        run.stderr
    );
    assert_eq!(stdout_json(&run), json!({ "valid": true, "errors": [] }));
}

#[test]
fn cli_detail_mode_load_failure_exits_2() {
    let req = json!({
        "mode": "detail",
        "spec": { "fields": { "$ref": "missing.yml" } }
    });
    let run = run_cli(&req.to_string());
    assert_eq!(run.code, Some(2), "detail load failure must exit 2");
    let out = stdout_json(&run);
    let keys: Vec<&str> = out
        .as_object()
        .map(|m| m.keys().map(String::as_str).collect())
        .unwrap_or_default();
    assert_eq!(
        keys,
        vec!["error", "code", "at"],
        "failure envelope: {}",
        out
    );
    assert_eq!(out["code"], json!("REF_FILE_NOT_FOUND"));
    assert_eq!(out["at"], json!("missing.yml"));
}

#[test]
fn cli_unsupported_mode_exits_1() {
    for mode in [json!("grid"), json!(1), Value::Null] {
        let req = json!({
            "mode": mode,
            "spec": { "properties": { "name": { "type": "text" } } }
        });
        let run = run_cli(&req.to_string());
        assert_eq!(run.code, Some(1), "mode {} must exit 1", mode);
        assert_eq!(
            stdout_json(&run),
            json!({ "error": "Unsupported validation mode" }),
            "mode {}",
            mode
        );
    }
}

/// Assert a request error: exit 1 and stdout exactly `{"error": message}`.
fn assert_request_error(input: &str, message: &str) {
    let run = run_cli(input);
    assert_eq!(
        run.code,
        Some(1),
        "input {:?} must exit 1 (stdout: {}, stderr: {})",
        input,
        run.stdout,
        run.stderr
    );
    assert_eq!(
        stdout_json(&run),
        json!({ "error": message }),
        "input {:?}",
        input
    );
}

#[test]
fn cli_request_rules_report_exact_messages() {
    let spec = json!({ "properties": { "name": { "type": "text" } } });

    // 1. invalid JSON (no parser detail).
    for input in ["", "{not json", "{\"spec\":"] {
        assert_request_error(input, "Request must be valid JSON");
    }
    // 2. not an object.
    for input in ["[]", "null", "1", "\"spec\""] {
        assert_request_error(input, "Request must be an object");
    }
    // 3. spec absent or not an object.
    for req in [
        json!({}),
        json!({ "spec": null }),
        json!({ "spec": [] }),
        json!({ "spec": "x" }),
    ] {
        assert_request_error(&req.to_string(), "Request spec must be an object");
    }
    // 4. unsupported mode.
    for mode in [json!("grid"), json!(1), Value::Null, json!("Form")] {
        let req = json!({ "spec": spec, "mode": mode });
        assert_request_error(&req.to_string(), "Unsupported validation mode");
    }
    // 5. files not an object.
    for files in [json!([]), json!("x"), json!(1)] {
        let req = json!({ "spec": spec, "files": files });
        assert_request_error(&req.to_string(), "Request files must be an object");
    }
    // 6. a files member not an object.
    for member in [json!("text"), Value::Null, json!([])] {
        let req = json!({ "spec": spec, "files": { "a.yml": member } });
        assert_request_error(&req.to_string(), "Request files must contain objects");
    }
    // 7. basepath not a string.
    for basepath in [json!(1), json!({}), json!(false)] {
        let req = json!({ "spec": spec, "basepath": basepath });
        assert_request_error(&req.to_string(), "Request basepath must be a string");
    }
}

#[test]
fn cli_request_rules_apply_in_order() {
    // Each input breaks several rules; the earliest rule's message wins.
    assert_request_error("[1", "Request must be valid JSON");
    assert_request_error(
        &json!({ "mode": "grid", "files": [], "basepath": 1 }).to_string(),
        "Request spec must be an object",
    );
    assert_request_error(
        &json!({ "spec": {}, "mode": null, "files": [], "basepath": 1 }).to_string(),
        "Unsupported validation mode",
    );
    assert_request_error(
        &json!({ "spec": {}, "mode": "list", "files": 1, "basepath": 1 }).to_string(),
        "Request files must be an object",
    );
    assert_request_error(
        &json!({ "spec": {}, "files": { "a.yml": 1 }, "basepath": 1 }).to_string(),
        "Request files must contain objects",
    );
}

#[test]
fn cli_null_files_and_basepath_mean_none() {
    let req = json!({
        "mode": "detail",
        "spec": { "fields": { "name": { "field": ".name" } } },
        "files": null,
        "basepath": null
    });
    let run = run_cli(&req.to_string());
    assert_eq!(
        run.code,
        Some(0),
        "null files/basepath must pass ({})",
        run.stderr
    );
    assert_eq!(stdout_json(&run), json!({ "valid": true, "errors": [] }));
}

#[test]
fn cli_form_data_must_be_an_object() {
    let spec = json!({ "properties": { "name": { "type": "text" } } });
    for data in [Value::Null, json!([]), json!("x"), json!(1)] {
        let run = run_cli(&json!({ "spec": spec, "data": data }).to_string());
        assert_eq!(run.code, Some(2), "data {} must exit 2", data);
        assert_eq!(
            stdout_json(&run),
            json!({ "error": "Form data must be an object", "code": "INVALID_FORM_INPUT", "at": "" }),
            "data {}",
            data
        );
    }
    // Absent data validates `{}`.
    let run = run_cli(&json!({ "spec": spec }).to_string());
    assert_eq!(
        run.code,
        Some(0),
        "absent data must validate {{}} ({})",
        run.stderr
    );
}
