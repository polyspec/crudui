//! The CRUDUI pattern language (validation rules, "Patterns").
//!
//! A pattern is recognized with the language's grammar, built into a tree whose
//! size is checked, and compiled to a Thompson NFA over code-point sets from the
//! embedded Unicode data. No regular-expression engine is involved, so matching is
//! the same in every runtime and linear in the value's length.

mod nfa;
mod recognizer;
mod sets;
mod syntax;
mod tree;

pub(crate) use nfa::Program;
pub(crate) use syntax::PatternError;

use syntax::Reason;

/// Recognize and compile a pattern for a whole-text match.
pub(crate) fn compile(source: &str) -> Result<Program, PatternError> {
    let tokens = recognizer::recognize(source)?;
    let (root, sets) = tree::build(tokens);
    if root.size() > tree::SIZE_LIMIT {
        return Err(PatternError {
            reason: Reason::PatternTooLarge,
            offset: 0,
        });
    }
    Ok(Program::new(&root, sets))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::validate::unicode::{GENERAL_CATEGORIES, SCRIPTS};
    use std::time::{Duration, Instant};

    fn rejection(source: &str) -> (Reason, usize) {
        let error = compile(source).unwrap_err();
        (error.reason, error.offset)
    }

    fn matches(source: &str, text: &str) -> bool {
        compile(source).unwrap().is_match(text)
    }

    #[test]
    fn every_category_and_script_compiles() {
        for (script, _) in SCRIPTS {
            for source in [
                format!("\\p{{Script={script}}}"),
                format!("\\P{{Script={script}}}"),
                format!("[\\P{{Script={script}}}]"),
            ] {
                assert!(compile(&source).is_ok(), "{source}");
            }
        }
        for (category, _) in GENERAL_CATEGORIES {
            for source in [
                format!("\\p{{{category}}}"),
                format!("\\P{{{category}}}"),
                format!("[\\p{{{category}}}]"),
            ] {
                assert!(compile(&source).is_ok(), "{source}");
            }
        }
    }

    #[test]
    fn properties_use_the_embedded_data() {
        // U+088F and U+A7CE are unassigned in Unicode 16.0.
        assert!(matches(r"\P{L}\p{C}", "\u{88F}\u{A7CE}"));
        assert!(!matches(r"\p{L}", "\u{A7CE}"));
        assert!(matches(r"\p{Lu}\p{Script=Hangul}\P{N}", "A\u{D55C}x"));
        assert!(!matches(r"\p{Script=Hangul}", "a"));
        assert!(matches(r"[\p{Nd}\P{Script=Latin}]+", "1\u{D55C}"));
        assert!(!matches(r"[^\p{Nd}\P{Script=Latin}]", "1"));
        assert!(matches(r"[^\p{Nd}\P{Script=Latin}]", "x"));
    }

    /// Rust text holds only Unicode scalar values, so a lone surrogate (which a
    /// JavaScript string can hold) never reaches this matcher; complements still
    /// cover the surrogate range.
    #[test]
    fn surrogates_are_not_a_category() {
        assert_eq!(rejection(r"\p{Cs}"), (Reason::InvalidProperty, 0));
        assert_eq!(rejection(r"[\P{Cs}]"), (Reason::InvalidProperty, 1));
        assert!(matches(r"\P{L}", "\u{E000}"));
    }

    #[test]
    fn lazy_and_greedy_match_the_same_values() {
        for (lazy, greedy) in [("a*?b", "a*b"), ("(ab)+?", "(ab)+"), ("a{1,3}?", "a{1,3}")] {
            for text in ["", "b", "ab", "aab", "abab", "a", "aaa", "aaaa"] {
                assert_eq!(matches(lazy, text), matches(greedy, text), "{lazy} {text}");
            }
        }
    }

    #[test]
    fn repetition_copies() {
        for (source, yes, no) in [
            (
                "a{2,4}",
                &["aa", "aaa", "aaaa"][..],
                &["", "a", "aaaaa"][..],
            ),
            ("a{0,2}b", &["b", "ab", "aab"][..], &["aaab", "a"][..]),
            ("a{2,}", &["aa", "aaaaaa"][..], &["a", ""][..]),
            ("(ab){2}", &["abab"][..], &["ab", "ababab"][..]),
            ("(a|bc)*d", &["d", "abcad"][..], &["bd", "abc"][..]),
            ("(a*)*b", &["b", "aab"][..], &["aa"][..]),
            ("a{0}b", &["b"][..], &["ab"][..]),
            ("(|a)+", &["", "aaa"][..], &["b"][..]),
        ] {
            for text in yes {
                assert!(matches(source, text), "{source} {text:?}");
            }
            for text in no {
                assert!(!matches(source, text), "{source} {text:?}");
            }
        }
    }

    #[test]
    fn zero_size_items_compile_to_one_state() {
        let program = compile("((){1000}){1000}").unwrap();
        assert!(program.len() <= 3, "{} states", program.len());
        assert!(program.is_match(""));
        assert!(!program.is_match("a"));
        let program = compile("()*a(()|())$").unwrap();
        assert!(program.len() <= 4, "{} states", program.len());
        assert!(program.is_match("a"));
    }

    #[test]
    fn matching_is_linear() {
        for (source, text) in [
            ("(?:a|aa)*c", "a".repeat(100_000)),
            ("(?:.*a){12}c", "a".repeat(20_000)),
            ("\\p{L}{1000}", "\u{D55C}".repeat(1000)),
            ("(a*)*b", "a".repeat(100_000)),
        ] {
            let started = Instant::now();
            let program = compile(source).unwrap();
            let _ = program.is_match(&text);
            let elapsed = started.elapsed();
            assert!(elapsed < Duration::from_secs(2), "{source}: {elapsed:?}");
        }
        assert!(matches("\\p{L}{1000}", &"\u{D55C}".repeat(1000)));
        assert!(!matches("\\p{L}{1000}", &"\u{D55C}".repeat(999)));
    }

    #[test]
    fn whole_text_matches() {
        assert!(matches("a|b", "a"));
        assert!(!matches("a|b", "ab"));
        assert!(!matches("x", "x\n"));
        assert!(!matches("x", "\nx"));
        assert!(!matches("x$", "x\n"));
        assert!(matches("/x/i", "/x/i"));
        assert!(!matches("/x/i", "X"));
        assert!(matches("a.b", "a\u{2028}b"));
        assert!(matches("a.b", "a\rb"));
        assert!(!matches("a.b", "a\nb"));
        assert!(matches("[^x]", "\n"));
        assert!(matches(r"\s", "\u{85}"));
        assert!(!matches(r"\s", "\u{FEFF}"));
        assert!(!matches(r"\s", "\u{180E}"));
        assert!(matches(r"\S", "\u{200B}"));
        assert!(!matches(r"\d", "\u{661}"));
        assert!(!matches(r"\w", "\u{E9}"));
        assert!(matches(r"\W", "\u{E9}"));
        assert!(matches(
            r"\u{1F600}\x41\t\v\f\n\r",
            "\u{1F600}A\t\u{B}\u{C}\n\r"
        ));
        assert!(matches(r"[\s]", "\u{3000}"));
        assert!(matches(r"[--/]", "."));
        assert!(matches(r"[a-]", "-"));
        assert!(matches(r"[.^$|*+?(){}]+", ".^$|*+?(){}"));
        assert!(matches("a|", ""));
        assert!(matches("^$", ""));
        assert!(!matches("^$", "x"));
        assert!(matches("a|(|b)c", "c"));
        assert!(!matches("a|(|b)c", "ac"));
        assert!(matches(r"\P{Script=Latin}+", "12\u{D55C}"));
        assert!(!matches(r"\P{Script=Latin}+", "1x"));
        assert!(!matches(r"\p{Lu}", "a"));
        assert!(matches(r"\P{Lu}", "a"));
        assert!(matches("(ab)*?", "abab"));
        assert!(!matches("A", "a"));
    }

    #[test]
    fn rejections() {
        use Reason::*;
        for (source, reason, offset) in [
            ("", EmptyPattern, 0),
            ("a(b", UnterminatedGroup, 3),
            ("((a)", UnterminatedGroup, 4),
            ("a[b", UnterminatedClass, 3),
            ("[a-", UnterminatedClass, 3),
            ("[\u{1F600}", UnterminatedClass, 2),
            ("a)", UnexpectedCharacter, 1),
            ("a]", UnexpectedCharacter, 1),
            ("a}", UnexpectedCharacter, 1),
            ("(a$)", UnexpectedCharacter, 2),
            ("a^b", UnexpectedCharacter, 1),
            ("$a", UnexpectedCharacter, 0),
            ("a^", UnexpectedCharacter, 1),
            ("a{", InvalidQuantifier, 1),
            ("{a", InvalidQuantifier, 0),
            ("*a", InvalidQuantifier, 0),
            ("^*", InvalidQuantifier, 1),
            ("a|*", InvalidQuantifier, 2),
            ("(*)", InvalidQuantifier, 1),
            ("a**", InvalidQuantifier, 2),
            ("a++", InvalidQuantifier, 2),
            ("a*??", InvalidQuantifier, 3),
            ("a{2}{3}", InvalidQuantifier, 4),
            ("a{3,2}", InvalidQuantifier, 1),
            ("a{1001}", InvalidQuantifier, 1),
            ("a{1,1001}", InvalidQuantifier, 1),
            ("a{99999999999999999999999}", InvalidQuantifier, 1),
            ("a{,2}", InvalidQuantifier, 1),
            ("a{1,2", InvalidQuantifier, 1),
            ("a{x}", InvalidQuantifier, 1),
            ("(a{100}){20}", PatternTooLarge, 0),
            ("((a{10}){10}){11}", PatternTooLarge, 0),
            ("((a{1000})*){2}", PatternTooLarge, 0),
            ("a{1000}b", PatternTooLarge, 0),
            ("(?:a+){500}b", PatternTooLarge, 0),
            ("a{1000}|b", PatternTooLarge, 0),
            ("(?:a{1000}){2}(", UnterminatedGroup, 15),
            ("(?:a{1000}){2}\\q", InvalidEscape, 14),
            ("a\\q", InvalidEscape, 1),
            ("\\", InvalidEscape, 0),
            ("\\bx", InvalidEscape, 0),
            ("\\B", InvalidEscape, 0),
            ("(a)\\1", InvalidEscape, 3),
            ("\\0", InvalidEscape, 0),
            ("\\cA", InvalidEscape, 0),
            ("\\k<n>", InvalidEscape, 0),
            ("\\u0041", InvalidEscape, 0),
            ("\\u{}", InvalidEscape, 0),
            ("\\u{1234567}", InvalidEscape, 0),
            ("\\u{0000041}", InvalidEscape, 0),
            ("\\u{41", InvalidEscape, 0),
            ("\\u{D800}", InvalidEscape, 0),
            ("\\u{110000}", InvalidEscape, 0),
            ("\\x4", InvalidEscape, 0),
            ("\\x4g", InvalidEscape, 0),
            ("\\x{41}", InvalidEscape, 0),
            ("[\\q]", InvalidEscape, 1),
            ("[\\b]", InvalidEscape, 1),
            ("(?i)x", UnsupportedConstruct, 0),
            ("a(?=b)", UnsupportedConstruct, 1),
            ("a(?!b)", UnsupportedConstruct, 1),
            ("(?<=a)b", UnsupportedConstruct, 0),
            ("(?<!a)b", UnsupportedConstruct, 0),
            ("(?P<n>a)", UnsupportedConstruct, 0),
            ("(?", UnsupportedConstruct, 0),
            ("(?<1a>x)", InvalidGroupName, 0),
            ("(?<>x)", InvalidGroupName, 0),
            ("(?<a-b>x)", InvalidGroupName, 0),
            ("(?<\u{E9}>x)", InvalidGroupName, 0),
            ("(?<abc", InvalidGroupName, 0),
            ("(?<n>a)(?<n>b)", DuplicateGroupName, 7),
            ("(?<n>(?<n>b))", DuplicateGroupName, 5),
            ("a[]", InvalidClass, 1),
            ("[^]", InvalidClass, 0),
            ("[[a]", InvalidClass, 0),
            ("[a[]", InvalidClass, 0),
            ("[[:alpha:]]", InvalidClass, 0),
            ("a[\\S]", InvalidClass, 1),
            ("[a\\D]", InvalidClass, 0),
            ("[\\W]", InvalidClass, 0),
            ("[z-a]", InvalidRange, 1),
            ("[\\d-z]", InvalidRange, 1),
            ("[a-\\d]", InvalidRange, 1),
            ("[a-\\D]", InvalidClass, 0),
            ("[a-[]", InvalidClass, 0),
            ("[a-\\q]", InvalidEscape, 3),
            ("[a-\\p{X}]", InvalidProperty, 3),
            ("[\\p{L}-z]", InvalidRange, 1),
            ("[xa-c-e]", InvalidClass, 0),
            ("[a-b-c]", InvalidClass, 0),
            ("[a--]", InvalidRange, 1),
            ("\\p{Script=Klingon}", InvalidProperty, 0),
            ("\\p{Letter}", InvalidProperty, 0),
            ("\\pL", InvalidProperty, 0),
            ("\\p", InvalidProperty, 0),
            ("\\p{Lu", InvalidProperty, 0),
            ("\\p{lu}", InvalidProperty, 0),
            ("\\p{Cn}", InvalidProperty, 0),
            ("\\p{Cs}", InvalidProperty, 0),
            ("\\P{Cs}", InvalidProperty, 0),
            ("\\p{Any}", InvalidProperty, 0),
            ("\\p{sc=Latin}", InvalidProperty, 0),
            ("\\p{Script=Latn}", InvalidProperty, 0),
            ("\\p{Script=Unknown}", InvalidProperty, 0),
            ("\\p{Script_Extensions=Latin}", InvalidProperty, 0),
            ("\\p{General_Category=Lu}", InvalidProperty, 0),
            ("\\P{Script=Klingon}", InvalidProperty, 0),
            ("[\\p{Letter}]", InvalidProperty, 1),
        ] {
            assert_eq!(rejection(source), (reason, offset), "{source:?}");
        }
    }

    #[test]
    fn accepted_edges() {
        for source in [
            "^",
            "$",
            "^$",
            "a|",
            "|",
            "()",
            "(?:)",
            "a{0}",
            "a{1000}",
            "a{0,1000}",
            "a{007}",
            "a{0001000}",
            "[.$^*a-a|]",
            "(a)*",
            "(?:ab){3}?",
            "(a{10}){100}",
            "((a{1000})*)",
            "(a*){1000}",
            "[-]",
            "[^-]",
            "[--]",
            "[a-a]",
            "[\\]-\\^]",
            "[\\u{0}-\\u{10FFFF}]",
            "\\-\\/",
            "[\\s\\p{Lu}\\P{N}]",
            "\u{1F600}+",
            "\\p{Script=Latin}",
            "\\P{Script=Latin}",
            "[a-b-]",
            "a|(|b)c",
            "\\P{C}",
        ] {
            assert!(recognizer::recognize(source).is_ok(), "{source:?}");
            assert!(compile(source).is_ok(), "{source:?}");
        }
    }

    #[test]
    fn nesting_is_limited_to_100_groups() {
        let at_limit = format!("{}a{}", "(".repeat(100), ")".repeat(100));
        assert!(matches(&at_limit, "a"));
        let too_deep = format!("{}a{}", "(".repeat(101), ")".repeat(101));
        assert_eq!(rejection(&too_deep), (Reason::NestingTooDeep, 100));
        let sibling = format!("{0}a{1}{0}b{1}", "(".repeat(100), ")".repeat(100));
        assert!(matches(&sibling, "ab"));
        assert_eq!(
            rejection(&format!("x{}", "(".repeat(200))),
            (Reason::NestingTooDeep, 101)
        );
    }

    #[test]
    fn size_limit_is_inclusive() {
        let program = compile(r"([\s\p{Lu}]{10}){100}").unwrap();
        assert!(compile("((a{10})*){100}").is_ok());
        let term = "A \u{3000}BCDEFGH";
        assert_eq!(term.chars().count(), 10);
        assert!(program.is_match(&term.repeat(100)));
        assert!(!program.is_match(&format!("{term}I").repeat(100)));
        assert!(!program.is_match("A"));
    }
}
