//! CRUDUI expression engine — formal lexer→parser→AST→evaluator (expressions.md
//! §0–§8). The single truth is the shared 4-language fixture
//! `tests/fixtures/expr/cases.json`; this engine matches it byte-for-byte
//! (tokens, AST without `position`, evaluated value, and truthy).
//!
//! No eval / no regex-split anywhere
//! (GRAMMAR §10) — a strictly staged pipeline.

pub mod ast;
pub mod condition_map;
pub mod error;
pub mod evaluator;
pub mod expression;
pub mod lexer;
pub mod parser;
pub mod token;

pub use ast::{LiteralValue, Node, PathSegment};
pub use error::ParseError;
pub use evaluator::{is_truthy, Evaluator};
pub use expression::Expression;
pub use lexer::Lexer;
pub use parser::Parser;
pub use token::{Literal, Token, TokenType};
