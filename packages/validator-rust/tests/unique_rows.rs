//! The row-level `unique` check: duplicates belong to one validation, and the check takes time
//! linear in the number of rows.

use crudui_validator::validate::{validate, ValidateOptions};
use serde_json::{json, Map, Value};
use std::time::{Duration, Instant};

fn spec() -> Value {
    json!({"type":"group","properties":{"rows":{"type":"group","multiple":true,"properties":{"code":{"type":"text","validate":{"unique":true}}}}}})
}

fn rows<S: Into<String>>(codes: impl IntoIterator<Item = S>) -> Value {
    let mut out = Map::new();
    for (i, code) in codes.into_iter().enumerate() {
        out.insert(format!("__{:013}__", i + 1), json!({"code": code.into()}));
    }
    json!({"rows": Value::Object(out)})
}

fn options() -> ValidateOptions<'static> {
    ValidateOptions {
        files: None,
        loader: None,
        basepath: None,
    }
}

// A second validation of the same specification with different data answers from its own rows.
#[test]
fn unique_rows_belong_to_one_validation() {
    let spec = spec();
    let first = validate(&spec, &rows(["x", "x"]), &options()).unwrap();
    assert!(!first.valid, "first validation finds the duplicate");
    let second = validate(&spec, &rows(["x", "y"]), &options()).unwrap();
    assert!(
        second.valid,
        "second validation took the first one's duplicates"
    );
}

#[test]
fn unique_rows_take_linear_time() {
    let spec = spec();
    let best = |count: usize| -> Duration {
        let data = rows((0..count).map(|i| i.to_string()));
        (0..3)
            .map(|_| {
                let started = Instant::now();
                validate(&spec, &data, &options()).unwrap();
                started.elapsed()
            })
            .min()
            .unwrap()
    };
    let (small, large) = (best(1500), best(6000));
    let ratio = large.as_secs_f64() / small.as_secs_f64();
    assert!(
        ratio < 8.0,
        "4n rows took {ratio:.1} times as long as n rows ({small:?}, {large:?})"
    );
}
