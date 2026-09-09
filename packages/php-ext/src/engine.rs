use crudui_generator::{
    bind_form, compile_form, create_row_key, render_form, render_list, sequence_row_key,
    AddRowOptions, BindOptions, CompileOptions, Form, FormError, FormTemplate, ListOptions,
};
use crudui_validator::{
    compose::ComposeLoadError,
    list::{validate_list, ValidateListOptions},
    validate::{validate, ValidateOptions},
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::{json, Map, Value};
use std::{
    panic::{catch_unwind, AssertUnwindSafe},
    ptr,
};

#[repr(C)]
pub struct ResultValue {
    value: *mut Value,
    error: *mut Value,
}

#[repr(C)]
pub struct ResultForm {
    form: *mut Form,
    error: *mut Value,
}

fn input(message: impl Into<String>) -> Value {
    json!({"kind":"form","code":"INVALID_FORM_INPUT","message":message.into(),"at":"","trace":[]})
}

fn form_error(error: FormError) -> Value {
    let composition = error.code.starts_with("REF_")
        || error.code.starts_with("PATCH_")
        || error.code == "FORBIDDEN_META_KEY";
    json!({"kind":if composition {"compose"} else {"form"},"code":error.code,"message":error.message,"at":error.at,"trace":error.trace})
}

fn compose_error(error: ComposeLoadError) -> Value {
    json!({"kind":"compose","code":error.code.as_str(),"message":error.message,"at":error.trace.join("."),"trace":error.trace})
}

fn decode<T: DeserializeOwned>(value: &Value) -> Result<T, Value> {
    serde_json::from_value(value.clone()).map_err(|e| input(e.to_string()))
}

fn encoded<T: Serialize>(value: T) -> Result<Value, Value> {
    serde_json::to_value(value).map_err(|e| input(e.to_string()))
}

fn object(value: &Value) -> Result<&Map<String, Value>, Value> {
    value.as_object().ok_or_else(|| input("Expected an object"))
}

fn option_string(options: &Value, name: &str) -> Result<Option<String>, Value> {
    options
        .get(name)
        .map(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| input(format!("{name} must be a string")))
        })
        .transpose()
}

fn files(options: &Value) -> Result<Map<String, Value>, Value> {
    options
        .get("files")
        .map(|value| match value {
            Value::Array(items) if items.is_empty() => Ok(Map::new()),
            _ => object(value).cloned(),
        })
        .transpose()
        .map(|v| v.unwrap_or_default())
}

fn compile_options(options: &Value) -> Result<CompileOptions<'static>, Value> {
    Ok(CompileOptions {
        files: files(options)?,
        loader: None,
        basepath: option_string(options, "basepath")?.unwrap_or_default(),
        key_prefix: option_string(options, "keyPrefix")?,
    })
}

fn output(f: impl FnOnce() -> Result<Value, Value>) -> ResultValue {
    match catch_unwind(AssertUnwindSafe(f)) {
        Ok(Ok(value)) => ResultValue {
            value: Box::into_raw(Box::new(value)),
            error: ptr::null_mut(),
        },
        Ok(Err(error)) => ResultValue {
            value: ptr::null_mut(),
            error: Box::into_raw(Box::new(error)),
        },
        Err(_) => ResultValue {
            value: ptr::null_mut(),
            error: Box::into_raw(Box::new(
                json!({"kind":"internal","code":"INTERNAL_ERROR","message":"Native engine failed","at":"","trace":[]}),
            )),
        },
    }
}

/// # Safety
/// Inputs are live immutable values for the duration of the call.
#[no_mangle]
pub unsafe extern "C" fn ps_compile_form(spec: *const Value, options: *const Value) -> ResultValue {
    output(|| encoded(compile_form(&*spec, &compile_options(&*options)?).map_err(form_error)?))
}

/// # Safety
/// Inputs are live immutable values for the duration of the call.
#[no_mangle]
pub unsafe extern "C" fn ps_bind_form(
    template: *const Value,
    data: *const Value,
    options: *const Value,
) -> ResultValue {
    output(|| {
        encoded(
            bind_form(
                &decode::<FormTemplate>(&*template)?,
                &*data,
                &decode::<BindOptions>(&*options)?,
            )
            .map_err(form_error)?,
        )
    })
}

/// # Safety
/// Inputs are live immutable values for the duration of the call.
#[no_mangle]
pub unsafe extern "C" fn ps_render_list(
    spec: *const Value,
    rows: *const Value,
    options: *const Value,
) -> ResultValue {
    output(|| {
        let opts = &*options;
        let compilation = compile_options(opts)?;
        let options = ListOptions {
            files: compilation.files,
            loader: None,
            basepath: compilation.basepath,
            language: option_string(opts, "language")?.unwrap_or_else(|| "ko".into()),
            layout: option_string(opts, "layout")?.unwrap_or_else(|| "table".into()),
            data: opts.get("data").cloned().unwrap_or_else(|| json!({})),
            page_meta: opts
                .get("pageMeta")
                .map(|v| object(v).cloned())
                .transpose()?
                .unwrap_or_default(),
        };
        let rows = (&*rows)
            .as_array()
            .ok_or_else(|| input("Rows must be an array"))?;
        render_list(&*spec, rows, &options)
            .map(Value::String)
            .map_err(form_error)
    })
}

