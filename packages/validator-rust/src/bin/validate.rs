//! CRUDUI validate CLI — gateway subprocess (cross-check-console / compare-all).
//!
//! Two modes, switched by stdin `mode` (default `"form"`):
//!
//!   form (default) — DATA validation of a crudui:
//!     stdin  : `{ "spec": {…}, "data": {…}, "files"?: {…}, "basepath"?: "…" }`
//!     stdout : `{ "valid": bool, "errors": [{ path, field, rule, message, value }] }`
//!     Reuses `CRUDUI::validate::validate` (compose → forbidden-scan → validate).
//!
//!   list — STRUCTURAL validation of a list-spec (SPEC §9). A list has no data
//!     (rows are injected, §9.1), so only the load path's first two passes apply:
//!     stdin  : `{ "mode": "list", "spec": {…}, "files"?: {…}, "basepath"?: "…" }`
//!     stdout : `{ "valid": true, "errors": [] }` on a clean structure.
//!     Calls `CRUDUI::list::validate_list` for composition and forbidden-key scanning.
//!
//! Both modes re-implement nothing and never touch the legacy model
//! (`crate::legacy::validator`, R7 parallel run).
//!
//! Error envelope (never a `valid:false` masquerade):
//!   - stdin/JSON parse / missing spec → exit 1, `{ "error": "…" }`
//!   - composition LOAD failure (`ComposeLoadError`, e.g. unresolved `$ref`, OR a
//!     forbidden meta key) → exit 2, `{ "error": "…", "code": "…", "at": "…" }`.
//!     A LOAD failure is NOT `valid:false`; `at` is the dotted trace to the
//!     offending node (empty when the error carries no trace).
//!
//! Distinct exit codes let the gateway tell a bad request from a load failure
//! without parsing the message.

use std::io::{self, Read, Write};

use serde_json::{Map, Value};

use crudui_validator::list::{validate_list, ValidateListOptions};
use crudui_validator::validate::{validate, ValidateOptions, ValidationResult};

fn main() {
    let mut input_bytes = String::new();
    if let Err(e) = io::stdin().read_to_string(&mut input_bytes) {
        fail_request(&format!("Failed to read stdin: {}", e));
    }

    let req: Value = match serde_json::from_str(&input_bytes) {
        Ok(v) => v,
        Err(e) => fail_request(&format!("Failed to parse JSON: {}", e)),
    };

    let spec = req.get("spec").cloned().unwrap_or(Value::Null);
    if !spec.is_object() {
        fail_request("Missing or non-object 'spec'");
    }

    let files = req.get("files").and_then(Value::as_object).cloned();
    let basepath = req
        .get("basepath")
        .and_then(Value::as_str)
        .map(str::to_string);

    // mode: "form" (default, DATA validate) | "list" (structural compose+scan).
    let mode = req.get("mode").and_then(Value::as_str).unwrap_or("form");

    if mode == "list" {
        let options = ValidateListOptions {
            files,
            loader: None,
            basepath,
        };
        match validate_list(&spec, &options) {
            // A list has no data: a clean structure is unconditionally valid.
            Ok(()) => emit_result(&ValidationResult {
                valid: true,
                errors: Vec::new(),
            }),
            // ComposeLoadError (unresolved $ref OR forbidden meta key) is a LOAD
            // failure, never a validation result. Carry the dotted trace in `at`.
            Err(err) => fail_load(&err.to_string(), err.code.as_str(), &err.trace.join(".")),
        }
    }

    // `data` defaults to an empty object (JS `data ?? {}`).
    let data = req
        .get("data")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));

    let options = ValidateOptions {
        files,
        loader: None,
        basepath,
    };

    match validate(&spec, &data, &options) {
        Ok(result) => emit_result(&result),
        // ComposeLoadError is a LOAD failure (e.g. unresolved $ref), NOT a
        // validation failure. Surface it as an error envelope, never valid:false.
        Err(err) => fail_load(&err.to_string(), err.code.as_str(), &err.trace.join(".")),
    }
}

/// Serialize a successful run to the `{ valid, errors }` contract on stdout.
fn emit_result(result: &ValidationResult) -> ! {
    let errors: Vec<Value> = result.errors.iter().map(|e| e.to_value()).collect();
    let obj = serde_json::json!({
        "valid": result.valid,
        "errors": errors,
    });
    write_line(&obj);
    std::process::exit(0);
}

/// Bad request (unreadable stdin / unparseable JSON / missing spec). Exit 1.
fn fail_request(msg: &str) -> ! {
    let obj = serde_json::json!({ "error": msg });
    write_line(&obj);
    std::process::exit(1);
}

/// Composition LOAD failure. Exit 2 (distinct from a bad request). `at` is the
/// dotted trace to the offending node (empty when the error carries no trace).
fn fail_load(msg: &str, code: &str, at: &str) -> ! {
    let obj = serde_json::json!({ "error": msg, "code": code, "at": at });
    write_line(&obj);
    std::process::exit(2);
}

/// Write one JSON line to stdout (a trailing newline; serde never fails here).
fn write_line(obj: &Value) {
    let s = serde_json::to_string(obj).unwrap_or_else(|_| "{}".to_string());
    let stdout = io::stdout();
    let mut handle = stdout.lock();
    let _ = writeln!(handle, "{}", s);
}
