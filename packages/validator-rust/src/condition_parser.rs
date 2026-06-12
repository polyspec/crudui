//! Condition expression parser: lexer + AST + recursive-descent parser +
//! evaluator. Ports validator-go/validator/condition_parser.go.
//!
//! Grammar (highest level first):
//!   ternary  := or [ "?" ternary ":" ternary ]
//!   or       := and { "||" and }
//!   and      := not { "&&" not }
//!   not      := "!" not | comparison
//!   comparison := primary [ ("in"|"not in") valuelist | cmpop cmpvalue ]
//!   primary  := "(" or ")" | path | literal

use crate::value::{compare, get_nested_value, is_equal, is_truthy};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
enum TokenType {
    Eof,
    String,
    Number,
    Boolean,
    Null,
    Identifier,
    Dot,
    DotDot,
    Asterisk,
    Eq,
    Ne,
    Gt,
    Ge,
    Lt,
    Le,
    And,
    Or,
    Not,
    In,
    NotIn,
    LParen,
    RParen,
    LBracket,
    RBracket,
    Question,
    Colon,
    Comma,
    Invalid,
}

#[derive(Debug, Clone)]
struct Token {
    ttype: TokenType,
    value: String,
    /// Literal payload for String/Number/Boolean/Null tokens.
    literal: Value,
}

#[derive(Debug, Clone)]
pub enum AstNode {
    Binary {
        operator: String,
        left: Box<AstNode>,
        right: Box<AstNode>,
    },
    Unary {
        operator: String,
        operand: Box<AstNode>,
    },
    In {
        negated: bool,
        value: Box<AstNode>,
        list: Vec<AstNode>,
    },
    Path {
        relative: bool,
        levels_up: usize,
        segments: Vec<PathSegment>,
    },
    Literal {
        value: Value,
    },
    Group {
        expression: Box<AstNode>,
    },
    Ternary {
        condition: Box<AstNode>,
        true_value: Box<AstNode>,
        false_value: Box<AstNode>,
    },
}

#[derive(Debug, Clone)]
pub enum PathSegment {
    Identifier(String),
    Wildcard,
    Index(String),
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

struct Lexer {
    input: Vec<u8>,
    position: usize,
}

impl Lexer {
    fn new(input: &str) -> Self {
        Lexer {
            input: input.as_bytes().to_vec(),
            position: 0,
        }
    }

    fn tokenize(&mut self) -> Result<Vec<Token>, String> {
        let mut tokens = Vec::new();
        while !self.is_at_end() {
            if self.match_whitespace() {
                continue;
            }
            let token = self.next_token()?;
            tokens.push(token);
        }
        tokens.push(Token {
            ttype: TokenType::Eof,
            value: String::new(),
            literal: Value::Null,
        });
        Ok(tokens)
    }

    fn next_token(&mut self) -> Result<Token, String> {
        // Multi-character operators first.
        if self.match_not_in() {
            return Ok(self.make_token(TokenType::NotIn, "not in"));
        }
        if self.match_str("&&") {
            return Ok(self.make_token(TokenType::And, "&&"));
        }
        if self.match_str("||") {
            return Ok(self.make_token(TokenType::Or, "||"));
        }
        if self.match_str("==") {
            return Ok(self.make_token(TokenType::Eq, "=="));
        }
        if self.match_str("!=") {
            return Ok(self.make_token(TokenType::Ne, "!="));
        }
        if self.match_str(">=") {
            return Ok(self.make_token(TokenType::Ge, ">="));
        }
        if self.match_str("<=") {
            return Ok(self.make_token(TokenType::Le, "<="));
        }
        if self.match_str(">") {
            return Ok(self.make_token(TokenType::Gt, ">"));
        }
        if self.match_str("<") {
            return Ok(self.make_token(TokenType::Lt, "<"));
        }
        if self.match_str("!") {
            return Ok(self.make_token(TokenType::Not, "!"));
        }

        // Multiple dots (.. or ...).
        if self.peek() == b'.' && self.peek_next() == b'.' {
            let mut dots = String::new();
            while self.peek() == b'.' {
                dots.push('.');
                self.advance();
            }
            return Ok(self.make_token(TokenType::DotDot, &dots));
        }

        if self.match_str(".") {
            return Ok(self.make_token(TokenType::Dot, "."));
        }
        if self.match_str("*") {
            return Ok(self.make_token(TokenType::Asterisk, "*"));
        }
        if self.match_str("(") {
            return Ok(self.make_token(TokenType::LParen, "("));
        }
        if self.match_str(")") {
            return Ok(self.make_token(TokenType::RParen, ")"));
        }
        if self.match_str("[") {
            return Ok(self.make_token(TokenType::LBracket, "["));
        }
        if self.match_str("]") {
            return Ok(self.make_token(TokenType::RBracket, "]"));
        }
        if self.match_str(",") {
            return Ok(self.make_token(TokenType::Comma, ","));
        }
        if self.match_str("?") {
            return Ok(self.make_token(TokenType::Question, "?"));
        }
        if self.match_str(":") {
            return Ok(self.make_token(TokenType::Colon, ":"));
        }

        let c = self.peek();
        if c == b'\'' || c == b'"' {
            return self.read_string();
        }

        if is_letter(c) || c == b'_' {
            return Ok(self.read_identifier());
        }

        if is_digit(c) || (c == b'-' && is_digit(self.peek_next())) {
            return Ok(self.read_number());
        }

        // Unknown character.
        let ch = self.advance();
        Ok(Token {
            ttype: TokenType::Invalid,
            value: (ch as char).to_string(),
            literal: Value::Null,
        })
    }

