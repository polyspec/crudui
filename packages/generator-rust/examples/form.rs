use crudui_generator::{
    compile_form, render_form, sequence_row_key, BindOptions, CompileOptions, Form,
};
use crudui_validator::validate::{validate, ValidateOptions};
use serde_json::json;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let spec = json!({
        "type": "group",
        "properties": {
            "companies": {
                "type": "group", "label": "Companies", "multiple": true,
                "properties": {
                    "name": { "type": "text", "label": "Name", "validate": { "required": true } },
                    "stores": {
                        "type": "group", "label": "Stores", "multiple": true,
                        "properties": { "name": { "type": "text", "label": "Store", "validate": { "required": true } } }
                    }
                }
            }
        }
    });
    let template = compile_form(
        &spec,
        &CompileOptions {
            key_prefix: Some("form".into()),
            ..Default::default()
        },
    )?;
    let cached = serde_json::to_vec(&template)?;
    let data = json!({"companies": {
        sequence_row_key("5")?: {"name": "Company", "stores": {
            sequence_row_key("42")?: {"name": "Store"}
        }}
    }});
    let initial = Form::new(template, &data, BindOptions::default())?;
    let mut injected = Form::new(
        serde_json::from_slice(&cached)?,
        &json!({"companies": {}}),
        BindOptions::default(),
    )?;
    injected.set_data(&data)?;
    assert_eq!(render_form(&initial)?, render_form(&injected)?);
    assert_eq!(initial.get_data(), injected.get_data());
    let validation = validate(&spec, &injected.get_data(), &ValidateOptions::default())?;
    assert!(validation.valid);
    println!("<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>CRUDUI form</title><form method=\"post\">{}<button type=\"submit\">Save</button></form></html>", render_form(&injected)?);
    Ok(())
}
