//! CRUDUI expression lexer (EXPRESSION-GRAMMAR §1, JS/PHP `Lexer` parity).
//!
//! Turns a condition string into a `Vec<Token>` ending in EOF. WHITESPACE is
//! consumed but never emitted. The token order, multi-char operator precedence,
//! multi-dot handling, string escapes, and number rules mirror validator-js
//! `Lexer` exactly, because the shared fixture's `tokens` array is byte-compared
//! across 4 languages.
//!
//! NO regex-split / no string-split evaluation anywhere (GRAMMAR §10): a single
//! forward byte scan. Identifiers are ASCII (`[A-Za-z_][A-Za-z0-9_]*`), so
//! byte-wise scanning is exact.

use super::error::ParseError;
use super::token::{Literal, Token, TokenType};

/// Forward-scanning tokenizer over a single expression string.
pub struct Lexer {
    input: Vec<u8>,
    position: usize,
}

impl Lexer {
    /// Build a lexer over the given expression string.
    pub fn new(input: &str) -> Self {
        Lexer {
            input: input.as_bytes().to_vec(),
            position: 0,
        }
    }

    /// Tokenize the whole input. WHITESPACE tokens are dropped; an EOF token is
    /// always appended last.
    pub fn tokenize(&mut self) -> Result<Vec<Token>, ParseError> {
        let mut tokens = Vec::new();

        while !self.is_at_end() {
            let token = self.next_token()?;
            if token.token_type != TokenType::Whitespace {
                tokens.push(token);
            }
        }

        tokens.push(Token::new(TokenType::Eof, "", Literal::None));
        Ok(tokens)
    }

    fn next_token(&mut self) -> Result<Token, ParseError> {
        let start = self.position;

        // Whitespace
        if self.match_whitespace() {
            let raw = self.slice(start, self.position);
            return Ok(Token::new(TokenType::Whitespace, raw, Literal::None));
        }

        // Multi-character operators first (order matters: longest / specific first)
        if self.match_string("not in") || self.match_string("not  in") {
            return Ok(Token::new(TokenType::NotIn, "not in", Literal::None));
        }
        if self.match_string("&&") {
            return Ok(Token::new(TokenType::And, "&&", Literal::None));
        }
        if self.match_string("||") {
            return Ok(Token::new(TokenType::Or, "||", Literal::None));
        }
        if self.match_string("==") {
            return Ok(Token::new(TokenType::Eq, "==", Literal::None));
        }
        if self.match_string("!=") {
            return Ok(Token::new(TokenType::Ne, "!=", Literal::None));
        }
        if self.match_string(">=") {
            return Ok(Token::new(TokenType::Ge, ">=", Literal::None));
        }
        if self.match_string("<=") {
            return Ok(Token::new(TokenType::Le, "<=", Literal::None));
        }
        if self.match_string(">") {
            return Ok(Token::new(TokenType::Gt, ">", Literal::None));
        }
        if self.match_string("<") {
            return Ok(Token::new(TokenType::Lt, "<", Literal::None));
        }

        // NOT operator (single !), only when not part of !=
        if self.peek() == b'!' && self.peek_next() != b'=' {
            self.advance();
            return Ok(Token::new(TokenType::Not, "!", Literal::None));
        }

        // Multi-dot (.., ..., etc.) vs single dot
        if self.peek() == b'.' {
            let mut dot_count: i64 = 0;
            let dot_start = self.position;
            while self.peek() == b'.' {
                dot_count += 1;
                self.advance();
            }

            if dot_count > 1 {
                let raw = self.slice(dot_start, self.position);
                return Ok(Token::new(
                    TokenType::DotDot,
                    raw,
                    Literal::DotCount(dot_count),
                ));
            }
            return Ok(Token::new(TokenType::Dot, ".", Literal::None));
        }

        if self.match_string("*") {
            return Ok(Token::new(TokenType::Asterisk, "*", Literal::None));
        }
        if self.match_string("(") {
            return Ok(Token::new(TokenType::LParen, "(", Literal::None));
        }
        if self.match_string(")") {
            return Ok(Token::new(TokenType::RParen, ")", Literal::None));
        }
        if self.match_string("[") {
            return Ok(Token::new(TokenType::LBracket, "[", Literal::None));
        }
        if self.match_string("]") {
            return Ok(Token::new(TokenType::RBracket, "]", Literal::None));
        }
        if self.match_string(",") {
            return Ok(Token::new(TokenType::Comma, ",", Literal::None));
        }
        if self.match_string("?") {
            return Ok(Token::new(TokenType::Question, "?", Literal::None));
        }
        if self.match_string(":") {
            return Ok(Token::new(TokenType::Colon, ":", Literal::None));
        }

        // String literal
        let ch = self.peek();
        if ch == b'\'' || ch == b'"' {
            return self.read_string();
        }

        // Number: leading digit, or leading '-' directly followed by a digit
        if is_digit(ch) || (ch == b'-' && is_digit(self.peek_next())) {
            return Ok(self.read_number());
        }

        // Keyword / identifier
        if is_alpha(ch) {
            return Ok(self.read_identifier());
        }

        // Unknown single character
        let raw = self.slice(start, start + 1);
        self.advance();
        Ok(Token::new(TokenType::Invalid, raw, Literal::None))
    }

