//! CLI for the cross-language test runner.
//! Reads {"spec": {...}, "input": <value>} from stdin and writes
//! {"valid": bool, "error": <rule|null>, "field": <path|null>} to stdout.
//! Ports validator-go/cmd/validate/main.go.

use crudui_validator::legacy::run_validation;
use serde_json::Value;
use std::io::{self, Read, Write};

fn main() {
    let mut input_bytes = String::new();
    if let Err(e) = io::stdin().read_to_string(&mut input_bytes) {
        output_error(&format!("Failed to read stdin: {}", e));
        return;
    }

    let req: Value = match serde_json::from_str(&input_bytes) {
        Ok(v) => v,
        Err(e) => {
            output_error(&format!("Failed to parse JSON: {}", e));
            return;
        }
    };

    let spec = match req.get("spec") {
        Some(s) => s,
        None => {
            output_error("Missing 'spec'");
            return;
        }
    };
    let input = req.get("input").cloned().unwrap_or(Value::Null);

    let resp = run_validation(spec, &input);
    output_json(resp.valid, resp.error, resp.field);
}

fn output_json(valid: bool, error: Option<String>, field: Option<String>) {
    let obj = serde_json::json!({
        "valid": valid,
        "error": error,
        "field": field,
    });
    let s = serde_json::to_string(&obj).unwrap_or_else(|_| "{}".to_string());
    let stdout = io::stdout();
    let mut handle = stdout.lock();
    let _ = writeln!(handle, "{}", s);
}

fn output_error(msg: &str) {
    let obj = serde_json::json!({
        "valid": false,
        "error": msg,
        "field": Value::Null,
    });
    let s = serde_json::to_string(&obj).unwrap_or_else(|_| "{}".to_string());
    println!("{}", s);
    std::process::exit(1);
}
