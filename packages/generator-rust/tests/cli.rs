use std::io::Write;
use std::process::{Command, Stdio};

use serde_json::{json, Value};

fn execute(source: &str) -> (bool, Value) {
    let mut process = Command::new(env!("CARGO_BIN_EXE_generate"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    process
        .stdin
        .take()
        .unwrap()
        .write_all(source.as_bytes())
        .unwrap();
    let output = process.wait_with_output().unwrap();
    assert!(
        output.stderr.is_empty(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    (
        output.status.success(),
        serde_json::from_slice(&output.stdout).unwrap(),
    )
}

#[test]
fn cli_reports_failed_operations_without_changing_state() {
    let (success,template)=execute(&json!({"operation":"compileForm","spec":{"type":"group","properties":{"rows":{"type":"text","multiple":true}}}}).to_string());
    assert!(success);
    let (success,result)=execute(&json!({"operation":"form","template":template,"data":{"rows":{"row_a":"A","row_b":"B"}},"actions":[
        {"method":"addRow","args":["rows",{"key":"row_a"}]},
        {"method":"moveRow","args":["rows","row_b",0]},
        {"method":"rekeyRow","args":["rows","row_b","saved_row"]}
    ]}).to_string());
    assert!(success);
    assert_eq!(result["steps"][0]["error"]["code"], "INVALID_FORM_INPUT");
    assert_eq!(result["steps"][0]["revision"], 0);
    assert_eq!(
        result["steps"][0]["data"],
        json!({"rows":{"row_a":"A","row_b":"B"}})
    );
    assert_eq!(result["steps"][1]["revision"], 1);
    assert_eq!(result["revision"], 2);
    assert_eq!(
        result["data"]["rows"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec!["saved_row", "row_a"]
    );
    assert_eq!(result["html"], result["steps"][2]["html"]);
}

#[test]
fn cli_rejects_trailing_or_malformed_json_and_missing_operations() {
    for source in ["{} {}", "{", "{}", "null", "[]"] {
        let (success, result) = execute(source);
        assert!(!success);
        assert_eq!(result["error"]["code"], "INVALID_FORM_INPUT");
        assert!(result["error"]["message"].is_string());
        assert!(result["error"]["at"].is_string());
    }
}

#[test]
fn cli_compile_failure_has_a_nonzero_exit_status() {
    let (success,result)=execute(&json!({"operation":"compileForm","spec":{"type":"group","properties":{"$ref":"missing.json"}}}).to_string());
    assert!(!success);
    assert_eq!(result["error"]["code"], "REF_FILE_NOT_FOUND");
}
