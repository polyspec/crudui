//! CRUDUI expression parser: `Vec<Token>` → AST (expressions.md §3/§4, JS/PHP
//! `Parser` parity).
//!
//! Recursive-descent grammar (EBNF, lowest precedence first):
//!
//! ```text
//!   ternary    = or [ "?" ternary ":" ternary ]        (right-associative)
//!   or         = and { "||" and }
//!   and        = not { "&&" not }
//!   not        = "!" not | comparison
//!   comparison = primary [ cmp_op cmp_value | in_op value_list ]
//!   primary    = "(" or ")" | path | literal
//!   path       = [ "." | ".." ] identifier { "." (identifier | number | "*") }
//! ```
//!
//! Priority and right-associativity come from the grammar productions, not a
//! heuristic. No eval, no split (GRAMMAR §10). CRUDUI-only; legacy
//! (`crate::condition_parser`) is untouched (R7 parallel run).

use super::ast::{LiteralValue, Node, PathSegment};
use super::error::ParseError;
use super::token::{Literal, Token, TokenType};

/// Recursive-descent parser over a lexer's token stream (must end in EOF).
pub struct Parser {
    tokens: Vec<Token>,
    current: usize,
}

impl Parser {
    /// Build a parser over a token stream.
    pub fn new(tokens: Vec<Token>) -> Self {
        Parser { tokens, current: 0 }
    }

    /// Parse the full token stream into one AST root. Errors on trailing tokens.
    pub fn parse(&mut self) -> Result<Node, ParseError> {
        let expression = self.parse_ternary_expression()?;

        if !self.is_at_end() {
            return Err(ParseError::new(format!(
                "Unexpected token after expression: {}",
                self.peek().value
            )));
        }

        Ok(expression)
    }

    // ternary = or [ "?" ternary ":" ternary ]  (right-associative)
    fn parse_ternary_expression(&mut self) -> Result<Node, ParseError> {
        let condition = self.parse_or_expression()?;

        if self.match_type(TokenType::Question) {
            let true_value = self.parse_ternary_expression()?;

            if !self.match_type(TokenType::Colon) {
                return Err(ParseError::new("Missing colon in ternary expression"));
            }

            let false_value = self.parse_ternary_expression()?;

            return Ok(Node::Ternary {
                condition: Box::new(condition),
                true_value: Box::new(true_value),
                false_value: Box::new(false_value),
            });
        }

        Ok(condition)
    }

    // or = and { "||" and }
    fn parse_or_expression(&mut self) -> Result<Node, ParseError> {
        let mut left = self.parse_and_expression()?;

        while self.match_type(TokenType::Or) {
            let right = self.parse_and_expression()?;
            left = Node::Binary {
                operator: "||".to_string(),
                left: Box::new(left),
                right: Box::new(right),
            };
        }

        Ok(left)
    }

    // and = not { "&&" not }
    fn parse_and_expression(&mut self) -> Result<Node, ParseError> {
        let mut left = self.parse_not_expression()?;

        while self.match_type(TokenType::And) {
            let right = self.parse_not_expression()?;
            left = Node::Binary {
                operator: "&&".to_string(),
                left: Box::new(left),
                right: Box::new(right),
            };
        }

        Ok(left)
    }

    // not = "!" not | comparison
    fn parse_not_expression(&mut self) -> Result<Node, ParseError> {
        if self.match_type(TokenType::Not) {
            let operand = self.parse_not_expression()?;
            return Ok(Node::Unary {
                operator: "!".to_string(),
                operand: Box::new(operand),
            });
        }

        self.parse_comparison()
    }

    // comparison = primary [ cmp_op cmp_value | in_op value_list ]
    fn parse_comparison(&mut self) -> Result<Node, ParseError> {
        let left = self.parse_primary()?;

        if self.match_any(&[TokenType::In, TokenType::NotIn]) {
            let negated = self.previous().token_type == TokenType::NotIn;
            let list = self.parse_value_list()?;
            return Ok(Node::In {
                negated,
                value: Box::new(left),
                list,
            });
        }

        if self.match_any(&[
            TokenType::Eq,
            TokenType::Ne,
            TokenType::Gt,
            TokenType::Ge,
            TokenType::Lt,
            TokenType::Le,
        ]) {
            let operator = self.previous().value.clone();
            let right = self.parse_comparison_value()?;
            return Ok(Node::Binary {
                operator,
                left: Box::new(left),
                right: Box::new(right),
            });
        }

        Ok(left)
    }

    // value_list = "[" value { "," value } "]" | value { "," value }
    fn parse_value_list(&mut self) -> Result<Vec<Node>, ParseError> {
        let mut values = Vec::new();

        let has_brackets = self.match_type(TokenType::LBracket);

        values.push(self.parse_value_list_item()?);

        while self.match_type(TokenType::Comma) {
            values.push(self.parse_value_list_item()?);
        }

        if has_brackets && !self.match_type(TokenType::RBracket) {
            return Err(ParseError::new("Missing closing bracket in value list"));
        }

        Ok(values)
    }

