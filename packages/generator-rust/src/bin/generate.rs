use std::io::{self, Read};

use crudui_generator::{
    bind_form, compile_form, render_form, render_list, AddRowOptions, BindOptions, CompileOptions,
    Form, FormError, FormResult, FormTemplate, ListOptions,
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
    object(options, "options")?;
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
    object(action, "action")?;
    let method = action["method"]
        .as_str()
        .ok_or_else(|| input("Action method must be a string"))?;
    let args = action["args"]
        .as_array()
        .ok_or_else(|| input("Action args must be an array"))?;
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
        _ => return Err(input(format!("Unknown form method: {method}"))),
    }
    Ok(Value::Null)
}

fn generate(request: &Value) -> FormResult<Value> {
    object(request, "request")?;
    let empty = json!({});
    let options = object(request.get("options").unwrap_or(&empty), "options")?;
    match request["operation"].as_str() {
        Some("compileForm") => {
            serde_json::to_value(compile_form(&request["spec"], &compile_options(options)?)?)
                .map_err(|error| input(error.to_string()))
        }
        Some("bindForm") => {
            let template: FormTemplate = decode(&request["template"])?;
            let data = object(request.get("data").unwrap_or(&empty), "data")?;
            Ok(bind_form(&template, data, &decode::<BindOptions>(options)?)?.into())
        }
        Some("renderList") => {
            let compilation = compile_options(options)?;
            let options = ListOptions {
                files: compilation.files,
                basepath: compilation.basepath,
                loader: None,
                language: option_string(options, "language")?.unwrap_or_else(|| "ko".into()),
                data: object(options.get("data").unwrap_or(&empty), "List context")?.clone(),
                page_meta: object(options.get("pageMeta").unwrap_or(&empty), "pageMeta")?
                    .as_object()
                    .unwrap()
                    .clone(),
                layout: option_string(options, "layout")?.unwrap_or_else(|| "table".into()),
            };
            let rows = match request.get("rows") {
                Some(rows) => rows
                    .as_array()
                    .ok_or_else(|| input("rows must be an array"))?
                    .as_slice(),
                None => &[],
            };
            render_list(&request["spec"], rows, &options).map(Value::String)
        }
        Some("form") => {
            let template: FormTemplate = decode(&request["template"])?;
            let data = object(request.get("data").unwrap_or(&empty), "data")?;
            let mut form = Form::new(template, data, decode(options)?)?;
            let mut steps = Vec::new();
            let actions = match request.get("actions") {
                Some(actions) => actions
                    .as_array()
                    .ok_or_else(|| input("actions must be an array"))?
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
                serde_json::from_str(&source).map_err(|error| input(error.to_string()))?;
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
