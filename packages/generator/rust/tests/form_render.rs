//! The form rendering fixtures against the Rust generator: each result case of `tests/fixtures/form-render` compiles,
//! binds and renders to the recorded layout, and each failure case raises the recorded code. Each case is one test. Results are compared as normalized layout trees (tests/support), as the Python runner does.

mod support;

use libtest_mimic::{Arguments, Trial};
use polyspec_crudui_generator::{compile_form, render_form, BindOptions, CompileOptions, Form};
use serde_json::{json, Value};

/// Compiles and binds one case with its options and data, as the fixture's generator does.
fn instance(case: &Value) -> polyspec_crudui_generator::FormResult<Form> {
    let options = case.get("options").cloned().unwrap_or(json!({}));
    let compile = CompileOptions {
        files: options["files"].as_object().cloned().unwrap_or_default(),
        basepath: options["basepath"].as_str().unwrap_or("").into(),
        key_prefix: options["keyPrefix"].as_str().map(str::to_owned),
        ..Default::default()
    };
    let template = compile_form(&case["spec"], &compile)?;
    let bind: BindOptions = serde_json::from_value(options).unwrap();
    let data = case.get("data").cloned().unwrap_or(json!({}));
    Form::new(template, &data, bind)
}

/// A result case renders the recorded layout.
fn check_result(case: &Value) {
    let name = case["name"].as_str().unwrap();
    let form = match instance(case) {
        Ok(form) => form,
        Err(error) => panic!("{name}: {error}"),
    };
    let actual = match render_form(&form, None) {
        Ok(actual) => actual,
        Err(error) => panic!("{name}: {error}"),
    };
    let expected = support::html_tree(case["expected_html"].as_str().unwrap());
    if let Some(difference) = support::first_difference(&support::html_tree(&actual), &expected)
    {
        panic!("{name}: {difference}");
    }
    // A new instance over the same template and data renders the same form.
    let again = render_form(&instance(case).unwrap(), None).unwrap();
    assert_eq!(actual, again, "{name}: a new instance renders differently");
}

/// A failure case raises the recorded code.
fn check_failure(case: &Value) {
    let name = case["name"].as_str().unwrap();
    let error = match instance(case) {
        Err(error) => error,
        Ok(form) => match render_form(&form, None) {
            Err(error) => error,
            Ok(_) => panic!("{name} must fail"),
        },
    };
    assert_eq!(
        error.code,
        case["expectError"]["code"].as_str().unwrap(),
        "{name}"
    );
}

fn main() {
    let cases = support::cases("form-render");
    let results: Vec<Value> = cases
        .iter()
        .filter(|case| case.get("expected_html").is_some())
        .cloned()
        .collect();
    assert_eq!(results.len(), 153, "form-render holds 153 result cases");
    let failures: Vec<Value> = cases
        .iter()
        .filter(|case| case.get("expectError").is_some())
        .cloned()
        .collect();
    assert_eq!(failures.len(), 56, "form-render holds 56 failure cases");
    let trial = |case: Value, check: fn(&Value)| {
        let name = case["name"].as_str().unwrap().to_string();
        Trial::test(
            format!("form_render_cases_reproduce_the_normalized_layout_or_the_failure::{name}"),
            move || {
                check(&case);
                Ok(())
            },
        )
    };
    let trials = results
        .into_iter()
        .map(|case| trial(case, check_result))
        .chain(failures.into_iter().map(|case| trial(case, check_failure)))
        .collect();
    libtest_mimic::run(&Arguments::from_args(), trials).exit();
}