    fn parse_value_list_item(&mut self) -> Result<Node, ParseError> {
        // Unquoted identifiers in an "in" list are string literals.
        if self.match_type(TokenType::Identifier) {
            return Ok(Node::Literal(LiteralValue::Str(self.previous().value.clone())));
        }

        if self.match_type(TokenType::Number) {
            return Ok(Node::Literal(number_literal(&self.previous().literal)));
        }

        if self.match_type(TokenType::String) {
            return Ok(Node::Literal(LiteralValue::Str(string_literal(
                &self.previous().literal,
            ))));
        }

        Err(ParseError::new(format!(
            "Invalid value in list: {}",
            self.peek().value
        )))
    }

    /// Right-hand side of a comparison. An unquoted identifier with NO following
    /// dot is a string literal (`.country == US` → 'US'); an identifier followed
    /// by a dot is a path reference, so backtrack and parse it as a path.
    fn parse_comparison_value(&mut self) -> Result<Node, ParseError> {
        if self.check(TokenType::Identifier) {
            let saved = self.current;
            self.advance(); // consume identifier

            if !self.check(TokenType::Dot) {
                return Ok(Node::Literal(LiteralValue::Str(self.previous().value.clone())));
            }

            // Followed by a dot → path reference; backtrack.
            self.current = saved;
        }

        self.parse_primary()
    }

    // primary = "(" or ")" | path | literal
    fn parse_primary(&mut self) -> Result<Node, ParseError> {
        if self.match_type(TokenType::LParen) {
            let expression = self.parse_or_expression()?;
            if !self.match_type(TokenType::RParen) {
                return Err(ParseError::new("Missing closing parenthesis"));
            }
            return Ok(Node::Group(Box::new(expression)));
        }

        if self.check(TokenType::Dot)
            || self.check(TokenType::DotDot)
            || self.check(TokenType::Identifier)
        {
            return self.parse_path();
        }

        if self.match_type(TokenType::String) {
            return Ok(Node::Literal(LiteralValue::Str(string_literal(
                &self.previous().literal,
            ))));
        }

        if self.match_type(TokenType::Number) {
            return Ok(Node::Literal(number_literal(&self.previous().literal)));
        }

        if self.match_type(TokenType::Boolean) {
            let b = matches!(self.previous().literal, Literal::Bool(true));
            return Ok(Node::Literal(LiteralValue::Bool(b)));
        }

        if self.match_type(TokenType::Null) {
            return Ok(Node::Literal(LiteralValue::Null));
        }

        Err(ParseError::new(format!(
            "Unexpected token in expression: {}",
            self.peek().value
        )))
    }

    // path = relative_path | absolute_path
    fn parse_path(&mut self) -> Result<Node, ParseError> {
        let mut relative = false;
        let mut levels_up: i64 = 0;
        let mut segments: Vec<PathSegment> = Vec::new();

        if self.match_type(TokenType::DotDot) {
            relative = true;
            let dots = match self.previous().literal {
                Literal::DotCount(n) => n,
                _ => 0,
            };
            levels_up = dots - 1;
        } else if self.match_type(TokenType::Dot) {
            relative = true;
            levels_up = 0;
        }

        if self.match_type(TokenType::Identifier) {
            segments.push(PathSegment::Identifier(self.previous().value.clone()));
        } else if relative {
            return Err(ParseError::new("Missing field name after dot prefix"));
        }

        while self.match_type(TokenType::Dot) {
            if self.match_type(TokenType::Asterisk) {
                segments.push(PathSegment::Wildcard);
            } else if self.match_type(TokenType::Number) {
                let idx = match &self.previous().literal {
                    Literal::Int(n) => *n,
                    Literal::Float(f) => *f as i64,
                    _ => 0,
                };
                segments.push(PathSegment::Index(idx));
            } else if self.match_type(TokenType::Identifier) {
                segments.push(PathSegment::Identifier(self.previous().value.clone()));
            } else {
                return Err(ParseError::new(format!(
                    "Invalid path segment after dot: {}",
                    self.peek().value
                )));
            }
        }

        Ok(Node::Path {
            relative,
            levels_up,
            segments,
        })
    }

    fn match_type(&mut self, t: TokenType) -> bool {
        if self.check(t) {
            self.advance();
            return true;
        }
        false
    }

    fn match_any(&mut self, types: &[TokenType]) -> bool {
        for &t in types {
            if self.check(t) {
                self.advance();
                return true;
            }
        }
        false
    }

    fn check(&self, t: TokenType) -> bool {
        if self.is_at_end() {
            return false;
        }
        self.peek().token_type == t
    }

    fn advance(&mut self) -> &Token {
        if !self.is_at_end() {
            self.current += 1;
        }
        self.previous()
    }

    fn is_at_end(&self) -> bool {
        self.peek().token_type == TokenType::Eof
    }

    fn peek(&self) -> &Token {
        &self.tokens[self.current]
    }

    fn previous(&self) -> &Token {
        &self.tokens[self.current - 1]
    }
}

fn number_literal(lit: &Literal) -> LiteralValue {
    match lit {
        Literal::Int(n) => LiteralValue::Int(*n),
        Literal::Float(f) => LiteralValue::Float(*f),
        _ => LiteralValue::Int(0),
    }
}

fn string_literal(lit: &Literal) -> String {
    match lit {
        Literal::Str(s) => s.clone(),
        _ => String::new(),
    }
}
