//! The detail rendering fixtures against the Rust generator: each case of `tests/fixtures/detail-render` renders its
//! record to the recorded layout, or raises the recorded code and message. Results are compared as normalized layout
//! trees (tests/support) without the image preload links, as the Python runner does.

mod support;

use polyspec_crudui_generator::{render_detail, DetailOptions};
use regex::Regex;
use serde_json::{json, Value};
use std::sync::LazyLock;

static PRELOAD: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"<link [^>]*rel="preload"[^>]*>"#).unwrap());

fn options(case: &Value) -> DetailOptions<'static> {
    let options = &case["options"];
    DetailOptions {
        files: options["files"].as_object().cloned().unwrap_or_default(),
        basepath: options["basepath"].as_str().unwrap_or("").into(),
        language: options["language"].as_str().unwrap_or("ko").into(),
        data: options.get("data").cloned().unwrap_or(Value::Null),
        page: options.get("page").cloned().unwrap_or(Value::Null),
        total: options.get("total").cloned().unwrap_or(Value::Null),
        layout: options.get("layout").cloned().unwrap_or(Value::Null),
        ..Default::default()
    }
}

#[test]
fn detail_render_cases_reproduce_the_normalized_layout_or_the_failure() {
    let cases = support::cases("detail-render");
    assert_eq!(cases.len(), 62, "detail-render holds 62 cases");
    for case in &cases {
        let name = case["name"].as_str().unwrap();
        let record = case.get("record").cloned().unwrap_or(json!({}));
        let result = render_detail(&case["spec"], &record, &options(case));
        if let Some(expected) = case.get("expectError") {
            let error = result.err().unwrap_or_else(|| panic!("{name} must fail"));
            assert_eq!(
                error.code,
                expected["code"].as_str().unwrap(),
                "{name}: code"
            );
            if let Some(message) = expected.get("message").and_then(Value::as_str) {
                assert!(
                    error.message.contains(message),
                    "{name}: message {:?} lacks {message:?}",
                    error.message
                );
            }
            continue;
        }
        let actual = match result {
            Ok(actual) => actual,
            Err(error) => panic!("{name}: {error}"),
        };
        let actual = PRELOAD.replace_all(&actual, "");
        let expected = case["expected_html"].as_str().unwrap();
        if let Some(difference) =
            support::first_difference(&support::html_tree(&actual), &support::html_tree(expected))
        {
            panic!("{name}: {difference}");
        }
    }
}
