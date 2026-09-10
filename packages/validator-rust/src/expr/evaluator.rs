//! CRUDUI expression evaluator (expressions.md §5/§6/§7, JS `PathResolver` parity).
//!
//! The shared 4-language fixture (`tests/fixtures/expr/cases.json`) is generated
//! from the JS reference engine and is the §9 contract all four engines pass, so
//! this evaluator mirrors validator-ts `PathResolver` function-for-function:
//!
//!   - [`Evaluator::evaluate`] → bool (JS `evaluateCondition`): `Boolean` of the
//!     resolved value for Path/Literal; logical short-circuit; comparison; in;
//!     unary; a ternary is `Boolean(its branch value)`.
//!   - [`Evaluator::evaluate_value`] → value (JS `evaluateExpressionValue`): a
//!     ternary returns its branch value; EVERYTHING else returns the boolean
//!     condition result.
//!
//! truthy (JS `Boolean`): null/false/0/"" falsy; "0", "false", [], {}, and every
//! non-empty value truthy. == / != use JS loose equality (same-type ===, else
//! numeric when both `Number()`-parse, else string). > >= < <= coerce BOTH sides
//! to number (parseFloat, NaN→0) and compare numerically — no lexicographic
//! branch (JS `compare` parity).
//!
//! No eval / no regex evaluation (GRAMMAR §10) — a pure AST walk.

use serde_json::Value;

use super::ast::{LiteralValue, Node, PathSegment};

/// A resolved value is either a single value or a wildcard-produced list of
/// candidate values (JS `resolveValue` returns an array for unresolved
/// wildcards; ANY/CURRENT collapse happens in [`Evaluator::evaluate_binary`] /
/// [`Evaluator::evaluate_in`]).
enum Resolved {
    Single(Value),
    List(Vec<Value>),
}

/// AST evaluator bound to a form-data tree and the current field path.
pub struct Evaluator<'a> {
    form_data: &'a Value,
    current_path: &'a [String],
}

impl<'a> Evaluator<'a> {
    /// Build an evaluator over the full form data and the path of the field
    /// carrying the condition (including the field name itself).
    pub fn new(form_data: &'a Value, current_path: &'a [String]) -> Self {
        Evaluator {
            form_data,
            current_path,
        }
    }

    /// Evaluate to a boolean condition result (JS `evaluateCondition`).
    pub fn evaluate(&self, node: &Node) -> bool {
        match node {
            Node::Binary { .. } => self.evaluate_binary(node),
            Node::Unary { .. } => self.evaluate_unary(node),
            Node::In { .. } => self.evaluate_in(node),
            Node::Group(expr) => self.evaluate(expr),
            Node::Ternary { .. } => is_truthy(&self.evaluate_ternary(node)),
            Node::Path { .. } | Node::Literal(_) => {
                is_truthy(&self.resolve_value(node).into_single())
            }
        }
    }

    /// Evaluate to a value (JS `evaluateExpressionValue`). A ternary returns its
    /// chosen branch's RAW value; every other node returns its boolean condition
    /// result (the shared fixture's `value` for non-ternary mirrors `truthy`).
    pub fn evaluate_value(&self, node: &Node) -> Value {
        match node {
            Node::Ternary { .. } => self.evaluate_ternary(node),
            Node::Group(expr) => self.evaluate_value(expr),
            _ => Value::Bool(self.evaluate(node)),
        }
    }

    /// Resolve a ternary branch to its RAW value (JS `resolveTernaryBranchValue`):
    /// nested ternary recurses; literal/path return their value; logical/in/
    /// comparison/unary return their boolean.
    fn resolve_ternary_branch_value(&self, node: &Node) -> Value {
        match node {
            Node::Ternary { .. } => self.evaluate_ternary(node),
            Node::Group(expr) => self.resolve_ternary_branch_value(expr),
            Node::Literal(_) => self.resolve_value(node).into_single(),
            Node::Path { .. } => self.resolve_value(node).into_single(),
            Node::Binary { .. } => Value::Bool(self.evaluate_binary(node)),
            Node::Unary { .. } => Value::Bool(self.evaluate_unary(node)),
            Node::In { .. } => Value::Bool(self.evaluate_in(node)),
        }
    }

    fn evaluate_ternary(&self, node: &Node) -> Value {
        if let Node::Ternary {
            condition,
            true_value,
            false_value,
        } = node
        {
            if self.evaluate(condition) {
                self.resolve_ternary_branch_value(true_value)
            } else {
                self.resolve_ternary_branch_value(false_value)
            }
        } else {
            Value::Null
        }
    }

