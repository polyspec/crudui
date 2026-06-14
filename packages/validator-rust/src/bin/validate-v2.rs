//! v2 validate CLI — gateway subprocess (cross-check-console / compare-all).
//!
//! Contract (mirrors JS `validateV2`, Go `validate.Validate`):
//!   stdin  : `{ "spec": {…}, "data": {…}, "files"?: {…}, "basepath"?: "…" }`
//!   stdout : `{ "valid": bool, "errors": [{ path, field, rule, message, value }] }`
//!
//! Reuses the v2 pipeline verbatim (`v2::validate::validate_v2`:
//! compose → forbidden-scan → validate). It re-implements nothing and never
//! touches the v1 model (`crate::validator`, R7 parallel run).
//!
//! Error envelope (always exit 1, never a `valid:false` masquerade):
//!   - stdin/JSON parse failure → `{ "error": "…" }`
//!   - composition LOAD failure (`ComposeLoadError`, e.g. unresolved `$ref`) →
//!     `{ "error": "…", "code": "…" }` — a LOAD failure is NOT `valid:false`.
//!
//! Distinct exit codes let the gateway tell a bad request from a load failure
//! without parsing the message.

use std::io::{self, Read, Write};

use serde_json::{Map, Value};

use formspec_validator::v2::validate::{validate_v2, ValidateV2Options, ValidationResult};

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
    // `data` defaults to an empty object (JS `data ?? {}`).
    let data = req
        .get("data")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));

    let files = req
        .get("files")
        .and_then(Value::as_object)
        .cloned();
    let basepath = req
        .get("basepath")
        .and_then(Value::as_str)
        .map(str::to_string);

    let options = ValidateV2Options {
        files,
        loader: None,
        basepath,
    };

    match validate_v2(&spec, &data, &options) {
        Ok(result) => emit_result(&result),
        // ComposeLoadError is a LOAD failure (e.g. unresolved $ref), NOT a
        // validation failure. Surface it as an error envelope, never valid:false.
        Err(err) => fail_load(&err.to_string(), err.code.as_str()),
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

/// Composition LOAD failure. Exit 2 (distinct from a bad request).
fn fail_load(msg: &str, code: &str) -> ! {
    let obj = serde_json::json!({ "error": msg, "code": code });
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
