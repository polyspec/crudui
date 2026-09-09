use crate::util::{js_string, position, segments};
use crudui_validator::expr::condition_map;
use crudui_validator::expr::{is_truthy, Evaluator, Expression, Node};
use crudui_validator::validate::rules::is_condition_expression;
use serde_json::{json, Value};

fn resolve_map(value: &Value, data: &Value, path: &[String]) -> Value {
    let entries = value
        .as_object()
        .expect("condition map")
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect::<Vec<_>>();
    condition_map::resolve(&entries, data, path).unwrap_or(Value::Null)
}

pub(crate) fn show(value: Option<&Value>, data: &Value, path: &[String]) -> bool {
    match value {
        None | Some(Value::Null) => true,
        Some(Value::Object(_)) => is_truthy(&resolve_map(value.unwrap(), data, path)),
        Some(Value::String(s)) => Expression::evaluate(s, data, path).unwrap_or(false),
        Some(v) => is_truthy(v),
    }
}

pub(crate) fn appearance(value: Option<&Value>, data: &Value, path: &[String]) -> String {
    match value {
        None | Some(Value::Null) => String::new(),
        Some(Value::Object(_)) => {
            let result = resolve_map(value.unwrap(), data, path);
            if result.is_null() {
                String::new()
            } else {
                js_string(&result)
            }
        }
        Some(Value::String(s)) => {
            if let Ok(node @ Node::Ternary { .. }) = Expression::parse(s) {
                let result = Evaluator::new(data, path).evaluate_value(&node);
                return if result.is_null() {
                    String::new()
                } else {
                    js_string(&result)
                };
            }
            if is_condition_expression(s) && !has_ternary_text(s) {
                let result =
                    Expression::evaluate_value(s, data, path).unwrap_or(Value::Bool(false));
                return if result.is_null() || result == false {
                    String::new()
                } else {
                    js_string(&result)
                };
            }
            s.clone()
        }
        Some(v) => js_string(v),
    }
}

fn has_ternary_text(s: &str) -> bool {
    s.find('?').is_some_and(|i| s[i..].contains(':'))
}

pub(crate) fn resolve_design(design: Option<&Value>, data: &Value, path: &str) -> Value {
    let empty = json!({});
    let design = design.filter(|v| v.is_object()).unwrap_or(&empty);
    let path = segments(path)
        .iter()
        .map(|s| position(s).to_owned())
        .collect::<Vec<_>>();
    let node = |value: &Value| {
        json!({
            "class": appearance(value.get("class"),data,&path),
            "style": appearance(value.get("style"),data,&path),
        })
    };
    json!({"show": show(design.get("show"),data,&path), "main": node(design),
        "label": node(&design["label"]), "wrapper": node(&design["wrapper"]),
        "group": node(&design["group"]), "prepend": node(&design["prepend"])})
}
