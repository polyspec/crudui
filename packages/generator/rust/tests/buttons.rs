//! The form button fixtures against the Rust generator: the cases of `tests/fixtures/buttons` run `bind_buttons` (CURP-008)
//! and `form_buttons_html` (CURP-009). Each observation equals the one that the TypeScript reference recorded, as JSON text,
//! so the order of the attributes counts. A failure is observed with its code and message.

use polyspec_crudui_generator::{
    bind_buttons, compile_form, form_buttons_html, BindOptions, CompileOptions, FormResult, FormTemplate,
};
use serde_json::{json, Value};
use std::path::Path;

fn cases() -> Vec<Value> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../tests/fixtures/buttons/cases.json");
    let cases: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    assert!(!cases.is_empty(), "buttons holds no case");
    cases
}

/// The template of a case: its spec compiled, or its template read as it is.
fn template_of(case: &Value) -> FormResult<FormTemplate> {
    match case.get("spec") {
        Some(spec) => compile_form(spec, &CompileOptions::default()),
        None => FormTemplate::from_json(&case["template"]),
    }
}

/// The bind options of a case: its language, the default otherwise.
fn options_of(case: &Value) -> BindOptions {
    let mut options = BindOptions::default();
    if let Some(language) = case["options"].get("language") {
        options.language = language.clone();
    }
    options
}

/// The observation of one case: the result, or the error by its code and message.
fn observe(run: impl FnOnce() -> FormResult<Value>) -> Value {
    match run() {
        Ok(result) => json!({ "result": result }),
        Err(error) => json!({ "error": { "code": error.code, "message": error.message } }),
    }
}

fn observe_case(case: &Value) -> Value {
    if case["operation"] == "formButtonsHtml" {
        observe(|| form_buttons_html(&case["buttons"]).map(Value::from))
    } else {
        observe(|| {
            let template = template_of(case)?;
            let data = if case.get("data").is_some() { case["data"].clone() } else { json!({}) };
            let buttons = bind_buttons(&template, &data, &options_of(case))?;
            Ok(Value::Array(buttons))
        })
    }
}

#[test]
fn every_case_reproduces_its_expectation() {
    for case in cases() {
        let name = case["name"].as_str().unwrap_or("unnamed");
        let observed = observe_case(&case);
        assert_eq!(
            serde_json::to_string(&observed).unwrap(),
            serde_json::to_string(&case["expected"]).unwrap(),
            "{name}"
        );
    }
}
