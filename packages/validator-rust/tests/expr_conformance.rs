//! CRUDUI expression-engine conformance (expressions.md §9 three-stage check):
//!   (1) lexer(expr)  == fixture tokens
//!   (2) parser(toks) == fixture ast
//!   (3) evaluate / evaluateValue == fixture truthy / value
//!
//! The shared fixture tests/fixtures/expr/cases.json defines the expected tokens,
//! syntax tree and evaluation result for every runtime.

mod common;

const FEATURE: &str = "validate";
const FIXTURE: &str = "tests/fixtures/expr/cases.json";

use crudui_validator::expr::Expression;
use serde_json::Value;
use std::path::{Path, PathBuf};

fn fixture_path() -> PathBuf {
    // tests/expr_conformance.rs -> crate root is packages/validator-rust;
    // the shared expr fixture lives at ../../tests/fixtures/expr/cases.json.
    let manifest = env!("CARGO_MANIFEST_DIR");
    Path::new(manifest)
        .join("..")
        .join("..")
        .join("tests")
        .join("fixtures")
        .join("expr")
        .join("cases.json")
}

/// Canonicalize for cross-language equality: numbers → f64 (so 0 and 0.0, 1 and
/// 1.0 match; JSON loses the int/float distinction), arrays preserve order,
/// objects compared key-wise (recursively normalized).
fn normalize(v: &Value) -> Value {
    match v {
        Value::Number(n) => {
            let f = n.as_f64().unwrap_or(0.0);
            Value::from(f)
        }
        Value::Array(items) => Value::Array(items.iter().map(normalize).collect()),
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (k, val) in map {
                out.insert(k.clone(), normalize(val));
            }
            Value::Object(out)
        }
        other => other.clone(),
    }
}

