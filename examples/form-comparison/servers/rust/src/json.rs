use crate::{bad, Result};
use ordered_json::{Kind, OrderedMap, Value as Ordered};
use serde_json::{Map, Value};

/// Decode ordered JSON into the validator's existing ordered record model.
pub fn decode(bytes: &[u8]) -> Result<Value> {
    from_ordered(&ordered_json::parse_bytes(bytes).map_err(|e| bad(e.to_string()))?)
}

fn from_ordered(value: &Ordered) -> Result<Value> {
    Ok(match value.kind() {
        Kind::Object => {
            let mut result = Map::new();
            for (key, child) in value.members().unwrap().iter() {
                result.insert(
                    key.string_value().map_err(|e| bad(e.to_string()))?,
                    from_ordered(child)?,
                );
            }
            Value::Object(result)
        }
        Kind::Array => Value::Array(
            value
                .items()
                .unwrap()
                .iter()
                .map(from_ordered)
                .collect::<Result<_>>()?,
        ),
        Kind::String => Value::String(value.string_value().map_err(|e| bad(e.to_string()))?),
        Kind::Boolean => Value::Bool(value.boolean_value().unwrap()),
        Kind::Null => Value::Null,
        Kind::Number => {
            let literal = value.number_literal().unwrap();
            let number: f64 = literal.parse().map_err(|_| bad("Invalid JSON number"))?;
            check_number(number)?;
            Value::Number(literal.parse().map_err(|_| bad("Invalid JSON number"))?)
        }
    })
}

fn check_number(value: f64) -> Result<()> {
    if !value.is_finite() || (value.fract() == 0.0 && value.abs() > 9_007_199_254_740_991.0) {
        return Err(bad("JSON number exceeds the form data range"));
    }
    Ok(())
}

/// Encode responses and storage through the same ordered JSON processor.
pub fn encode(value: &Value) -> Result<String> {
    Ok(ordered_json::stringify(&to_ordered(value)?))
}

fn to_ordered(value: &Value) -> Result<Ordered> {
    Ok(match value {
        Value::Object(values) => {
            let mut members = OrderedMap::new();
            for (key, value) in values {
                members
                    .insert(Ordered::string(key), to_ordered(value)?)
                    .map_err(|e| bad(e.to_string()))?;
            }
            Ordered::object(&members).map_err(|e| bad(e.to_string()))?
        }
        Value::Array(values) => {
            Ordered::array(&values.iter().map(to_ordered).collect::<Result<Vec<_>>>()?)
                .map_err(|e| bad(e.to_string()))?
        }
        Value::String(value) => Ordered::string(value),
        Value::Bool(value) => Ordered::boolean(*value),
        Value::Null => Ordered::null(),
        Value::Number(value) => {
            check_number(value.as_f64().ok_or_else(|| bad("Invalid JSON number"))?)?;
            Ordered::number(&value.to_string()).map_err(|e| bad(e.to_string()))?
        }
    })
}
