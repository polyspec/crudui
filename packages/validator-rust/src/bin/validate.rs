//! CRUDUI validate CLI — gateway subprocess (cross-check-console / compare-all).
//!
//! Three modes, switched by stdin `mode` (absent → `"form"`). Any other `mode`
//! value, including a non-string JSON value, is a bad request: exit 1 with
//! `{ "error": "Unsupported validation mode" }` (never a silent fall back to form).
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
//!   detail — STRUCTURAL validation of a detail-spec. Like list, it has no data:
//!     stdin  : `{ "mode": "detail", "spec": {…}, "files"?: {…}, "basepath"?: "…" }`
//!     stdout : `{ "valid": true, "errors": [] }` on a clean structure.
//!     Calls `CRUDUI::detail::validate_detail` for composition and forbidden-key scanning.
//!
//! All modes re-implement nothing and never touch the legacy model
//! (`crate::legacy::validator`, R7 parallel run).
//!
//! Failure envelope (identical in every language, never a `valid:false` result):
//!   - request errors → exit 1, stdout exactly `{ "error": "…" }`, checked in order:
//!     1. stdin is not valid JSON → "Request must be valid JSON"
//!     2. the request is not an object → "Request must be an object"
//!     3. `spec` absent or not an object → "Request spec must be an object"
//!     4. `mode` present and not "form"/"list"/"detail" → "Unsupported validation mode"
//!     5. `files` present, not null and not an object → "Request files must be an object"
//!     6. a `files` member not an object → "Request files must contain objects"
//!     7. `basepath` present, not null and not a string → "Request basepath must be a string"
//!
//!     Absent or null `files`/`basepath` mean none.
//!   - composition load failure (unresolved `$ref` or forbidden meta key) or form
//!     input failure (root, group or repeated data with the wrong shape) → exit 2,
//!     `{ "error": <message>, "code": "…", "at": "…" }`. `at` is the composition
//!     trace joined with `.`, or empty for an input failure.
//!
//! An omitted `data` member validates `{}`; a supplied value is validated as is.

use std::io::{self, Read, Write};

use serde_json::{Map, Value};

use crudui_validator::detail::{validate_detail, ValidateDetailOptions};
use crudui_validator::list::{validate_list, ValidateListOptions};
use crudui_validator::validate::{validate, ValidateOptions, ValidationResult};

fn main() {
    // Request rules, checked in the shared order (each → exit 1, `{ "error" }`).
    // 1. stdin must be valid JSON (an unreadable stdin counts as invalid JSON).
    let mut input_bytes = String::new();
    if io::stdin().read_to_string(&mut input_bytes).is_err() {
        fail_request("Request must be valid JSON");
    }
    let req: Value = match serde_json::from_str(&input_bytes) {
        Ok(v) => v,
        Err(_) => fail_request("Request must be valid JSON"),
    };

    // 2. the request must be an object.
    let req = match req {
        Value::Object(m) => m,
        _ => fail_request("Request must be an object"),
    };

    // 3. `spec` must be present and an object.
    let spec = match req.get("spec") {
        Some(v @ Value::Object(_)) => v.clone(),
        _ => fail_request("Request spec must be an object"),
    };

    // 4. mode: absent → "form"; only "form" | "list" | "detail" are accepted
    // (null and every non-string value included in the rejection).
    let mode = match req.get("mode") {
        None => "form",
        Some(Value::String(s)) if matches!(s.as_str(), "form" | "list" | "detail") => s.as_str(),
        Some(_) => fail_request("Unsupported validation mode"),
    };

    // 5–6. files: absent or null → none; otherwise an object of objects.
    let files = match req.get("files") {
        None | Some(Value::Null) => None,
        Some(Value::Object(m)) => {
            if !m.values().all(Value::is_object) {
                fail_request("Request files must contain objects");
            }
            Some(m.clone())
        }
        Some(_) => fail_request("Request files must be an object"),
    };

    // 7. basepath: absent or null → none; otherwise a string.
    let basepath = match req.get("basepath") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.clone()),
        Some(_) => fail_request("Request basepath must be a string"),
    };

    if mode == "list" || mode == "detail" {
        let result = if mode == "list" {
            validate_list(
                &spec,
                &ValidateListOptions {
                    files,
                    loader: None,
                    basepath,
                },
            )
        } else {
            validate_detail(
                &spec,
                &ValidateDetailOptions {
                    files,
                    loader: None,
                    basepath,
                },
            )
        };
        match result {
            // A list or detail has no data: a clean structure is valid.
            Ok(()) => emit_result(&ValidationResult {
                valid: true,
                errors: Vec::new(),
            }),
            // A composition failure produces no validation result.
            Err(err) => failure(&err.message, err.code.as_str(), &err.trace.join(".")),
        }
    }

    // An omitted `data` member validates an empty object.
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
        // Load and input failures produce no validation result.
        Err(err) => failure(err.message(), err.code(), &err.at()),
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

/// Load or input failure. Exit 2 (distinct from a bad request). `at` is the
/// composition trace joined with `.`, or empty for an input failure.
fn failure(message: &str, code: &str, at: &str) -> ! {
    let obj = serde_json::json!({ "error": message, "code": code, "at": at });
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
