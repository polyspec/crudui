//! Code-point sets: sorted lists of disjoint inclusive ranges, built once when a
//! pattern compiles and tested by binary search.

use crate::validate::unicode::{contains, WHITE_SPACE};

use super::syntax::{Atom, ClassItem, Shorthand};

/// The largest code point.
const MAX_CODE_POINT: u32 = 0x10FFFF;

/// A set of code points.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CodeSet {
    ranges: Vec<(u32, u32)>,
}

impl CodeSet {
    /// The union of `ranges`, in any order and possibly overlapping.
    fn from_ranges(mut ranges: Vec<(u32, u32)>) -> Self {
        ranges.sort_unstable();
        let mut merged: Vec<(u32, u32)> = Vec::with_capacity(ranges.len());
        for (start, end) in ranges {
            match merged.last_mut() {
                Some(last) if start <= last.1.saturating_add(1) => last.1 = last.1.max(end),
                _ => merged.push((start, end)),
            }
        }
        CodeSet { ranges: merged }
    }

    /// Every code point outside this set, over 0 to U+10FFFF.
    fn complement(&self) -> Self {
        let mut ranges = Vec::with_capacity(self.ranges.len() + 1);
        let mut next = 0u32;
        for &(start, end) in &self.ranges {
            if start > next {
                ranges.push((next, start - 1));
            }
            next = end + 1;
        }
        if next <= MAX_CODE_POINT {
            ranges.push((next, MAX_CODE_POINT));
        }
        CodeSet { ranges }
    }

    fn negated_if(self, negated: bool) -> Self {
        if negated {
            self.complement()
        } else {
            self
        }
    }

    /// Whether `c` is in the set.
    pub(crate) fn contains(&self, c: char) -> bool {
        contains(&self.ranges, u32::from(c))
    }

    /// The set an atom matches.
    pub(crate) fn of_atom(atom: &Atom) -> Self {
        match atom {
            Atom::Literal(c) => CodeSet::from_ranges(vec![(u32::from(*c), u32::from(*c))]),
            Atom::Any => CodeSet::from_ranges(vec![(0x0A, 0x0A)]).complement(),
            Atom::Shorthand { set, negated } => {
                CodeSet::from_ranges(shorthand_ranges(*set)).negated_if(*negated)
            }
            Atom::Property(property) => {
                CodeSet::from_ranges(property.ranges.to_vec()).negated_if(property.negated)
            }
            Atom::Class { negated, items } => {
                let mut ranges = Vec::new();
                for item in items {
                    match item {
                        ClassItem::Char(c) => ranges.push((u32::from(*c), u32::from(*c))),
                        ClassItem::Range(low, high) => {
                            ranges.push((u32::from(*low), u32::from(*high)))
                        }
                        ClassItem::Shorthand(set) => ranges.extend(shorthand_ranges(*set)),
                        ClassItem::Property(property) => {
                            let set = CodeSet::from_ranges(property.ranges.to_vec())
                                .negated_if(property.negated);
                            ranges.extend(set.ranges);
                        }
                    }
                }
                CodeSet::from_ranges(ranges).negated_if(*negated)
            }
        }
    }
}

fn shorthand_ranges(set: Shorthand) -> Vec<(u32, u32)> {
    match set {
        Shorthand::Digit => vec![(0x30, 0x39)],
        Shorthand::Word => vec![(0x30, 0x39), (0x41, 0x5A), (0x5F, 0x5F), (0x61, 0x7A)],
        Shorthand::Space => WHITE_SPACE.to_vec(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn union_merges_overlapping_and_adjacent_ranges() {
        let set = CodeSet::from_ranges(vec![(5, 9), (1, 2), (3, 3), (8, 12), (20, 20)]);
        assert_eq!(set.ranges, vec![(1, 3), (5, 12), (20, 20)]);
    }

    #[test]
    fn complement_covers_every_other_code_point() {
        let set = CodeSet::from_ranges(vec![(0, 0), (10, 20), (MAX_CODE_POINT, MAX_CODE_POINT)]);
        assert_eq!(
            set.complement().ranges,
            vec![(1, 9), (21, MAX_CODE_POINT - 1)]
        );
        assert_eq!(
            CodeSet::from_ranges(vec![]).complement().ranges,
            vec![(0, MAX_CODE_POINT)]
        );
        assert_eq!(
            CodeSet::from_ranges(vec![(0, MAX_CODE_POINT)])
                .complement()
                .ranges,
            vec![]
        );
        let any = CodeSet::of_atom(&Atom::Any);
        assert!(!any.contains('\n'));
        assert!(any.contains('\r') && any.contains('\u{0}') && any.contains('\u{10FFFF}'));
    }

    #[test]
    fn shorthand_sets() {
        let digit = CodeSet::of_atom(&Atom::Shorthand {
            set: Shorthand::Digit,
            negated: false,
        });
        assert!(digit.contains('7') && !digit.contains('\u{661}'));
        let non_word = CodeSet::of_atom(&Atom::Shorthand {
            set: Shorthand::Word,
            negated: true,
        });
        assert!(non_word.contains('\u{E9}') && non_word.contains('-') && !non_word.contains('_'));
        let space = CodeSet::of_atom(&Atom::Shorthand {
            set: Shorthand::Space,
            negated: false,
        });
        assert!(space.contains('\u{3000}') && !space.contains('\u{FEFF}'));
    }
}