    fn evaluate_binary(&self, node: &Node) -> bool {
        let (operator, left, right) = match node {
            Node::Binary {
                operator,
                left,
                right,
            } => (operator.as_str(), left, right),
            _ => return false,
        };

        // Short-circuit logical operators.
        if operator == "&&" {
            return self.evaluate(left) && self.evaluate(right);
        }
        if operator == "||" {
            return self.evaluate(left) || self.evaluate(right);
        }

        let left_value = self.resolve_value(left);
        let right_value = self.resolve_value(right).into_single();

        // Wildcard path may resolve to a list of candidate values: ANY match.
        match left_value {
            Resolved::List(items) => items
                .iter()
                .any(|lv| compare_op(lv, &right_value, operator)),
            Resolved::Single(lv) => compare_op(&lv, &right_value, operator),
        }
    }

    fn evaluate_unary(&self, node: &Node) -> bool {
        if let Node::Unary { operator, operand } = node {
            if operator == "!" {
                return !self.evaluate(operand);
            }
        }
        false
    }

    fn evaluate_in(&self, node: &Node) -> bool {
        let (negated, value, list) = match node {
            Node::In {
                negated,
                value,
                list,
            } => (*negated, value, list),
            _ => return false,
        };

        let probe = self.resolve_value(value);
        let candidates: Vec<Value> = list
            .iter()
            .map(|n| self.resolve_value(n).into_single())
            .collect();

        // Wildcard value resolved to a list: ANY element passing membership.
        match probe {
            Resolved::List(items) => items.iter().any(|v| {
                let included = in_list(v, &candidates);
                if negated {
                    !included
                } else {
                    included
                }
            }),
            Resolved::Single(v) => {
                let included = in_list(&v, &candidates);
                if negated {
                    !included
                } else {
                    included
                }
            }
        }
    }

    /// Resolve a node to its raw value (JS `resolveValue`): Literal → its value;
    /// Path → the data at the resolved path (wildcards handled); Group → the
    /// inner condition's boolean.
    fn resolve_value(&self, node: &Node) -> Resolved {
        match node {
            Node::Literal(lit) => Resolved::Single(literal_to_value(lit)),
            Node::Path { .. } => self.resolve_path(node),
            Node::Group(expr) => Resolved::Single(Value::Bool(self.evaluate(expr))),
            _ => Resolved::Single(Value::Null),
        }
    }

    // --- path resolution (JS resolvePathSegments + resolveValue parity) -------

    fn resolve_path(&self, node: &Node) -> Resolved {
        let mut resolved_path = self.resolve_path_segments(node);

        if has_wildcard(&resolved_path) {
            // CURRENT strategy: replace wildcards with current array indices.
            resolved_path = replace_wildcard_with_index(&resolved_path, self.current_path);

            if has_wildcard(&resolved_path) {
                // Still wildcarded: resolve to the list of all matching values.
                let resolved = self.resolve_wildcard_path(&resolved_path);
                return Resolved::List(resolved.into_iter().map(|(_, v)| v).collect());
            }
        }

        Resolved::Single(self.get_value_by_path(&resolved_path))
    }

    /// Compute the absolute path segments for a Path node (JS resolvePathSegments).
    fn resolve_path_segments(&self, node: &Node) -> Vec<String> {
        let (relative, levels_up, segments) = match node {
            Node::Path {
                relative,
                levels_up,
                segments,
            } => (*relative, *levels_up, segments),
            _ => return Vec::new(),
        };

        let mut base_path: Vec<String> = if relative {
            let mut bp: Vec<String> = self.current_path.to_vec();

            // Remove the current field name itself.
            if !bp.is_empty() {
                bp.pop();
            }

            // Ascend levelsUp parents; array indices do not count as a level.
            for _ in 0..levels_up.max(0) {
                while bp.last().map(|s| is_numeric_segment(s)).unwrap_or(false) {
                    bp.pop();
                }
                if !bp.is_empty() {
                    bp.pop();
                }
            }
            bp
        } else {
            Vec::new()
        };

        for seg in segments {
            match seg {
                PathSegment::Identifier(v) => base_path.push(v.clone()),
                PathSegment::Index(i) => base_path.push(i.to_string()),
                PathSegment::Wildcard => base_path.push("*".to_string()),
            }
        }

        base_path
    }