    fn read_string(&mut self) -> Result<Token, String> {
        let quote = self.advance(); // opening quote
        let mut sb = String::new();
        while !self.is_at_end() && self.peek() != quote {
            if self.peek() == b'\\' {
                self.advance(); // skip backslash
                if !self.is_at_end() {
                    sb.push(self.advance() as char);
                }
            } else {
                sb.push(self.advance() as char);
            }
        }
        if self.is_at_end() {
            return Err("unterminated string".to_string());
        }
        self.advance(); // closing quote
        Ok(Token {
            ttype: TokenType::String,
            value: sb.clone(),
            literal: Value::String(sb),
        })
    }

    fn read_identifier(&mut self) -> Token {
        let start = self.position;
        while !self.is_at_end() && (is_letter(self.peek()) || is_digit(self.peek()) || self.peek() == b'_') {
            self.advance();
        }
        let value = String::from_utf8_lossy(&self.input[start..self.position]).to_string();
        match value.as_str() {
            "true" => Token {
                ttype: TokenType::Boolean,
                value,
                literal: Value::Bool(true),
            },
            "false" => Token {
                ttype: TokenType::Boolean,
                value,
                literal: Value::Bool(false),
            },
            "null" => Token {
                ttype: TokenType::Null,
                value,
                literal: Value::Null,
            },
            "in" => Token {
                ttype: TokenType::In,
                value,
                literal: Value::Null,
            },
            _ => Token {
                ttype: TokenType::Identifier,
                value,
                literal: Value::Null,
            },
        }
    }

    fn read_number(&mut self) -> Token {
        let start = self.position;
        if self.peek() == b'-' {
            self.advance();
        }
        while !self.is_at_end() && is_digit(self.peek()) {
            self.advance();
        }
        if self.peek() == b'.' && is_digit(self.peek_next()) {
            self.advance();
            while !self.is_at_end() && is_digit(self.peek()) {
                self.advance();
            }
        }
        let value = String::from_utf8_lossy(&self.input[start..self.position]).to_string();
        let num: f64 = value.parse().unwrap_or(0.0);
        Token {
            ttype: TokenType::Number,
            value,
            literal: serde_json::json!(num),
        }
    }

    fn match_whitespace(&mut self) -> bool {
        if !self.is_at_end() && (self.peek() as char).is_whitespace() {
            while !self.is_at_end() && (self.peek() as char).is_whitespace() {
                self.advance();
            }
            true
        } else {
            false
        }
    }

    /// match_not_in matches "not" followed by whitespace and "in" with a word
    /// boundary (mirrors Go regexp `^not\s+in\b`).
    fn match_not_in(&mut self) -> bool {
        let rest = &self.input[self.position..];
        if !rest.starts_with(b"not") {
            return false;
        }
        let mut i = 3;
        // require at least one whitespace
        let mut saw_space = false;
        while i < rest.len() && (rest[i] as char).is_whitespace() {
            i += 1;
            saw_space = true;
        }
        if !saw_space {
            return false;
        }
        if !rest[i..].starts_with(b"in") {
            return false;
        }
        i += 2;
        // word boundary: next char must not be a word char
        if i < rest.len() && (is_letter(rest[i]) || is_digit(rest[i]) || rest[i] == b'_') {
            return false;
        }
        self.position += i;
        true
    }

