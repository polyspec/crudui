//! Parse error for the v2 expression engine.
//!
//! Carries a single human-readable message (the 4-language token/AST contract
//! does not include positions, so neither does this error). Mirrors PHP
//! `ParseError` — message only.

use std::fmt;

/// An error raised by the lexer or parser.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    /// Human-readable failure description.
    pub message: String,
}

impl ParseError {
    /// Build a parse error from a message.
    pub fn new(message: impl Into<String>) -> Self {
        ParseError {
            message: message.into(),
        }
    }
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ParseError {}