    /// Read the value at a concrete path (JS getValueByPath). A missing key
    /// yields null. Numeric segments index into array values.
    fn get_value_by_path(&self, path: &[String]) -> Value {
        let mut current = self.form_data;

        for segment in path {
            match current {
                Value::Object(map) => match map.get(segment) {
                    Some(v) => current = v,
                    None => return Value::Null,
                },
                Value::Array(arr) => match segment.parse::<usize>() {
                    Ok(idx) => match arr.get(idx) {
                        Some(v) => current = v,
                        None => return Value::Null,
                    },
                    Err(_) => return Value::Null,
                },
                Value::Null => return Value::Null,
                _ => return Value::Null,
            }
        }

        current.clone()
    }

    /// Resolve a wildcard path to all concrete (path,value) pairs (JS
    /// resolveWildcardPath, ANY strategy across the array; object source skips
    /// the wildcard index per multiple:'only').
    fn resolve_wildcard_path(&self, path: &[String]) -> Vec<(Vec<String>, Value)> {
        let wildcard_index = index_of_wildcard(path);
        if wildcard_index.is_none() {
            return vec![(path.to_vec(), self.get_value_by_path(path))];
        }
        let wildcard_index = wildcard_index.unwrap();

        let array_path = &path[..wildcard_index];
        let remaining_path = &path[wildcard_index + 1..];
        let array_data = self.get_value_by_path(array_path);

        match &array_data {
            // Object source: skip the wildcard index, access remaining directly.
            Value::Object(_) => {
                let concrete: Vec<String> = array_path
                    .iter()
                    .cloned()
                    .chain(remaining_path.iter().cloned())
                    .collect();
                self.resolve_wildcard_path(&concrete)
            }
            Value::Array(arr) => {
                let mut results = Vec::new();
                for i in 0..arr.len() {
                    let concrete: Vec<String> = array_path
                        .iter()
                        .cloned()
                        .chain(std::iter::once(i.to_string()))
                        .chain(remaining_path.iter().cloned())
                        .collect();
                    results.extend(self.resolve_wildcard_path(&concrete));
                }
                results
            }
            _ => Vec::new(),
        }
    }
}

impl Resolved {
    fn into_single(self) -> Value {
        match self {
            Resolved::Single(v) => v,
            // A wildcard list flowing into a single-value slot becomes a JSON
            // array (JS map → array); used only on the comparison RHS, where the
            // fixture never produces a wildcard.
            Resolved::List(items) => Value::Array(items),
        }
    }
}

/// Replace each wildcard with the corresponding array index from currentPath, in
/// order (JS replaceWildcardWithIndex). Wildcards with no matching index stay as
/// '*' for later list resolution.
fn replace_wildcard_with_index(path: &[String], current_path: &[String]) -> Vec<String> {
    let array_indices: Vec<String> = current_path
        .iter()
        .filter(|s| is_numeric_segment(s))
        .cloned()
        .collect();

    let mut result = Vec::with_capacity(path.len());
    let mut cursor = 0usize;
    for segment in path {
        if segment == "*" {
            if cursor < array_indices.len() {
                result.push(array_indices[cursor].clone());
                cursor += 1;
            } else {
                result.push("*".to_string());
            }
        } else {
            result.push(segment.clone());
        }
    }

    result
}

fn has_wildcard(path: &[String]) -> bool {
    path.iter().any(|s| s == "*")
}

fn index_of_wildcard(path: &[String]) -> Option<usize> {
    path.iter().position(|s| s == "*")
}

fn is_numeric_segment(segment: &str) -> bool {
    !segment.is_empty() && segment.bytes().all(|b| b.is_ascii_digit())
}

fn literal_to_value(lit: &LiteralValue) -> Value {
    match lit {
        LiteralValue::Str(s) => Value::String(s.clone()),
        LiteralValue::Int(n) => Value::from(*n),
        LiteralValue::Float(f) => Value::from(*f),
        LiteralValue::Bool(b) => Value::Bool(*b),
        LiteralValue::Null => Value::Null,
    }
}

fn in_list(value: &Value, list: &[Value]) -> bool {
    list.iter().any(|item| loose_equals(value, item))
}

fn compare_op(left: &Value, right: &Value, operator: &str) -> bool {
    match operator {
        "==" => loose_equals(left, right),
        "!=" => !loose_equals(left, right),
        ">" => coerce_number(left) > coerce_number(right),
        ">=" => coerce_number(left) >= coerce_number(right),
        "<" => coerce_number(left) < coerce_number(right),
        "<=" => coerce_number(left) <= coerce_number(right),
        _ => false,
    }
}

// --- value semantics (JS truthy / looseEquals / coerceNumber parity) ---------

/// Truthy test (JS `Boolean`). null/false/0/0.0/"" are falsy; "0", "false",
/// empty array, empty object, and every non-empty value are truthy.
pub fn is_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => {
            if let Some(f) = n.as_f64() {
                f != 0.0
            } else {
                true
            }
        }
        Value::String(s) => !s.is_empty(),
        // [] and {} are both truthy in JS (Boolean of any object/array).
        Value::Array(_) => true,
        Value::Object(_) => true,
    }
}