    fn match_str(&mut self, s: &str) -> bool {
        let bytes = s.as_bytes();
        if self.input[self.position..].starts_with(bytes) {
            self.position += bytes.len();
            true
        } else {
            false
        }
    }

    fn make_token(&self, ttype: TokenType, value: &str) -> Token {
        Token {
            ttype,
            value: value.to_string(),
            literal: Value::Null,
        }
    }

    fn peek(&self) -> u8 {
        if self.is_at_end() {
            0
        } else {
            self.input[self.position]
        }
    }

    fn peek_next(&self) -> u8 {
        if self.position + 1 >= self.input.len() {
            0
        } else {
            self.input[self.position + 1]
        }
    }

    fn advance(&mut self) -> u8 {
        if self.is_at_end() {
            return 0;
        }
        let c = self.input[self.position];
        self.position += 1;
        c
    }

    fn is_at_end(&self) -> bool {
        self.position >= self.input.len()
    }
}

fn is_letter(c: u8) -> bool {
    c.is_ascii_alphabetic() || c >= 0x80
}

fn is_digit(c: u8) -> bool {
    c.is_ascii_digit()
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

struct Parser {
    tokens: Vec<Token>,
    current: usize,
}

impl Parser {
    fn new(tokens: Vec<Token>) -> Self {
        Parser { tokens, current: 0 }
    }

    fn parse(&mut self) -> Result<AstNode, String> {
        let expr = self.parse_ternary()?;
        if !self.is_at_end() {
            return Err(format!("unexpected token: {}", self.peek().value));
        }
        Ok(expr)
    }

    fn parse_ternary(&mut self) -> Result<AstNode, String> {
        let condition = self.parse_or()?;
        if self.match_one(&TokenType::Question) {
            let true_value = self.parse_ternary()?;
            if !self.match_one(&TokenType::Colon) {
                return Err("expected ':' in ternary expression".to_string());
            }
            let false_value = self.parse_ternary()?;
            return Ok(AstNode::Ternary {
                condition: Box::new(condition),
                true_value: Box::new(true_value),
                false_value: Box::new(false_value),
            });
        }
        Ok(condition)
    }

    fn parse_or(&mut self) -> Result<AstNode, String> {
        let mut left = self.parse_and()?;
        while self.match_one(&TokenType::Or) {
            let right = self.parse_and()?;
            left = AstNode::Binary {
                operator: "||".to_string(),
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_and(&mut self) -> Result<AstNode, String> {
        let mut left = self.parse_not()?;
        while self.match_one(&TokenType::And) {
            let right = self.parse_not()?;
            left = AstNode::Binary {
                operator: "&&".to_string(),
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_not(&mut self) -> Result<AstNode, String> {
        if self.match_one(&TokenType::Not) {
            let operand = self.parse_not()?;
            return Ok(AstNode::Unary {
                operator: "!".to_string(),
                operand: Box::new(operand),
            });
        }
        self.parse_comparison()
    }

    fn parse_comparison(&mut self) -> Result<AstNode, String> {
        let left = self.parse_primary()?;

        // IN / NOT IN.
        if self.match_any(&[TokenType::In, TokenType::NotIn]) {
            let negated = self.previous().ttype == TokenType::NotIn;
            let list = self.parse_value_list()?;
            return Ok(AstNode::In {
                negated,
                value: Box::new(left),
                list,
            });
        }

        // Comparison operators.
        if self.match_any(&[
            TokenType::Eq,
            TokenType::Ne,
            TokenType::Gt,
            TokenType::Ge,
            TokenType::Lt,
            TokenType::Le,
        ]) {
            let operator = operator_from_token(&self.previous().ttype);
            let right = self.parse_comparison_value()?;
            return Ok(AstNode::Binary {
                operator,
                left: Box::new(left),
                right: Box::new(right),
            });
        }

        Ok(left)
    }

    /// parse_comparison_value: an unquoted identifier with no following dot is
    /// treated as a string literal (mirrors Go parseComparisonValue).
    fn parse_comparison_value(&mut self) -> Result<AstNode, String> {
        if self.check(&TokenType::Identifier) {
            let saved = self.current;
            self.advance();
            if !self.check(&TokenType::Dot) {
                let token = self.previous().clone();
                return Ok(AstNode::Literal {
                    value: Value::String(token.value),
                });
            }
            self.current = saved;
        }
        self.parse_primary()
    }

    fn parse_value_list(&mut self) -> Result<Vec<AstNode>, String> {
        let mut values = Vec::new();
        let has_brackets = self.match_one(&TokenType::LBracket);
        loop {
            let value = self.parse_value()?;
            values.push(value);
            if !self.match_one(&TokenType::Comma) {
                break;
            }
        }
        if has_brackets && !self.match_one(&TokenType::RBracket) {
            return Err("expected closing bracket ]".to_string());
        }
        Ok(values)
    }

    fn parse_value(&mut self) -> Result<AstNode, String> {
        if self.match_any(&[
            TokenType::String,
            TokenType::Number,
            TokenType::Boolean,
            TokenType::Null,
        ]) {
            return Ok(self.make_literal(self.previous().clone()));
        }
        if self.match_one(&TokenType::Identifier) {
            let token = self.previous().clone();
            return Ok(AstNode::Literal {
                value: Value::String(token.value),
            });
        }
        Err("expected value".to_string())
    }

    fn parse_primary(&mut self) -> Result<AstNode, String> {
        if self.match_one(&TokenType::LParen) {
            let expr = self.parse_or()?;
            if !self.match_one(&TokenType::RParen) {
                return Err("expected ')'".to_string());
            }
            return Ok(AstNode::Group {
                expression: Box::new(expr),
            });
        }

        if self.check(&TokenType::Dot) || self.check(&TokenType::DotDot) || self.check(&TokenType::Identifier) {
            return self.parse_path();
        }

        if self.match_any(&[
            TokenType::String,
            TokenType::Number,
            TokenType::Boolean,
            TokenType::Null,
        ]) {
            return Ok(self.make_literal(self.previous().clone()));
        }

        Err("expected expression".to_string())
    }

    fn parse_path(&mut self) -> Result<AstNode, String> {
        let mut relative = false;
        let mut levels_up = 0;

        if self.match_one(&TokenType::DotDot) {
            relative = true;
            let dots = &self.previous().value;
            levels_up = dots.len() - 1; // .. = 1, ... = 2
        } else if self.match_one(&TokenType::Dot) {
            relative = true;
            levels_up = 0;
        }

        let mut segments = Vec::new();
        if relative {
            segments.push(self.parse_path_segment()?);
        } else {
            if !self.check(&TokenType::Identifier) {
                return Err("expected identifier".to_string());
            }
            segments.push(self.parse_path_segment()?);
        }

        while self.match_one(&TokenType::Dot) {
            segments.push(self.parse_path_segment()?);
        }

        Ok(AstNode::Path {
            relative,
            levels_up,
            segments,
        })
    }

    fn parse_path_segment(&mut self) -> Result<PathSegment, String> {
        if self.match_one(&TokenType::Asterisk) {
            return Ok(PathSegment::Wildcard);
        }
        if self.match_one(&TokenType::Number) {
            return Ok(PathSegment::Index(self.previous().value.clone()));
        }
        if self.match_one(&TokenType::Identifier) {
            return Ok(PathSegment::Identifier(self.previous().value.clone()));
        }
        Err("expected path segment".to_string())
    }

    fn make_literal(&self, token: Token) -> AstNode {
        AstNode::Literal {
            value: token.literal,
        }
    }

    fn match_one(&mut self, t: &TokenType) -> bool {
        if self.check(t) {
            self.advance();
            true
        } else {
            false
        }
    }

    fn match_any(&mut self, types: &[TokenType]) -> bool {
        for t in types {
            if self.check(t) {
                self.advance();
                return true;
            }
        }
        false
    }

    fn check(&self, t: &TokenType) -> bool {
        if self.is_at_end() {
            return false;
        }
        &self.peek().ttype == t
    }

    fn advance(&mut self) -> &Token {
        if !self.is_at_end() {
            self.current += 1;
        }
        self.previous()
    }

    fn peek(&self) -> &Token {
        &self.tokens[self.current]
    }

    fn previous(&self) -> &Token {
        &self.tokens[self.current - 1]
    }

    fn is_at_end(&self) -> bool {
        self.peek().ttype == TokenType::Eof
    }
}

fn operator_from_token(t: &TokenType) -> String {
    match t {
        TokenType::Eq => "==",
        TokenType::Ne => "!=",
        TokenType::Gt => ">",
        TokenType::Ge => ">=",
        TokenType::Lt => "<",
        TokenType::Le => "<=",
        _ => "",
    }
    .to_string()
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

struct Evaluator<'a> {
    form_data: &'a Value,
    current_path: &'a [String],
}

impl<'a> Evaluator<'a> {
    fn evaluate(&self, node: &AstNode) -> Value {
        match node {
            AstNode::Binary { operator, left, right } => self.evaluate_binary(operator, left, right),
            AstNode::Unary { operator, operand } => self.evaluate_unary(operator, operand),
            AstNode::In { negated, value, list } => Value::Bool(self.evaluate_in(*negated, value, list)),
            AstNode::Ternary {
                condition,
                true_value,
                false_value,
            } => self.evaluate_ternary(condition, true_value, false_value),
            AstNode::Path {
                relative,
                levels_up,
                segments,
            } => self.evaluate_path(*relative, *levels_up, segments),
            AstNode::Literal { value } => value.clone(),
            AstNode::Group { expression } => self.evaluate(expression),
        }
    }

    fn evaluate_ternary(&self, condition: &AstNode, true_value: &AstNode, false_value: &AstNode) -> Value {
        let cond = self.evaluate(condition);
        if is_truthy(&cond) {
            self.evaluate(true_value)
        } else {
            self.evaluate(false_value)
        }
    }

    fn evaluate_binary(&self, operator: &str, left: &AstNode, right: &AstNode) -> Value {
        let lval = self.evaluate(left);

        if operator == "&&" {
            if !is_truthy(&lval) {
                return Value::Bool(false);
            }
            return Value::Bool(is_truthy(&self.evaluate(right)));
        }
        if operator == "||" {
            if is_truthy(&lval) {
                return Value::Bool(true);
            }
            return Value::Bool(is_truthy(&self.evaluate(right)));
        }

        let rval = self.evaluate(right);
        match operator {
            "==" => Value::Bool(is_equal(&lval, &rval)),
            "!=" => Value::Bool(!is_equal(&lval, &rval)),
            ">" => Value::Bool(compare(&lval, &rval) > 0),
            ">=" => Value::Bool(compare(&lval, &rval) >= 0),
            "<" => Value::Bool(compare(&lval, &rval) < 0),
            "<=" => Value::Bool(compare(&lval, &rval) <= 0),
            _ => Value::Null,
        }
    }

    fn evaluate_unary(&self, operator: &str, operand: &AstNode) -> Value {
        let value = self.evaluate(operand);
        match operator {
            "!" => Value::Bool(!is_truthy(&value)),
            _ => Value::Null,
        }
    }

    fn evaluate_in(&self, negated: bool, value: &AstNode, list: &[AstNode]) -> bool {
        let v = self.evaluate(value);
        for item in list {
            let lv = self.evaluate(item);
            if is_equal(&v, &lv) {
                return !negated;
            }
        }
        negated
    }

    fn evaluate_path(&self, relative: bool, levels_up: usize, segments: &[PathSegment]) -> Value {
        let mut segment_path: Vec<String> = Vec::with_capacity(segments.len());
        for seg in segments {
            match seg {
                PathSegment::Wildcard => segment_path.push("*".to_string()),
                PathSegment::Identifier(s) => segment_path.push(s.clone()),
                PathSegment::Index(s) => segment_path.push(s.clone()),
            }
        }

        if !relative {
            return self.get_value_by_path(&segment_path);
        }

        let mut parent_path: Vec<String> = Vec::new();
        if !self.current_path.is_empty() {
            parent_path = self.current_path[..self.current_path.len() - 1].to_vec();
        }

        let mut base_path = parent_path.clone();
        for _ in 0..levels_up {
            while let Some(last) = base_path.last() {
                if is_numeric_segment(last) {
                    base_path.pop();
                } else {
                    break;
                }
            }
            base_path.pop();
        }

        let mut strict_path = base_path.clone();
        strict_path.extend(segment_path.clone());
        let strict = self.get_value_by_path(&strict_path);
        if !strict.is_null() {
            return strict;
        }

        // Fallback: lexical upward search from the nearest scope outward.
        let mut search = parent_path.clone();
        loop {
            if search.len() != base_path.len() || search != base_path {
                let mut candidate = search.clone();
                candidate.extend(segment_path.clone());
                let v = self.get_value_by_path(&candidate);
                if !v.is_null() {
                    return v;
                }
            }
            if search.is_empty() {
                break;
            }
            search.pop();
        }

        Value::Null
    }

    fn get_value_by_path(&self, path: &[String]) -> Value {
        // Wildcard handling.
        let wildcard_index = path.iter().position(|s| s == "*");
        if let Some(idx) = wildcard_index {
            return self.get_value_with_wildcard(path, idx);
        }

        let mut current = self.form_data;
        for segment in path {
            match current {
                Value::Object(map) => match map.get(segment) {
                    Some(v) => current = v,
                    None => return Value::Null,
                },
                Value::Array(arr) => {
                    let i: usize = match segment.parse() {
                        Ok(i) => i,
                        Err(_) => return Value::Null,
                    };
                    match arr.get(i) {
                        Some(v) => current = v,
                        None => return Value::Null,
                    }
                }
                _ => return Value::Null,
            }
        }
        current.clone()
    }

    fn get_value_with_wildcard(&self, path: &[String], wildcard_index: usize) -> Value {
        let array_path = &path[..wildcard_index];
        let remaining_path = &path[wildcard_index + 1..];

        // Same array context: reuse the current index if currentPath matches.
        if self.current_path.len() > array_path.len() && self.path_prefix_equals(array_path, self.current_path) {
            let idx_str = &self.current_path[array_path.len()];
            if idx_str.parse::<usize>().is_ok() {
                let mut resolved = array_path.to_vec();
                resolved.push(idx_str.clone());
                resolved.extend_from_slice(remaining_path);
                return self.get_value_by_path(&resolved);
            }
        }

        // Different array or no context: ANY strategy.
        let array_data = self.get_value_by_path(array_path);

        if let Value::Object(obj) = &array_data {
            if !remaining_path.is_empty() {
                let rem: Vec<String> = remaining_path.to_vec();
                return get_nested_value(&array_data, &rem).cloned().unwrap_or(Value::Null);
            }
            let _ = obj;
            return array_data;
        }

        let arr = match &array_data {
            Value::Array(a) => a,
            _ => return Value::Null,
        };

        for i in 0..arr.len() {
            let mut resolved = array_path.to_vec();
            resolved.push(i.to_string());
            resolved.extend_from_slice(remaining_path);
            let value = self.get_value_by_path(&resolved);
            if !value.is_null() {
                return value;
            }
        }

        Value::Null
    }

    fn path_prefix_equals(&self, prefix: &[String], path: &[String]) -> bool {
        if prefix.len() > path.len() {
            return false;
        }
        prefix.iter().zip(path.iter()).all(|(a, b)| a == b)
    }
}

fn is_numeric_segment(segment: &str) -> bool {
    !segment.is_empty() && segment.parse::<i64>().is_ok()
}

// ---------------------------------------------------------------------------
// ConditionParser facade
// ---------------------------------------------------------------------------

pub struct ConditionParser {
    cache: HashMap<String, AstNode>,
}

impl ConditionParser {
    pub fn new() -> Self {
        ConditionParser {
            cache: HashMap::new(),
        }
    }

    pub fn parse(&mut self, expression: &str) -> Result<AstNode, String> {
        if let Some(ast) = self.cache.get(expression) {
            return Ok(ast.clone());
        }
        let mut lexer = Lexer::new(expression);
        let tokens = lexer.tokenize()?;
        let mut parser = Parser::new(tokens);
        let ast = parser.parse()?;
        self.cache.insert(expression.to_string(), ast.clone());
        Ok(ast)
    }

    /// evaluate returns the truthiness of an expression.
    pub fn evaluate(&mut self, expression: &str, form_data: &Value, current_path: &[String]) -> Result<bool, String> {
        let ast = self.parse(expression)?;
        let evaluator = Evaluator {
            form_data,
            current_path,
        };
        Ok(is_truthy(&evaluator.evaluate(&ast)))
    }

    /// evaluate_value returns the raw result value (used for ternary branches
    /// resolving to paths/literals).
    pub fn evaluate_value(
        &mut self,
        expression: &str,
        form_data: &Value,
        current_path: &[String],
    ) -> Result<Value, String> {
        let ast = self.parse(expression)?;
        let evaluator = Evaluator {
            form_data,
            current_path,
        };
        Ok(evaluator.evaluate(&ast))
    }
}

impl Default for ConditionParser {
    fn default() -> Self {
        Self::new()
    }
}