/// Value equality tolerant of int/float spelling (JSON loses the distinction).
fn value_equals(expected: &Value, actual: &Value) -> bool {
    normalize(expected) == normalize(actual)
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

/// One record per fixture entry: its tokens, syntax tree and every evaluation
/// sub-case must all match.
#[test]
fn expression_fixture_matches() {
    let cases = load_cases();
    let mut failures: Vec<String> = Vec::new();

    for spec in &cases {
        let name = spec
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_else(|| panic!("fixture case missing name"));
        failures.extend(common::prove_case(FEATURE, FIXTURE, name, || {
            let mut failures: Vec<String> = Vec::new();
            let expr = spec
                .get("expr")
                .and_then(Value::as_str)
                .unwrap_or_else(|| panic!("[{}] case missing expr", name));

            // (1) lexer
            let expected = spec
                .get("tokens")
                .unwrap_or_else(|| panic!("[{}] case missing tokens", name));
            match Expression::tokenize(expr) {
                Ok(tokens) => {
                    let actual = Value::Array(tokens.iter().map(|t| t.to_value()).collect());
                    if normalize(expected) != normalize(&actual) {
                        failures.push(format!(
                            "[{}] tokens mismatch for `{}`\n  expected: {}\n  actual:   {}",
                            name, expr, expected, actual
                        ));
                    }
                }
                Err(e) => failures.push(format!("[{}] lex: {}", name, e)),
            }

            // (2) parser
            let expected = spec
                .get("ast")
                .unwrap_or_else(|| panic!("[{}] case missing ast", name));
            match Expression::parse(expr) {
                Ok(ast) => {
                    let actual = ast.to_value();
                    if normalize(expected) != normalize(&actual) {
                        failures.push(format!(
                            "[{}] AST mismatch for `{}`\n  expected: {}\n  actual:   {}",
                            name, expr, expected, actual
                        ));
                    }
                }
                Err(e) => failures.push(format!("[{}] parse: {}", name, e)),
            }

            // (3) evaluation sub-cases
            let empty: Vec<Value> = Vec::new();
            let case_list = spec
                .get("cases")
                .and_then(Value::as_array)
                .unwrap_or(&empty);
            for (i, case) in case_list.iter().enumerate() {
                let data = case.get("data").cloned().unwrap_or(Value::Null);
                let current_path: Vec<String> = case
                    .get("currentPath")
                    .and_then(Value::as_array)
                    .map(|a| {
                        a.iter()
                            .map(|x| x.as_str().unwrap_or_default().to_string())
                            .collect()
                    })
                    .unwrap_or_default();

                let exp_value = case.get("value").cloned().unwrap_or(Value::Null);
                let exp_truthy = case.get("truthy").and_then(Value::as_bool).unwrap_or(false);

                match Expression::evaluate_value(expr, &data, &current_path) {
                    Ok(value) if !value_equals(&exp_value, &value) => failures.push(format!(
                        "[{}] value mismatch case {}: `{}` data={} expected={} got={}",
                        name, i, expr, data, exp_value, value
                    )),
                    Ok(_) => {}
                    Err(e) => failures.push(format!("[{}] eval_value case {}: {}", name, i, e)),
                }

                match Expression::evaluate(expr, &data, &current_path) {
                    Ok(truthy) if truthy != exp_truthy => failures.push(format!(
                        "[{}] truthy mismatch case {}: `{}` data={} expected={} got={}",
                        name, i, expr, data, exp_truthy, truthy
                    )),
                    Ok(_) => {}
                    Err(e) => failures.push(format!("[{}] eval case {}: {}", name, i, e)),
                }
            }
            failures
        }));
    }

    assert!(!cases.is_empty(), "no expr fixture cases were loaded");
    assert!(
        failures.is_empty(),
        "{} expression mismatch(es):\n{}",
        failures.len(),
        failures.join("\n")
    );
}

// --- targeted unit checks beyond the shared fixture --------------------------

#[test]
fn condition_map_resolves_in_declaration_order() {
    use crudui_validator::expr::condition_map;

    let entries = vec![
        (".tier == 'gold'".to_string(), Value::from("premium")),
        (".tier == 'silver'".to_string(), Value::from("standard")),
        ("true".to_string(), Value::from("basic")),
    ];

    let cp = vec!["x".to_string()];
    assert_eq!(
        condition_map::resolve(&entries, &serde_json::json!({"tier":"gold","x":1}), &cp),
        Some(Value::from("premium"))
    );
    assert_eq!(
        condition_map::resolve(&entries, &serde_json::json!({"tier":"silver","x":1}), &cp),
        Some(Value::from("standard"))
    );
    assert_eq!(
        condition_map::resolve(&entries, &serde_json::json!({"tier":"bronze","x":1}), &cp),
        Some(Value::from("basic"))
    );

    // No default key, no match -> None.
    let no_default = vec![(".a == 1".to_string(), Value::from("one"))];
    assert_eq!(
        condition_map::resolve(&no_default, &serde_json::json!({"a":9,"x":1}), &cp),
        None
    );
}

#[test]
fn condition_map_default_does_not_short_circuit() {
    use crudui_validator::expr::condition_map;

    let entries = vec![
        ("true".to_string(), Value::from("fallback")),
        (".tier == 'gold'".to_string(), Value::from("premium")),
    ];
    let cp = vec!["x".to_string()];
    assert_eq!(
        condition_map::resolve(&entries, &serde_json::json!({"tier":"gold","x":1}), &cp),
        Some(Value::from("premium"))
    );
    assert_eq!(
        condition_map::resolve(&entries, &serde_json::json!({"tier":"none","x":1}), &cp),
        Some(Value::from("fallback"))
    );
}

#[test]
fn ternary_returns_raw_branch_value() {
    let cp: Vec<String> = vec!["x".to_string()];

    assert_eq!(
        Expression::evaluate_value(
            ".big ? 'huge' : 'tiny'",
            &serde_json::json!({"big":true,"x":1}),
            &cp
        )
        .unwrap(),
        Value::from("huge")
    );
    assert_eq!(
        Expression::evaluate_value(
            ".a ? 'A' : .b ? 'B' : 'C'",
            &serde_json::json!({"a":false,"b":true,"x":1}),
            &cp
        )
        .unwrap(),
        Value::from("B")
    );
    assert_eq!(
        Expression::evaluate_value(
            ".show == 1 ? 1 : null",
            &serde_json::json!({"show":0,"x":1}),
            &cp
        )
        .unwrap(),
        Value::Null
    );
}
