//! The Unicode data every rule uses (validation rules, "Values"), embedded from
//! `contracts/unicode-properties.json`.

mod data;

#[cfg(test)]
use data::UNICODE_VERSION;
pub(crate) use data::{GENERAL_CATEGORIES, SCRIPTS, WHITE_SPACE};

/// A sorted list of disjoint inclusive code-point ranges.
pub(crate) type Ranges = &'static [(u32, u32)];

/// The ranges of `name` in `table`.
pub(crate) fn lookup(table: &[(&str, Ranges)], name: &str) -> Option<Ranges> {
    table
        .iter()
        .find(|(entry, _)| *entry == name)
        .map(|(_, ranges)| *ranges)
}

/// Whether `code` lies in `ranges`.
pub(crate) fn contains(ranges: &[(u32, u32)], code: u32) -> bool {
    ranges
        .binary_search_by(|&(start, end)| {
            if end < code {
                std::cmp::Ordering::Less
            } else if start > code {
                std::cmp::Ordering::Greater
            } else {
                std::cmp::Ordering::Equal
            }
        })
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    type Table = Vec<(String, Vec<(u32, u32)>)>;

    fn ranges_of(value: &Value) -> Vec<(u32, u32)> {
        let bound = |range: &Value, index: usize| {
            u32::try_from(range[index].as_u64().expect("a code point")).expect("a code point")
        };
        value
            .as_array()
            .expect("a range list")
            .iter()
            .map(|range| (bound(range, 0), bound(range, 1)))
            .collect()
    }

    fn table_of(value: &Value) -> Table {
        value
            .as_object()
            .expect("a property table")
            .iter()
            .map(|(name, list)| (name.clone(), ranges_of(list)))
            .collect()
    }

    fn embedded(table: &[(&str, Ranges)]) -> Table {
        table
            .iter()
            .map(|(name, ranges)| (name.to_string(), ranges.to_vec()))
            .collect()
    }

    #[test]
    fn embedded_data_matches_the_contract() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../contracts/unicode-properties.json"
        );
        let text = std::fs::read_to_string(path).expect("read contracts/unicode-properties.json");
        let contract: Value = serde_json::from_str(&text).expect("parse the contract");
        let hint = "src/validate/unicode/data.rs differs from the contract; \
                    run `node tools/generate-unicode-properties.mjs`";
        assert_eq!(
            contract["unicodeVersion"].as_str(),
            Some(UNICODE_VERSION),
            "{hint}"
        );
        assert_eq!(ranges_of(&contract["whiteSpace"]), WHITE_SPACE, "{hint}");
        assert_eq!(
            table_of(&contract["generalCategories"]),
            embedded(GENERAL_CATEGORIES),
            "{hint}"
        );
        assert_eq!(table_of(&contract["scripts"]), embedded(SCRIPTS), "{hint}");
    }

    #[test]
    fn ranges_are_sorted_and_disjoint() {
        let tables = GENERAL_CATEGORIES.iter().chain(SCRIPTS).map(|(_, r)| *r);
        for ranges in tables.chain([WHITE_SPACE]) {
            for (index, &(start, end)) in ranges.iter().enumerate() {
                assert!(start <= end && end <= 0x10FFFF, "{start:X}-{end:X}");
                if index > 0 {
                    assert!(ranges[index - 1].1 < start, "{start:X}");
                }
            }
        }
    }

    #[test]
    fn lookup_and_membership() {
        let letters = lookup(GENERAL_CATEGORIES, "L").expect("L");
        assert!(contains(letters, 'a' as u32));
        assert!(contains(letters, 0xD55C));
        assert!(!contains(letters, '1' as u32));
        // Unassigned in Unicode 16.0.
        assert!(!contains(letters, 0xA7CE));
        assert!(contains(
            lookup(GENERAL_CATEGORIES, "C").expect("C"),
            0xA7CE
        ));
        assert!(contains(
            lookup(GENERAL_CATEGORIES, "C").expect("C"),
            0xD800
        ));
        assert!(lookup(GENERAL_CATEGORIES, "Cs").is_none());
        assert!(lookup(SCRIPTS, "Hangul").is_some());
        assert!(lookup(SCRIPTS, "Unknown").is_none());
    }
}
