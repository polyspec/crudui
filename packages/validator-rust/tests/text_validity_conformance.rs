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
    assert!(serde_json::from_str::<Value>(&nested(127)).is_ok());
    assert!(JsonText::parse(&nested(127)).is_ok());
    assert!(serde_json::from_str::<Value>(&nested(128)).is_err());
    assert!(JsonText::parse(&nested(128)).is_err());
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
    assert_eq!(
        (error.code.as_str(), error.trace.join(".")),
        ("INVALID_TEXT", "a".to_owned())
    );
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