    fn read_string(&mut self) -> Result<Token, ParseError> {
        let quote = self.advance();
        let mut value = String::new();

        while !self.is_at_end() && self.peek() != quote {
            if self.peek() == b'\\' {
                self.advance();
                if !self.is_at_end() {
                    let escaped = self.advance();
                    match escaped {
                        b'n' => value.push('\n'),
                        b't' => value.push('\t'),
                        b'r' => value.push('\r'),
                        b'\\' => value.push('\\'),
                        b'\'' => value.push('\''),
                        b'"' => value.push('"'),
                        other => value.push(other as char),
                    }
                }
            } else {
                value.push(self.advance() as char);
            }
        }

        if self.is_at_end() {
            return Err(ParseError::new("Unterminated string literal"));
        }

        self.advance(); // closing quote

        // JS stores value = quote + content + quote (raw), literal = decoded.
        let q = quote as char;
        let raw = format!("{}{}{}", q, value, q);
        Ok(Token::new(TokenType::String, raw, Literal::Str(value)))
    }

    fn read_number(&mut self) -> Token {
        let start = self.position;

        if self.peek() == b'-' {
            self.advance();
        }

        while is_digit(self.peek()) {
            self.advance();
        }

        let mut is_float = false;
        if self.peek() == b'.' && is_digit(self.peek_next()) {
            is_float = true;
            self.advance(); // consume '.'
            while is_digit(self.peek()) {
                self.advance();
            }
        }

        // Scientific notation (JS parity).
        if self.peek() == b'e' || self.peek() == b'E' {
            is_float = true;
            self.advance();
            if self.peek() == b'+' || self.peek() == b'-' {
                self.advance();
            }
            while is_digit(self.peek()) {
                self.advance();
            }
        }

        let raw = self.slice(start, self.position);

        // Keep integers as integers so fixture integer literals stay integers;
        // fractional/exponent forms become floats.
        let literal = if is_float {
            Literal::Float(raw.parse::<f64>().unwrap_or(0.0))
        } else {
            match raw.parse::<i64>() {
                Ok(n) => Literal::Int(n),
                Err(_) => Literal::Float(raw.parse::<f64>().unwrap_or(0.0)),
            }
        };

        Token::new(TokenType::Number, raw, literal)
    }

    fn read_identifier(&mut self) -> Token {
        let start = self.position;

        while is_alpha_numeric(self.peek()) {
            self.advance();
        }

        let value = self.slice(start, self.position);

        match value.as_str() {
            "true" => Token::new(TokenType::Boolean, value, Literal::Bool(true)),
            "false" => Token::new(TokenType::Boolean, value, Literal::Bool(false)),
            "null" => Token::new(TokenType::Null, value, Literal::None),
            "in" => Token::new(TokenType::In, value, Literal::None),
            "not" => {
                // Lookahead for "not in" (whitespace then 'in')
                let saved = self.position;
                self.match_whitespace();
                if self.match_string("in") {
                    return Token::new(TokenType::NotIn, "not in", Literal::None);
                }
                self.position = saved;
                Token::new(TokenType::Identifier, value.clone(), Literal::Str(value))
            }
            _ => Token::new(TokenType::Identifier, value.clone(), Literal::Str(value)),
        }
    }

    fn match_whitespace(&mut self) -> bool {
        let mut matched = false;
        while !self.is_at_end() && is_whitespace(self.peek()) {
            self.advance();
            matched = true;
        }
        matched
    }

    fn match_string(&mut self, s: &str) -> bool {
        let bytes = s.as_bytes();
        let end = self.position + bytes.len();
        if end <= self.input.len() && &self.input[self.position..end] == bytes {
            self.position = end;
            return true;
        }
        false
    }

    fn slice(&self, start: usize, end: usize) -> String {
        // Tokens are ASCII-bounded; from_utf8_lossy is exact for our byte spans.
        String::from_utf8_lossy(&self.input[start..end]).into_owned()
    }

    fn peek(&self) -> u8 {
        if self.position < self.input.len() {
            self.input[self.position]
        } else {
            0
        }
    }

    fn peek_next(&self) -> u8 {
        if self.position + 1 < self.input.len() {
            self.input[self.position + 1]
        } else {
            0
        }
    }

    fn advance(&mut self) -> u8 {
        let ch = self.peek();
        self.position += 1;
        ch
    }

    fn is_at_end(&self) -> bool {
        self.position >= self.input.len()
    }
}

fn is_digit(c: u8) -> bool {
    c.is_ascii_digit()
}

fn is_alpha(c: u8) -> bool {
    c.is_ascii_alphabetic() || c == b'_'
}

fn is_alpha_numeric(c: u8) -> bool {
    is_alpha(c) || is_digit(c)
}

fn is_whitespace(c: u8) -> bool {
    matches!(c, b' ' | b'\t' | b'\n' | b'\r' | 0x0b | 0x0c)
}
