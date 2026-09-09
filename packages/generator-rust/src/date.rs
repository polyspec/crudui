use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Timelike, Utc};
use regex::Regex;
use std::sync::LazyLock;

static ISO: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:[T ]([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.([0-9]+))?)?(Z|[+-][0-9]{2}:[0-9]{2})?)?$").expect("ISO date expression")
});
static RFC: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^(?:(Sun|Mon|Tue|Wed|Thu|Fri|Sat),[ \t]+)?([0-9]{1,2})[ \t]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[ \t]+([0-9]{4})[ \t]+([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?[ \t]+([+-][0-9]{4}|UT|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT)$").expect("RFC date expression")
});
const MONTHS: [&str; 12] = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];
const WEEKDAYS: [&str; 7] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

fn offset_minutes(zone: &str) -> Option<i64> {
    let named = match zone.to_ascii_uppercase().as_str() {
        "" | "Z" | "UT" | "GMT" => Some(0),
        "EST" | "CDT" => Some(-300),
        "EDT" => Some(-240),
        "CST" | "MDT" => Some(-360),
        "MST" | "PDT" => Some(-420),
        "PST" => Some(-480),
        _ => None,
    };
    if let Some(offset) = named {
        return Some(offset);
    }
    let digits = zone.get(1..)?.replace(':', "");
    let hours: i64 = digits.get(..2)?.parse().ok()?;
    let minutes: i64 = digits.get(2..)?.parse().ok()?;
    if hours > 23 || minutes > 59 {
        return None;
    }
    Some((if zone.starts_with('-') { -1 } else { 1 }) * (hours * 60 + minutes))
}

pub(crate) fn parse(value: &str) -> Option<DateTime<Utc>> {
    let (year, month, day, hour, minute, second, fraction, zone, weekday) =
        if let Some(parts) = ISO.captures(value) {
            (
                parts[1].parse().ok()?,
                parts[2].parse().ok()?,
                parts[3].parse().ok()?,
                parts.get(4).map_or("0", |v| v.as_str()).parse().ok()?,
                parts.get(5).map_or("0", |v| v.as_str()).parse().ok()?,
                parts.get(6).map_or("0", |v| v.as_str()).parse().ok()?,
                parts.get(7).map_or("", |v| v.as_str()),
                parts.get(8).map_or("", |v| v.as_str()),
                None,
            )
        } else {
            let parts = RFC.captures(value)?;
            (
                parts[4].parse().ok()?,
                MONTHS
                    .iter()
                    .position(|m| parts[3].eq_ignore_ascii_case(m))? as u32
                    + 1,
                parts[2].parse().ok()?,
                parts[5].parse().ok()?,
                parts[6].parse().ok()?,
                parts.get(7).map_or("0", |v| v.as_str()).parse().ok()?,
                "",
                parts.get(8)?.as_str(),
                parts.get(1).map(|v| v.as_str()),
            )
        };
    if hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    let date = NaiveDate::from_ymd_opt(year, month, day)?;
    if weekday.is_some_and(|day| {
        !day.eq_ignore_ascii_case(WEEKDAYS[date.weekday().num_days_from_sunday() as usize])
    }) {
        return None;
    }
    let nanos: u32 = format!(
        "{fraction:0<9}",
        fraction = &fraction[..fraction.len().min(9)]
    )
    .parse()
    .ok()?;
    let time = date.and_hms_nano_opt(hour, minute, second, nanos)?;
    let utc = time.checked_sub_signed(Duration::minutes(offset_minutes(zone)?))?;
    Some(Utc.from_utc_datetime(&utc))
}

pub(crate) fn format(value: &str, pattern: &str) -> String {
    let Some(date) = parse(value) else {
        return value.into();
    };
    let year = date.year();
    let year = format!("{}{:04}", if year < 0 { "-" } else { "" }, year.abs());
    let mut result = pattern.replace("YYYY", &year);
    for (token, number) in [
        ("MM", date.month()),
        ("DD", date.day()),
        ("HH", date.hour()),
        ("mm", date.minute()),
        ("ss", date.second()),
    ] {
        result = result.replace(token, &format!("{number:02}"));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_use_utc_and_retain_invalid_input() {
        for (input, expected) in [
            ("2026-09-09", "2026-09-09T00:00:00"),
            ("2026-09-09 03:04", "2026-09-09T03:04:00"),
            ("2026-09-09T03:04:05.999999999999", "2026-09-09T03:04:05"),
            ("2026-09-09T03:04:05+09:00", "2026-09-08T18:04:05"),
            ("2026-09-09T23:04-07:00", "2026-09-10T06:04:00"),
            ("Wed, 09 Sep 2026 03:04:05 +0900", "2026-09-08T18:04:05"),
            ("9 sep 2026 23:04 pdt", "2026-09-10T06:04:00"),
            ("0000-01-01T00:00:00+01:00", "-0001-12-31T23:00:00"),
            ("9999-12-31T23:30:00-01:00", "10000-01-01T00:30:00"),
        ] {
            assert_eq!(format(input, "YYYY-MM-DDTHH:mm:ss"), expected, "{input}");
        }
        for input in [
            "2026-02-29",
            "2026-04-31T03:04",
            "2026-09-09T24:00",
            "2026-09-09T03:60",
            "2026-09-09T03:04:60Z",
            "2026-09-09T03:04+24:00",
            "2026-09-09T03:04+01:60",
            "2026-09-09Z",
            "2026-09-09T03:04garbage",
            "2026-09-09T03:04.5",
            "2026/09/09",
            "2026-09-09T03:04z",
            "Thu, 09 Sep 2026 03:04 GMT",
            "9 Sep 2026 03:04",
            "9 Sep 26 03:04 GMT",
            "9 Sep 2026 03:04 J",
            " 2026-09-09",
            "2026-09-09\n",
        ] {
            assert!(parse(input).is_none(), "{input:?}");
            assert_eq!(format(input, "YYYY/MM/DD"), input);
        }
    }
}
