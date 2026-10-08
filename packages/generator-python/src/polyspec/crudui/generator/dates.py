"""Parse supported date strings for UTC control and list display.

Accepted inputs: a calendar date with an optional time and offset
(`YYYY-MM-DD`, `YYYY-MM-DDTHH:MM`, `YYYY-MM-DD HH:MM:SS+09:00`), and the RFC
2822 date forms with a weekday, a named month and a zone. The result is UTC at
whole-second precision; invalid and unsupported input is `None`.
"""

import re
from datetime import datetime, timedelta, timezone

__all__ = ['parse_utc']

_MONTHS = ('jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec')
_ZONES = {
    'z': 0,
    'ut': 0,
    'gmt': 0,
    'est': -18000,
    'edt': -14400,
    'cst': -21600,
    'cdt': -18000,
    'mst': -25200,
    'mdt': -21600,
    'pst': -28800,
    'pdt': -25200,
}

_ISO = re.compile(
    r'\A([0-9]{4})-([0-9]{2})-([0-9]{2})'
    r'(?:[T ]([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})?)?\Z'
)
_RFC2822 = re.compile(
    r'\A(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun),[ \t]+)?([0-9]{1,2})[ \t]+'
    r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[ \t]+([0-9]{4})[ \t]+'
    r'([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?[ \t]+'
    r'([+-][0-9]{4}|UT|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT)\Z',
    re.IGNORECASE,
)


def parse_utc(value):
    """UTC at whole-second precision, or None for invalid or unsupported input."""
    parts = _ISO.match(value)
    if parts is not None:
        offset = _offset(parts.group(7) or 'Z')
        if offset is None:
            return None
        return _create(
            int(parts.group(1)),
            int(parts.group(2)),
            int(parts.group(3)),
            int(parts.group(4) or 0),
            int(parts.group(5) or 0),
            int(parts.group(6) or 0),
            offset,
        )
    parts = _RFC2822.match(value)
    if parts is not None:
        offset = _offset(parts.group(8))
        month = _MONTHS.index(parts.group(3).lower()) + 1
        if offset is None:
            return None
        return _create(
            int(parts.group(4)),
            month,
            int(parts.group(2)),
            int(parts.group(5)),
            int(parts.group(6)),
            int(parts.group(7) or 0),
            offset,
            parts.group(1),
        )
    return None


def _offset(zone):
    named = _ZONES.get(zone.lower())
    if named is not None:
        return named
    numeric = zone.replace(':', '')
    hours = int(numeric[1:3])
    minutes = int(numeric[3:5])
    if hours > 23 or minutes > 59:
        return None
    return (-1 if numeric[0] == '-' else 1) * (hours * 3600 + minutes * 60)


def _create(year, month, day, hour, minute, second, offset, weekday=None):
    if hour > 23 or minute > 59 or second > 59:
        return None
    try:
        date = datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)
    except ValueError:
        return None
    if weekday is not None and weekday.lower() != date.strftime('%a').lower():
        return None
    return date - timedelta(seconds=offset)
