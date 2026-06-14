//! Public facade for the v2 expression engine: string → tokens → AST → value.
//!
//! The pipeline is strictly staged (GRAMMAR §0): never split a string to
//! evaluate, never eval. `evaluate` returns a boolean condition result;
//! `evaluate_value` returns a ternary's branch value and the boolean condition
//! result for everything else (JS `evaluateExpressionValue` parity — the shared
//! 4-language fixture is generated from the JS engine).

use serde_json::Value;

use super::ast::Node;
use super::error::ParseError;
use super::evaluator::Evaluator;
use super::lexer::Lexer;
use super::parser::Parser;
use super::token::Token;

/// Stateless entry points for the v2 expression engine.
pub struct Expression;

impl Expression {
    /// Tokenize an expression. WHITESPACE excluded; ends with EOF.
    pub fn tokenize(expression: &str) -> Result<Vec<Token>, ParseError> {
        Lexer::new(expression).tokenize()
    }

    /// Parse an expression into its AST.
    pub fn parse(expression: &str) -> Result<Node, ParseError> {
        let tokens = Self::tokenize(expression)?;
        Parser::new(tokens).parse()
    }

    /// Evaluate to a truthy boolean (show/display call site).
    pub fn evaluate(
        expression: &str,
        form_data: &Value,
        current_path: &[String],
    ) -> Result<bool, ParseError> {
        let ast = Self::parse(expression)?;
        Ok(Evaluator::new(form_data, current_path).evaluate(&ast))
    }

    /// Evaluate to the raw value (class/style/number/null call site).
    pub fn evaluate_value(
        expression: &str,
        form_data: &Value,
        current_path: &[String],
    ) -> Result<Value, ParseError> {
        let ast = Self::parse(expression)?;
        Ok(Evaluator::new(form_data, current_path).evaluate_value(&ast))
    }
}
