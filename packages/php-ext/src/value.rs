use serde_json::{Map, Number, Value};
use std::{ptr, slice, str};

/// Allocate a JSON-compatible value by type: null, bool, int, float, string,
/// array or object. Scalar setters replace the initial null.
#[no_mangle]
pub extern "C" fn ps_value_new(kind: u8) -> *mut Value {
    Box::into_raw(Box::new(match kind {
        5 => Value::Array(Vec::new()),
        6 => Value::Object(Map::new()),
        _ => Value::Null,
    }))
}

/// Release an owned value. A null pointer is accepted.
/// # Safety
/// `value` must be null or an unreleased pointer allocated by this library.
#[no_mangle]
pub unsafe extern "C" fn ps_value_free(value: *mut Value) {
    if !value.is_null() {
        drop(Box::from_raw(value));
    }
}

/// # Safety
/// `value` must refer to a live, exclusively borrowed value.
#[no_mangle]
pub unsafe extern "C" fn ps_value_bool(value: *mut Value, input: bool) {
    *value = Value::Bool(input);
}

/// # Safety
/// `value` must refer to a live, exclusively borrowed value.
#[no_mangle]
pub unsafe extern "C" fn ps_value_int(value: *mut Value, input: i64) {
    *value = Value::Number(input.into());
}

/// # Safety
/// `value` must refer to a live, exclusively borrowed value.
#[no_mangle]
pub unsafe extern "C" fn ps_value_float(value: *mut Value, input: f64) -> bool {
    match Number::from_f64(input) {
        Some(number) => {
            *value = Value::Number(number);
            true
        }
        None => false,
    }
}

/// # Safety
/// The input must be readable for `length` bytes. `value` is exclusively borrowed.
#[no_mangle]
pub unsafe extern "C" fn ps_value_string(
    value: *mut Value,
    input: *const u8,
    length: usize,
) -> bool {
    match str::from_utf8(slice::from_raw_parts(input, length)) {
        Ok(text) => {
            *value = Value::String(text.to_owned());
            true
        }
        Err(_) => false,
    }
}

/// Transfer ownership of a child into an array or object. Always consumes child.
/// A null key appends to an array; a nonnull UTF-8 key inserts into an object.
/// # Safety
/// Both values must be live exclusive owned pointers, and key readable for length.
#[no_mangle]
pub unsafe extern "C" fn ps_value_insert(
    parent: *mut Value,
    key: *const u8,
    length: usize,
    child: *mut Value,
) -> bool {
    let child = *Box::from_raw(child);
    match &mut *parent {
        Value::Array(values) if key.is_null() => {
            values.push(child);
            true
        }
        Value::Object(values) if !key.is_null() => {
            match str::from_utf8(slice::from_raw_parts(key, length)) {
                Ok(key) => {
                    values.insert(key.to_owned(), child);
                    true
                }
                Err(_) => false,
            }
        }
        _ => false,
    }
}

/// Return scalar type and data. Non-scalar values use kinds 5 (array) and 6 (object).
/// # Safety
/// value is borrowed; every output pointer must be writable. String output borrows value.
#[no_mangle]
pub unsafe extern "C" fn ps_value_read(
    value: *const Value,
    integer: *mut i64,
    number: *mut f64,
    text: *mut *const u8,
    length: *mut usize,
) -> u8 {
    match &*value {
        Value::Null => 0,
        Value::Bool(v) => {
            *integer = i64::from(*v);
            1
        }
        Value::Number(v) => {
            if let Some(v) = v.as_i64() {
                *integer = v;
                2
            } else {
                *number = v.as_f64().expect("JSON number");
                3
            }
        }
        Value::String(v) => {
            *text = v.as_ptr();
            *length = v.len();
            4
        }
        Value::Array(_) => 5,
        Value::Object(_) => 6,
    }
}

pub type Visitor =
    unsafe extern "C" fn(*mut std::ffi::c_void, *const u8, usize, *const Value) -> bool;

/// Visit children once in array or object order. No child ownership is transferred.
/// # Safety
/// The callback must not release or mutate value. Context is passed through unchanged.
#[no_mangle]
pub unsafe extern "C" fn ps_value_visit(
    value: *const Value,
    context: *mut std::ffi::c_void,
    visit: Visitor,
) -> bool {
    match &*value {
        Value::Array(values) => values.iter().all(|v| visit(context, ptr::null(), 0, v)),
        Value::Object(values) => values
            .iter()
            .all(|(k, v)| visit(context, k.as_ptr(), k.len(), v)),
        _ => false,
    }
}