/// JS `typeof` bucket: number covers int and float; arrays/objects are 'object'.
fn js_type_of(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) | Value::Object(_) => "object",
    }
}

/// Loose equality (JS `looseEquals`). Same JS type compares directly; null equals
/// only null; otherwise numeric equality when both `Number()`-parse, else string
/// equality.
fn loose_equals(a: &Value, b: &Value) -> bool {
    if js_type_of(a) == js_type_of(b) {
        return values_strict_eq(a, b);
    }

    if a.is_null() {
        return b.is_null();
    }
    if b.is_null() {
        return false;
    }

    if let (Some(an), Some(bn)) = (js_number(a), js_number(b)) {
        return an == bn;
    }

    to_string(a) == to_string(b)
}

/// `===` within a single JS type. Numbers compare by f64 value (so 1 === 1.0);
/// objects/arrays compare by identity in JS, but the fixture only equates them
/// via this same-type path when they are deeply equal, so structural equality is
/// the safe contract here.
fn values_strict_eq(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => match (x.as_f64(), y.as_f64()) {
            (Some(xf), Some(yf)) => xf == yf,
            _ => x == y,
        },
        _ => a == b,
    }
}

/// JS `Number(value)` for equality: numbers pass; a string is numeric only when
/// the WHOLE string parses (JS `Number('12abc')` is NaN; `Number('')` is 0);
/// booleans → 1/0. Returns `None` for a non-numeric string.
fn js_number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(n) => n.as_f64(),
        Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                return Some(0.0); // JS Number('') === 0
            }
            trimmed.parse::<f64>().ok()
        }
        _ => None,
    }
}

/// Coerce a value to a number for comparison (JS `coerceNumber`): numbers pass
/// through; a string is parseFloat-ed (NaN→0); booleans → 1/0; else 0.
fn coerce_number(value: &Value) -> f64 {
    match value {
        Value::Number(n) => n.as_f64().unwrap_or(0.0),
        Value::String(s) => parse_float_prefix(s).unwrap_or(0.0),
        Value::Bool(b) => {
            if *b {
                1.0
            } else {
                0.0
            }
        }
        _ => 0.0,
    }
}

/// parseFloat-style leading-number parse (JS `parseFloat`): reads an optional
/// sign, digits, fraction, exponent prefix; returns `None` when no number leads
/// the string.
fn parse_float_prefix(value: &str) -> Option<f64> {
    let bytes = value.as_bytes();
    let mut i = 0usize;

    // Leading JS whitespace.
    while i < bytes.len() && matches!(bytes[i], b' ' | b'\t' | b'\n' | b'\r') {
        i += 1;
    }

    let start = i;

    if i < bytes.len() && (bytes[i] == b'+' || bytes[i] == b'-') {
        i += 1;
    }

    let mut has_int_digits = false;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
        has_int_digits = true;
    }

    let mut has_frac_digits = false;
    if i < bytes.len() && bytes[i] == b'.' {
        i += 1;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
            has_frac_digits = true;
        }
    }

    if !has_int_digits && !has_frac_digits {
        return None;
    }

    // Optional exponent (only kept if well-formed; JS parseFloat tolerates a bare
    // trailing 'e' by ignoring it).
    if i < bytes.len() && (bytes[i] == b'e' || bytes[i] == b'E') {
        let exp_marker = i;
        let mut j = i + 1;
        if j < bytes.len() && (bytes[j] == b'+' || bytes[j] == b'-') {
            j += 1;
        }
        let mut has_exp_digits = false;
        while j < bytes.len() && bytes[j].is_ascii_digit() {
            j += 1;
            has_exp_digits = true;
        }
        if has_exp_digits {
            i = j;
        } else {
            i = exp_marker;
        }
    }

    value[start..i].parse::<f64>().ok()
}

/// JS `String(value)`: null→"", strings pass, booleans→"true"/"false", integral
/// floats drop the fraction (so 5.0 → "5").
fn to_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Bool(b) => {
            if *b {
                "true".to_string()
            } else {
                "false".to_string()
            }
        }
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                i.to_string()
            } else if let Some(u) = n.as_u64() {
                u.to_string()
            } else if let Some(f) = n.as_f64() {
                if f.is_finite() && f == f.floor() {
                    (f as i64).to_string()
                } else {
                    f.to_string()
                }
            } else {
                String::new()
            }
        }
        _ => String::new(),
    }
}
