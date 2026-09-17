//! Rust generator process of the native generator conformance suite. It reads one JSON request
//! on standard input, calls the public API of crudui-generator and writes one JSON value on
//! standard output; ../../README.md defines the protocol.

use std::io::{self, Read};

use crudui_generator::{
    bind_buttons, bind_form, build_detail, build_list, compile_form, form_buttons_html, list_rows,
    render_detail, render_form, render_list, AddRowOptions, BindOptions, CompileOptions,
    DetailOptions, Form, FormError, FormResult, FormTemplate, ListOptions,
};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

fn input(message: impl Into<String>) -> FormError {
    FormError {
        code: "INVALID_FORM_INPUT".into(),
        message: message.into(),
        at: String::new(),
        trace: Vec::new(),
    }
}

fn decode<T: DeserializeOwned>(value: &Value) -> FormResult<T> {
    serde_json::from_value(value.clone()).map_err(|error| input(error.to_string()))
}

/// A form template is a JSON object of the compiled template kind; any other value is
/// rejected before it is decoded.
fn template(value: &Value) -> FormResult<FormTemplate> {
    if value["kind"] != "crudui/form-template" {
        return Err(input("Unsupported form template"));
    }
    decode(value)
}

fn object<'a>(value: &'a Value, name: &str) -> FormResult<&'a Value> {
    if value.is_object() {
        Ok(value)
    } else {
        Err(input(format!("{name} must be an object")))
    }
}

fn option_string(options: &Value, key: &str) -> FormResult<Option<String>> {
    options
        .get(key)
        .map(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| input(format!("{key} must be a string")))
        })
        .transpose()
}

fn compile_options(options: &Value) -> FormResult<CompileOptions<'static>> {
    object(options, "Options")?;
    Ok(CompileOptions {
        files: match options.get("files") {
            Some(files) => object(files, "files")?.as_object().unwrap().clone(),
            None => Default::default(),
        },
        basepath: option_string(options, "basepath")?.unwrap_or_default(),
        key_prefix: option_string(options, "keyPrefix")?,
        loader: None,
    })
}

fn error_json(error: FormError) -> Value {
    json!({"code":error.code,"message":error.message,"at":error.at})
}

fn string_arg(args: &[Value], index: usize) -> FormResult<&str> {
    args.get(index)
        .and_then(Value::as_str)
        .ok_or_else(|| input(format!("Argument {index} must be a string")))
}

fn action(form: &mut Form, action: &Value) -> FormResult<Value> {
    const METHODS: [&str; 9] = [
        "setData",
        "setValue",
        "addRow",
        "copyRow",
        "removeRow",
        "moveRow",
        "rekeyRow",
        "getValue",
        "getData",
    ];
    let (Some(method), Some(args)) = (action["method"].as_str(), action["args"].as_array()) else {
        return Err(input("Invalid form action"));
    };
    if !METHODS.contains(&method) {
        return Err(input("Invalid form action"));
    }
    match method {
        "setData" => {
            form.set_data(args.first().ok_or_else(|| input("setData requires data"))?)?;
        }
        "setValue" => {
            form.set_value(
                string_arg(args, 0)?,
                args.get(1)
                    .ok_or_else(|| input("setValue requires a value"))?
                    .clone(),
            )?;
        }
        "getData" => return Ok(form.get_data()),
        "getValue" => return form.get_value(string_arg(args, 0)?),
        "addRow" => {
            let options = args
                .get(1)
                .map(decode::<AddRowOptions>)
                .transpose()?
                .unwrap_or_default();
            return form
                .add_row(string_arg(args, 0)?, options)
                .map(Value::String);
        }
        "copyRow" => {
            let options = args
                .get(2)
                .map(decode::<AddRowOptions>)
                .transpose()?
                .unwrap_or_default();
            return form
                .copy_row(string_arg(args, 0)?, string_arg(args, 1)?, options)
                .map(Value::String);
        }
        "removeRow" => form.remove_row(string_arg(args, 0)?, string_arg(args, 1)?)?,
        "moveRow" => {
            let index = args
                .get(2)
                .and_then(Value::as_u64)
                .and_then(|index| usize::try_from(index).ok())
                .ok_or_else(|| input("Row position must be a nonnegative integer"))?;
            form.move_row(string_arg(args, 0)?, string_arg(args, 1)?, index)?;
        }
        "rekeyRow" => form.rekey_row(
            string_arg(args, 0)?,
            string_arg(args, 1)?,
            string_arg(args, 2)?,
        )?,
        _ => return Err(input("Invalid form action")),
    }
    Ok(Value::Null)
}

