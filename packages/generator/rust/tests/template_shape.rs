//! The compiled cases also test CURP-019 and CURP-024 (a serialized compiled template is bound).
//! The form template shape of the Rust generator against tests/fixtures/template-shape (CURT-092): each case's template
//! is decoded with `FormTemplate::from_json` first, which refuses a shape that is not the compiled one; the case's
//! operation then runs on the decoded template, one trial per case.

use libtest_mimic::{Arguments, Failed, Trial};
use polyspec_crudui_generator::{bind_buttons, bind_form, BindOptions, Form, FormResult, FormTemplate};
use polyspec_crudui_validator::text::JsonText;
use serde_json::{json, Value};
use std::path::Path;

/// The cases of the fixture, parsed as JSON text.
fn cases() -> Vec<JsonText> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join("tests/fixtures/template-shape/cases.json");
    let source = match std::fs::read_to_string(&path) {
        Ok(source) => source,
        Err(e) => panic!("read {path:?}: {e}"),
    };
    match JsonText::parse(&source).expect("the fixture is JSON text") {
        JsonText::Array(cases) => cases,
        _ => panic!("the fixture is not an array"),
    }
}

/// The decoded value of a member of a case, which the fixture gives as valid text.
fn member(case: &JsonText, name: &str) -> Value {
    case.get(name)
        .and_then(JsonText::to_value)
        .unwrap_or_else(|| panic!("a case has the member {name}"))
}

/// The case's template is decoded first; a refusal is the error of the decoder, and the operation runs otherwise.
fn run_case(case: &JsonText) -> FormResult<()> {
    let template_value = member(case, "template");
    let template = FormTemplate::from_json(&template_value)?;
    let data = member(case, "data");
    let options = BindOptions::default();
    match member(case, "operation").as_str() {
        Some("bindForm") => bind_form(&template, &data, &options).map(|_| ()),
        Some("bindButtons") => bind_buttons(&template, &data, &options).map(|_| ()),
        Some("createForm") => Form::new(template, &data, options).map(|_| ()),
        other => panic!("unknown template operation {other:?}"),
    }
}

/// The outcome in the expect shape of the fixture: "pass", or the failure code, message and path.
fn outcome(result: FormResult<()>) -> Value {
    match result {
        Ok(()) => json!("pass"),
        Err(error) => json!({"code": error.code, "message": error.message, "at": error.at}),
    }
}

fn main() {
    let cases = cases();
    assert_eq!(cases.len(), 42, "the template shape fixture holds 42 cases");
    let trials = cases
        .into_iter()
        .map(|case| {
            let name = member(&case, "name");
            let name = name.as_str().expect("a case has a name").to_string();
            Trial::test(format!("template_shape::{name}"), move || {
                let expected = member(&case, "expect");
                let observed = outcome(run_case(&case));
                if observed == expected {
                    Ok(())
                } else {
                    Err(Failed::from(format!("\n got {observed}\nwant {expected}")))
                }
            })
        })
        .collect();
    libtest_mimic::run(&Arguments::from_args(), trials).exit();
}
