//! The recognized form of a CRUDUI pattern: a flat token sequence whose groups are
//! balanced.

use std::fmt;

use crate::validate::unicode::Ranges;

/// Why a pattern is outside the language, as the specification names it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Reason {
    EmptyPattern,
    UnexpectedCharacter,
    UnsupportedConstruct,
    InvalidEscape,
    InvalidClass,
    InvalidRange,
    InvalidProperty,
    InvalidQuantifier,
    UnterminatedGroup,
    UnterminatedClass,
    InvalidGroupName,
    DuplicateGroupName,
    NestingTooDeep,
    PatternTooLarge,
}

impl fmt::Display for Reason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Reason::EmptyPattern => "empty pattern",
            Reason::UnexpectedCharacter => "unexpected character",
            Reason::UnsupportedConstruct => "unsupported construct",
            Reason::InvalidEscape => "invalid escape",
            Reason::InvalidClass => "invalid class",
            Reason::InvalidRange => "invalid range",
            Reason::InvalidProperty => "invalid property",
            Reason::InvalidQuantifier => "invalid quantifier",
            Reason::UnterminatedGroup => "unterminated group",
            Reason::UnterminatedClass => "unterminated class",
            Reason::InvalidGroupName => "invalid group name",
            Reason::DuplicateGroupName => "duplicate group name",
            Reason::NestingTooDeep => "nesting too deep",
            Reason::PatternTooLarge => "pattern too large",
        })
    }
}

/// A pattern outside the language: the reason and the code-point offset.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct PatternError {
    pub(crate) reason: Reason,
    pub(crate) offset: usize,
}

impl fmt::Display for PatternError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} at {}", self.reason, self.offset)
    }
}

/// `\d`, `\w` or `\s`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Shorthand {
    /// `[0-9]`
    Digit,
    /// `[0-9A-Za-z_]`
    Word,
    /// The whitespace set.
    Space,
}

/// `\p{…}` (or `\P{…}` when `negated`): a general category or a script.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Property {
    pub(crate) negated: bool,
    pub(crate) ranges: Ranges,
}

/// A bracket-class member.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ClassItem {
    Char(char),
    /// A non-descending range of single code points.
    Range(char, char),
    /// `\d`, `\w` or `\s`; complements are not members.
    Shorthand(Shorthand),
    Property(Property),
}

/// A construct that matches one code point.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Atom {
    Literal(char),
    /// `.`: any code point except U+000A.
    Any,
    Shorthand {
        set: Shorthand,
        negated: bool,
    },
    Property(Property),
    Class {
        negated: bool,
        items: Vec<ClassItem>,
    },
}

/// One token of a recognized pattern.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Token {
    Atom(Atom),
    /// A group of any accepted kind; names and capture have no meaning for a whole match.
    Open,
    Close,
    Alternate,
    Quantifier {
        min: u32,
        max: Option<u32>,
    },
}