fn generate(request: &Value) -> FormResult<Value> {
    object(request, "Request")?;
    let empty = json!({});
    let options = object(request.get("options").unwrap_or(&empty), "Options")?;
    match request["operation"].as_str() {
        Some("compileForm") => {
            serde_json::to_value(compile_form(&request["spec"], &compile_options(options)?)?)
                .map_err(|error| input(error.to_string()))
        }
        Some("bindForm") => {
            let template = template(&request["template"])?;
            let data = object(request.get("data").unwrap_or(&empty), "Form data")?;
            Ok(bind_form(&template, data, &decode::<BindOptions>(options)?)?.into())
        }
        Some("bindButtons") => {
            let template = template(&request["template"])?;
            let data = object(request.get("data").unwrap_or(&empty), "Form data")?;
            Ok(bind_buttons(&template, data, &decode::<BindOptions>(options)?)?.into())
        }
        Some("formButtonsHtml") => {
            let buttons = request["buttons"]
                .as_array()
                .ok_or_else(|| input("Form buttons must be a list"))?;
            Ok(form_buttons_html(buttons)?.into())
        }
        Some("buildList") | Some("renderList") => {
            let compilation = compile_options(options)?;
            let language = option_string(options, "language")?.unwrap_or_else(|| "ko".into());
            // The specification rule precedes the rows rule, which only decoded JSON can break.
            let spec = &request["spec"];
            if !spec.is_object() {
                return Err(input("List specification must be an object"));
            }
            let rows = list_rows(request.get("rows"))?;
            let options = ListOptions {
                files: compilation.files,
                basepath: compilation.basepath,
                loader: None,
                language,
                data: options.get("data").cloned().unwrap_or(Value::Null),
                // The library checks page and total after the context; null means none.
                page: options.get("page").cloned().unwrap_or(Value::Null),
                total: options.get("total").cloned().unwrap_or(Value::Null),
                layout: options.get("layout").cloned().unwrap_or(Value::Null),
            };
            if request["operation"] == "buildList" {
                build_list(spec, rows, &options)
            } else {
                render_list(spec, rows, &options).map(Value::String)
            }
        }
        Some("renderDetail") => {
            let compilation = compile_options(options)?;
            let options = DetailOptions {
                files: compilation.files,
                basepath: compilation.basepath,
                loader: None,
                language: option_string(options, "language")?.unwrap_or_else(|| "ko".into()),
                // The library checks the context after the specification and record; null means empty.
                data: options.get("data").cloned().unwrap_or(Value::Null),
                page: Value::Null,
                total: Value::Null,
                layout: Value::Null,
            };
            let record = request.get("record").unwrap_or(&empty);
            render_detail(&request["spec"], record, &options).map(Value::String)
        }
        Some("buildDetail") => {
            let compilation = compile_options(options)?;
            let options = DetailOptions {
                files: compilation.files,
                basepath: compilation.basepath,
                loader: None,
                language: option_string(options, "language")?.unwrap_or_else(|| "ko".into()),
                // The library checks the context after the specification and record; null means empty.
                data: options.get("data").cloned().unwrap_or(Value::Null),
                page: Value::Null,
                total: Value::Null,
                layout: Value::Null,
            };
            let record = request.get("record").unwrap_or(&empty);
            build_detail(&request["spec"], record, &options)
        }
        Some("form") => {
            let template = template(&request["template"])?;
            let data = object(request.get("data").unwrap_or(&empty), "Form data")?;
            let mut form = Form::new(template, data, decode(options)?)?;
            let mut steps = Vec::new();
            let actions = match request.get("actions") {
                Some(actions) => actions
                    .as_array()
                    .ok_or_else(|| input("Actions must be an array"))?
                    .as_slice(),
                None => &[],
            };
            for step in actions {
                let (result, error) = match action(&mut form, step) {
                    Ok(value) => (value, Value::Null),
                    Err(error) => (Value::Null, error_json(error)),
                };
                steps.push(json!({"result":result,"error":error,"data":form.get_data(),"fields":form.fields(),"html":render_form(&form)?,"revision":form.revision()}));
            }
            Ok(
                json!({"data":form.get_data(),"fields":form.fields(),"html":render_form(&form)?,"revision":form.revision(),"steps":steps}),
            )
        }
        _ => Err(input("Unknown generator operation")),
    }
}

fn main() {
    let mut source = String::new();
    let result = io::stdin()
        .read_to_string(&mut source)
        .map_err(|error| input(error.to_string()))
        .and_then(|_| {
            let request: Value =
                serde_json::from_str(&source).map_err(|_| input("Request must be valid JSON"))?;
            generate(&request)
        });
    match result {
        Ok(value) => println!("{value}"),
        Err(error) => {
            println!("{}", json!({"error":error_json(error)}));
            std::process::exit(1);
        }
    }
}