/// # Safety
/// Inputs are live immutable values for the duration of the call.
#[no_mangle]
pub unsafe extern "C" fn ps_validate(
    spec: *const Value,
    data: *const Value,
    options: *const Value,
) -> ResultValue {
    output(|| {
        let opts = &*options;
        let options = ValidateOptions {
            files: Some(files(opts)?),
            loader: None,
            basepath: option_string(opts, "basepath")?,
        };
        let result = validate(&*spec, &*data, &options).map_err(compose_error)?;
        Ok(
            json!({"valid":result.valid,"errors":result.errors.iter().map(|error| error.to_value()).collect::<Vec<_>>()}),
        )
    })
}

/// # Safety
/// Inputs are live immutable values for the duration of the call.
#[no_mangle]
pub unsafe extern "C" fn ps_validate_list(
    spec: *const Value,
    options: *const Value,
) -> ResultValue {
    output(|| {
        let opts = &*options;
        let options = ValidateListOptions {
            files: Some(files(opts)?),
            loader: None,
            basepath: option_string(opts, "basepath")?,
        };
        validate_list(&*spec, &options).map_err(compose_error)?;
        Ok(json!({"valid":true,"errors":[]}))
    })
}

/// # Safety
/// Inputs are live immutable values. The returned form must be released by ps_form_free.
#[no_mangle]
pub unsafe extern "C" fn ps_form_new(
    template: *const Value,
    data: *const Value,
    options: *const Value,
) -> ResultForm {
    let result = catch_unwind(AssertUnwindSafe(|| {
        Form::new(
            decode::<FormTemplate>(&*template)?,
            &*data,
            decode::<BindOptions>(&*options)?,
        )
        .map_err(form_error)
    }));
    match result {
        Ok(Ok(form)) => ResultForm {
            form: Box::into_raw(Box::new(form)),
            error: ptr::null_mut(),
        },
        Ok(Err(error)) => ResultForm {
            form: ptr::null_mut(),
            error: Box::into_raw(Box::new(error)),
        },
        Err(_) => ResultForm {
            form: ptr::null_mut(),
            error: Box::into_raw(Box::new(input("Native form creation failed"))),
        },
    }
}

/// # Safety
/// Form is null or an unreleased owned pointer returned by this library.
#[no_mangle]
pub unsafe extern "C" fn ps_form_free(form: *mut Form) {
    if !form.is_null() {
        drop(Box::from_raw(form));
    }
}

/// # Safety
/// Form is a live, immutable pointer. The result is an independent owned instance.
#[no_mangle]
pub unsafe extern "C" fn ps_form_clone(form: *const Form) -> *mut Form {
    Box::into_raw(Box::new((&*form).clone()))
}

/// Read native state: template, data, fields, revision or HTML.
/// # Safety
/// Form is live and immutably borrowed for the call.
#[no_mangle]
pub unsafe extern "C" fn ps_form_read(form: *const Form, member: u8) -> ResultValue {
    output(|| {
        let form = &*form;
        match member {
            0 => encoded(form.template()),
            1 => Ok(form.get_data()),
            2 => encoded(form.fields()),
            3 => Ok(form.revision().into()),
            4 => render_form(form).map(Value::String).map_err(form_error),
            _ => Err(input("Unknown form member")),
        }
    })
}

/// Read a field value or update instance state through the public Rust methods.
/// # Safety
/// Form is exclusively borrowed; args is a live array value with owned children.
#[no_mangle]
pub unsafe extern "C" fn ps_form_apply(
    form: *mut Form,
    method: u8,
    args: *const Value,
) -> ResultValue {
    output(|| {
        let args = (&*args)
            .as_array()
            .ok_or_else(|| input("Expected argument array"))?;
        let arg = |index: usize| args.get(index).ok_or_else(|| input("Missing argument"));
        let string = |index| {
            arg(index)?
                .as_str()
                .ok_or_else(|| input("Expected a string"))
        };
        let form = &mut *form;
        match method {
            0 => return form.get_value(string(0)?).map_err(form_error),
            1 => form.set_data(arg(0)?).map_err(form_error)?,
            2 => form
                .set_value(string(0)?, arg(1)?.clone())
                .map_err(form_error)?,
            3 => {
                return form
                    .add_row(string(0)?, decode::<AddRowOptions>(arg(1)?)?)
                    .map(Value::String)
                    .map_err(form_error)
            }
            4 => {
                return form
                    .copy_row(string(0)?, string(1)?, decode::<AddRowOptions>(arg(2)?)?)
                    .map(Value::String)
                    .map_err(form_error)
            }
            5 => form
                .remove_row(string(0)?, string(1)?)
                .map_err(form_error)?,
            6 => {
                let index = arg(2)?
                    .as_u64()
                    .and_then(|i| usize::try_from(i).ok())
                    .ok_or_else(|| input("Invalid row position"))?;
                form.move_row(string(0)?, string(1)?, index)
                    .map_err(form_error)?;
            }
            7 => form
                .rekey_row(string(0)?, string(1)?, string(2)?)
                .map_err(form_error)?,
            _ => return Err(input("Unknown form operation")),
        }
        Ok(Value::Null)
    })
}

/// # Safety
/// Sequence is a live integer or string value.
#[no_mangle]
pub unsafe extern "C" fn ps_sequence_key(sequence: *const Value) -> ResultValue {
    output(|| {
        let sequence = match &*sequence {
            Value::String(s) => s.to_owned(),
            Value::Number(n) => n.to_string(),
            _ => return Err(input("A sequence must be an integer or string")),
        };
        sequence_row_key(&sequence)
            .map(Value::String)
            .map_err(form_error)
    })
}

#[no_mangle]
pub extern "C" fn ps_create_key() -> ResultValue {
    output(|| create_row_key().map(Value::String).map_err(form_error))
}
