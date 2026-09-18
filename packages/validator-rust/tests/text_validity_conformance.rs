//! Input text conformance for the Rust validator. The validation families of
//! tests/fixtures/text-validity are JSON text with unpaired surrogate escapes;
//! `JsonText` reads them and the JSON text entry points report the failure each
//! case declares.

mod common;

use std::path::PathBuf;

use serde_json::{json, Value};

use crudui_validator::text::{self, JsonString, JsonText};

fn fixture(feature: &str) -> (String, Vec<JsonText>) {
    let relative = format!("tests/fixtures/text-validity/{feature}/cases.json");
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(&relative);
    let source = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {path:?}: {e}"));
    assert!(
        serde_json::from_str::<Value>(&source).is_err(),
        "the fixture carries unpaired surrogate escapes"
    );
    match JsonText::parse(&source).expect("fixture JSON text") {
        JsonText::Array(cases) => (relative, cases),
        _ => panic!("fixture is not an array"),
    }
}

fn outcome(result: Result<Value, crudui_validator::ValidateError>) -> Value {
    match result {
        Ok(value) => value,
        Err(error) => json!({"code": error.code(), "message": error.message(), "at": error.at()}),
    }
}

#[test]
fn input_text_matches_fixture() {
    let clean = || json!({"valid": true, "errors": []});
    let mut ran = 0;
    let mut failures = Vec::new();
    for feature in ["validate", "validateList", "validateDetail"] {
        let (relative, cases) = fixture(feature);
        assert!(!cases.is_empty());
        for case in &cases {
            let name = case.get("name").and_then(|n| match n {
                JsonText::String(JsonString::Text(name)) => Some(name.clone()),
                _ => None,
            });
            let name = name.expect("case name");
            ran += 1;
            failures.extend(common::prove_case(feature, &relative, &name, || {
                let spec = case.get("spec").expect("spec");
                let files = case.get("files");
                let basepath = case.get("options").and_then(|options| options.get("basepath"));
                let actual = outcome(match feature {
                    "validate" => text::validate_text(spec, case.get("data"), files, basepath).map(|result| {
                        json!({"valid": result.valid, "errors": result.errors.iter().map(|e| e.to_value()).collect::<Vec<_>>()})
                    }),
                    "validateList" => text::validate_list_text(spec, files, basepath).map(|()| clean()),
                    _ => text::validate_detail_text(spec, files, basepath).map(|()| clean()),
                });
                let expected = case.get("expect").and_then(JsonText::to_value).expect("expect");
                if actual == expected {
                    Vec::new()
                } else {
                    vec![format!("{feature}/{name}: got {actual}, want {expected}")]
                }
            }));
        }
    }
    assert!(ran > 0);
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn json_text_reads_what_serde_json_reads() {
    for source in [
        r#"{"a":[1,-2.5e3,0,true,false,null,{"b":"\u00e9\ud83d\ude00\n\/"}],"a":"last","c":"中"}"#,
        " [ ] ",
        "123",
        r#""\u0000""#,
    ] {
        let expected: Value = serde_json::from_str(source).unwrap();
        let parsed = JsonText::parse(source).unwrap();
        assert_eq!(parsed.to_value(), Some(expected.clone()), "{source}");
        assert_eq!(parsed.shape(), expected, "{source}");
        assert_eq!(parsed.invalid_path(), None);
    }
    for source in [
        "",
        "{",
        "[1,]",
        "01",
        "1.",
        "-",
        "\"\\x\"",
        "\"a\u{1}\"",
        "{} {}",
        "{\"a\" 1}",
        "tru",
        "\"\\u12\"",
    ] {
        assert!(serde_json::from_str::<Value>(source).is_err(), "{source}");
        assert!(JsonText::parse(source).is_err(), "{source}");
    }
    let nested = |depth: usize| format!("{}{}", "[".repeat(depth), "]".repeat(depth));
    // serde_json has a hard limit of 128 nesting levels
    assert!(serde_json::from_str::<Value>(&nested(127)).is_ok());
    assert!(JsonText::parse(&nested(127)).is_ok());
    assert!(serde_json::from_str::<Value>(&nested(128)).is_err());
    // JsonText now supports up to 512 levels
    assert!(JsonText::parse(&nested(512)).is_ok());
    assert!(JsonText::parse(&nested(513)).is_err());
}

#[test]
fn json_text_locates_invalid_text() {
    let parsed =
        JsonText::parse(r#"{"z":["ok","\udc00\ud800"],"\uffff":{"x":"\ud800"},"😀":"\ud800"}"#)
            .unwrap();
    assert_eq!(
        parsed.invalid_path(),
        Some(vec!["z".to_owned(), "1".to_owned()])
    );
    let ordered = JsonText::parse(r#"{"😀":"\ud800","\uffff":{"x":"\ud800"}}"#).unwrap();
    assert_eq!(
        ordered.invalid_path(),
        Some(vec!["\u{ffff}".to_owned(), "x".to_owned()])
    );
    assert_eq!(parsed.to_value(), None);
    assert_eq!(parsed.shape()["z"], json!(["ok", ""]));
    let named = JsonText::parse(r#"{"a":{"\ud800":1,"\ud800":{}},"b":"\ud800"}"#).unwrap();
    assert_eq!(named.invalid_path(), Some(vec!["a".to_owned()]));
    // A repeated invalid name keeps one member, whose value is the last.
    assert_eq!(named.shape()["a"].as_object().unwrap().len(), 1);
    assert_eq!(
        text::check_inputs(&[("data", Some(&named))])
            .unwrap_err()
            .message,
        "Text must be Unicode scalar values: data.a"
    );
    let error = text::check_specification(None, Some(&named)).unwrap_err();
    match error {
        crudui_validator::ValidateError::Load(load_error) => {
            assert_eq!(load_error.code.as_str(), "INVALID_TEXT");
            assert_eq!(load_error.trace.join("."), "a");
        }
        _ => panic!("expected Load error"),
    }
    // A number serde_json refuses fails after the text checks.
    let spec = JsonText::parse(r#"{"type":"group","properties":{}}"#).unwrap();
    let data = JsonText::parse(r#"{"n":1e400}"#).unwrap();
    assert_eq!(
        text::validate_text(&spec, Some(&data), None, None)
            .unwrap_err()
            .code(),
        "INVALID_FORM_INPUT"
    );
}

#[test]
fn value_graph_limits() {
    use std::fs;
    use std::path::PathBuf;

    // Load value-graphs.json
    let relative = "tests/fixtures/text-validity/value-graphs.json";
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(relative);
    let source = fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {path:?}: {e}"));

    let cases = match JsonText::parse(&source).expect("value-graphs.json") {
        JsonText::Array(cases) => cases,
        _ => panic!("fixture is not an array"),
    };

    // Helper to build a chain of nested JsonText arrays
    fn build_chain_json_text(depth: usize, leaf: &str) -> JsonText {
        let mut value = JsonText::String(JsonString::Text(leaf.to_string()));
        for _ in 0..depth {
            value = JsonText::Array(vec![value]);
        }
        value
    }

    // Helper to build a flat JsonText list
    fn build_flat_json_text(size: usize, leaf: &str) -> JsonText {
        let items = vec![JsonText::String(JsonString::Text(leaf.to_string())); size];
        JsonText::Array(items)
    }

    let buildable = [
        "nesting-at-limit",
        "nesting-beyond-limit",
        "nodes-at-limit",
        "nodes-beyond-limit",
    ];
    let mut ran = 0;
    let mut failures = Vec::new();

    for case in &cases {
        let name = case.get("name").and_then(|n| match n {
            JsonText::String(JsonString::Text(name)) => Some(name.clone()),
            _ => None,
        });
        let name = name.expect("case name");

        if !buildable.iter().any(|b| b == &name) {
            continue;
        }

        ran += 1;

        let spec = case.get("spec").expect("spec");
        let mut data = case.get("data").cloned().unwrap_or(JsonText::Null);
        let graph = case.get("graph").expect("graph");

        // Get graph parameters
        let at = match graph.get("at") {
            Some(JsonText::Array(path)) => path
                .iter()
                .filter_map(|p| match p {
                    JsonText::String(JsonString::Text(s)) => Some(s.clone()),
                    _ => None,
                })
                .collect::<Vec<_>>(),
            _ => continue,
        };

        let shape = graph
            .get("shape")
            .and_then(|s| match s {
                JsonText::String(JsonString::Text(s)) => Some(s.as_str()),
                _ => None,
            })
            .unwrap_or("");

        let size = graph
            .get("size")
            .and_then(|s| match s {
                JsonText::Number(n) => n.parse::<usize>().ok(),
                _ => None,
            })
            .unwrap_or(0);

        let leaf = graph
            .get("leaf")
            .and_then(|l| match l {
                JsonText::String(JsonString::Text(s)) => Some(s.clone()),
                _ => None,
            })
            .unwrap_or_else(|| "x".to_string());

        // Build the graph value as JsonText
        let graph_value = match shape {
            "chain" => build_chain_json_text(size, &leaf),
            "flat" => build_flat_json_text(size, &leaf),
            _ => continue, // Skip doubled and self-twice
        };

        // Place the graph value at the specified path
        if at.len() == 2 && at[0] == "data" {
            if let JsonText::Object(ref mut members) = data {
                let key = JsonString::Text(at[1].clone());
                if let Some(pos) = members.iter().position(|(n, _)| n == &key) {
                    members[pos].1 = graph_value;
                } else {
                    members.push((key, graph_value));
                }
            }
        } else {
            continue; // Skip more complex paths for now
        }

        // Run validation
        let result = text::validate_text(spec, Some(&data), None, None);

        let actual = match result {
            Ok(validation_result) => {
                json!({"valid": validation_result.valid, "errors": validation_result.errors.iter().map(|e| e.to_value()).collect::<Vec<_>>()})
            }
            Err(error) => {
                json!({"code": error.code(), "message": error.message(), "at": error.at()})
            }
        };
        let expected = case
            .get("expect")
            .and_then(JsonText::to_value)
            .expect("expect");

        if actual != expected {
            failures.push(format!(
                "value-graphs/{}: got {}, want {}",
                name, actual, expected
            ));
        }
    }

    assert_eq!(
        ran,
        buildable.len(),
        "every buildable value-graph case runs"
    );
    if !failures.is_empty() {
        panic!("{}", failures.join("\n"));
    }
}
