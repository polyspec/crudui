//! Rust CRUDUI validate CLI — stdin/stdout BOUNDARY conformance.
//!
//! The validate ENGINE is already pinned by tests/validate_conformance.rs.
//! This test owns only the CLI wrapper boundary (src/bin/validate.rs):
//! serialization (stdin JSON → validate → stdout {valid,errors}), exit codes,
//! and the Rust-specific LOAD-failure wire. It does NOT re-verify rule semantics
//! — it asserts the wrapper streams the engine result verbatim and routes a load
//! failure onto the Rust wire, never a valid:false masquerade.
//!
//! It spawns the REAL compiled binary (Cargo's CARGO_BIN_EXE_validate) exactly
//! as the cross-check gateway runs it: request piped on stdin, utf-8. A wire
//! regression (wrong exit, dropped field, LOAD leaking as valid) turns this red —
//! exactly what the gateway hits at runtime.
//!
//! Rust LOAD wire (distinct exit from JS/Go): exit 2, stdout {error, code}, NO
//! "valid" key. A bad request (no/non-object spec, bad JSON): exit 1, {error}
//! with no "code". Do not weaken assertions — the fixture is the JS reference
//! engine's own output; the CLI must reproduce it verbatim on stdout.

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
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("read fixture {:?}: {}", path, e));
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

        match (case.get("expected"), case.get("expectLoadError")) {
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
                        failures.push(format!("[{}] stdout not JSON: {:?} ({})", name, run.stdout, e));
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
            (None, Some(expect_load_error)) => {
                let want = expect_load_error
                    .get("code")
                    .and_then(Value::as_str)
                    .unwrap_or("?");
                // Rust LOAD wire: exit 2, {error, code}, NO "valid" key.
                if run.code != Some(2) {
                    failures.push(format!(
                        "[{}] LOAD case exit: want 2, got {:?} (stderr: {})",
                        name, run.code, run.stderr
                    ));
                    continue;
                }
                let out: Value = match serde_json::from_str(run.stdout.trim()) {
                    Ok(v) => v,
                    Err(e) => {
                        failures.push(format!("[{}] LOAD stdout not JSON: {:?} ({})", name, run.stdout, e));
                        continue;
                    }
                };
                if out.get("valid").is_some() {
                    failures.push(format!(
                        "[{}] LOAD failure must not carry a \"valid\" key: {}",
                        name, out
                    ));
                    continue;
                }
                let got = out.get("code").and_then(Value::as_str).unwrap_or("?");
                if got != want {
                    failures.push(format!(
                        "[{}] LOAD code mismatch: want {} got {} ({})",
                        name, want, got, out
                    ));
                }
                if out.get("error").and_then(Value::as_str).unwrap_or("").is_empty() {
                    failures.push(format!(
                        "[{}] LOAD failure must carry a non-empty error message: {}",
                        name, out
                    ));
                }
            }
            _ => failures.push(format!(
                "[{}] case has neither (or both) expected/expectLoadError",
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
    assert_eq!(run.code, Some(1), "empty stdin must exit 1 (stderr: {})", run.stderr);
    let out: Value = serde_json::from_str(run.stdout.trim())
        .unwrap_or_else(|e| panic!("malformed stdout not JSON: {:?} ({})", run.stdout, e));
    assert!(out.get("error").is_some(), "malformed request must carry {{error}}: {}", out);
    assert!(out.get("valid").is_none(), "malformed request must not carry \"valid\": {}", out);
}

#[test]
fn cli_malformed_bad_json_exits_1() {
    let run = run_cli("{not json");
    assert_eq!(run.code, Some(1), "bad JSON must exit 1");
    let out: Value = serde_json::from_str(run.stdout.trim())
        .unwrap_or_else(|e| panic!("bad-JSON stdout not JSON: {:?} ({})", run.stdout, e));
    assert!(out.get("error").is_some(), "bad JSON must carry {{error}}: {}", out);
}

#[test]
fn cli_malformed_non_object_spec_exits_1() {
    let run = run_cli(&json!({ "spec": "not-an-object", "data": {} }).to_string());
    assert_eq!(run.code, Some(1), "non-object spec must exit 1");
    let out: Value = serde_json::from_str(run.stdout.trim())
        .unwrap_or_else(|_e| panic!("non-object-spec stdout not JSON: {:?}", run.stdout));
    assert!(out.get("error").is_some(), "non-object spec must carry {{error}}: {}", out);
    assert!(out.get("valid").is_none(), "non-object spec must not carry \"valid\": {}", out);
}
