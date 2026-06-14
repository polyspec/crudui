//! CRUDUI expression tokens (EXPRESSION-GRAMMAR §1, JS `types.ts` TokenType parity).
//!
//! `TokenType` is the terminal tag; `Token` is `{type,value,literal}`. WHITESPACE
//! never reaches the token array (the lexer drops it); EOF is always the final
//! token. The serialized shape (`to_value`) byte-matches the shared fixture's
//! `tokens` entries — no `position` field, since the 4-language token contract
//! excludes positions (the Rust AST holds none either).
//!
//! Intentionally absent (GRAMMAR §1·§10): arithmetic `+ - * / %`, function calls,
//! method calls, regex, assignment `=`, bitwise, root path `/`. Do not add them.

use serde_json::{json, Value};

/// Terminal token kind. The string spelling matches the shared fixture's
/// `token.type` ("DOT"|"IDENTIFIER"|…).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokenType {
    /// Quoted string literal `'…'` / `"…"`.
    String,
    /// Integer or decimal number literal.
    Number,
    /// `true` / `false`.
    Boolean,
    /// `null`.
    Null,
    /// Path segment / unquoted identifier `[A-Za-z_][A-Za-z0-9_]*`.
    Identifier,
    /// Single leading `.`.
    Dot,
    /// Two-or-more dots `..` / `…` (parent ascent).
    DotDot,
    /// Wildcard `*`.
    Asterisk,
    /// `==`.
    Eq,
    /// `!=`.
    Ne,
    /// `>`.
    Gt,
    /// `>=`.
    Ge,
    /// `<`.
    Lt,
    /// `<=`.
    Le,
    /// `&&`.
    And,
    /// `||`.
    Or,
    /// `!`.
    Not,
    /// `in`.
    In,
    /// `not in`.
    NotIn,
    /// `(`.
    LParen,
    /// `)`.
    RParen,
    /// `[`.
    LBracket,
    /// `]`.
    RBracket,
    /// `,`.
    Comma,
    /// `?`.
    Question,
    /// `:`.
    Colon,
    /// End of input.
    Eof,
    /// Whitespace run (dropped before the token array is built).
    Whitespace,
    /// One unrecognized character.
    Invalid,
}

impl TokenType {
    /// The fixture string tag for this token type.
    pub fn as_str(self) -> &'static str {
        match self {
            TokenType::String => "STRING",
            TokenType::Number => "NUMBER",
            TokenType::Boolean => "BOOLEAN",
            TokenType::Null => "NULL",
            TokenType::Identifier => "IDENTIFIER",
            TokenType::Dot => "DOT",
            TokenType::DotDot => "DOT_DOT",
            TokenType::Asterisk => "ASTERISK",
            TokenType::Eq => "EQ",
            TokenType::Ne => "NE",
            TokenType::Gt => "GT",
            TokenType::Ge => "GE",
            TokenType::Lt => "LT",
            TokenType::Le => "LE",
            TokenType::And => "AND",
            TokenType::Or => "OR",
            TokenType::Not => "NOT",
            TokenType::In => "IN",
            TokenType::NotIn => "NOT_IN",
            TokenType::LParen => "LPAREN",
            TokenType::RParen => "RPAREN",
            TokenType::LBracket => "LBRACKET",
            TokenType::RBracket => "RBRACKET",
            TokenType::Comma => "COMMA",
            TokenType::Question => "QUESTION",
            TokenType::Colon => "COLON",
            TokenType::Eof => "EOF",
            TokenType::Whitespace => "WHITESPACE",
            TokenType::Invalid => "INVALID",
        }
    }
}

/// A literal payload carried by a value token. `value` for STRING/NUMBER/
/// BOOLEAN/NULL, the dot count for DOT_DOT, the identifier text for IDENTIFIER;
/// `None` for everything else.
#[derive(Debug, Clone, PartialEq)]
pub enum Literal {
    /// Decoded string content (STRING) or identifier text (IDENTIFIER).
    Str(String),
    /// Integer number literal (the fixture keeps integers as integers).
    Int(i64),
    /// Decimal number literal.
    Float(f64),
    /// Boolean keyword literal.
    Bool(bool),
    /// Dot count for a DOT_DOT token.
    DotCount(i64),
    /// No literal payload.
    None,
}

impl Literal {
    fn to_value(&self) -> Value {
        match self {
            Literal::Str(s) => Value::String(s.clone()),
            Literal::Int(n) => json!(n),
            Literal::Float(f) => json!(f),
            Literal::Bool(b) => Value::Bool(*b),
            Literal::DotCount(n) => json!(n),
            Literal::None => Value::Null,
        }
    }
}

/// A single lexical token. `value` is the raw source text; `literal` is the
/// parsed payload (or `None`). No position field — the 4-language token contract
/// excludes positions, matching the shared fixture's token shape.
#[derive(Debug, Clone, PartialEq)]
pub struct Token {
    /// The token kind.
    pub token_type: TokenType,
    /// Raw source text for this token.
    pub value: String,
    /// Parsed literal payload, if any.
    pub literal: Literal,
}

impl Token {
    /// Build a token from its type, raw text, and literal payload.
    pub fn new(token_type: TokenType, value: impl Into<String>, literal: Literal) -> Self {
        Token {
            token_type,
            value: value.into(),
            literal,
        }
    }

    /// Serialize to the shared-fixture token shape `{type,value,literal}`.
    pub fn to_value(&self) -> Value {
        json!({
            "type": self.token_type.as_str(),
            "value": self.value,
            "literal": self.literal.to_value(),
        })
    }
}
