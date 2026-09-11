#include "engine_internal.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    int year;
    unsigned month;
    unsigned day;
    unsigned hour;
    unsigned minute;
    unsigned second;
} date_parts;

typedef struct {
    char *data;
    size_t length;
    size_t capacity;
} date_buffer;

static char *copy_text(const char *value);

static bool buffer_bytes(date_buffer *buffer, const char *value, size_t length)
{
    if (length > SIZE_MAX - buffer->length - 1) return false;
    size_t required = buffer->length + length + 1;
    if (required > buffer->capacity) {
        size_t capacity = buffer->capacity ? buffer->capacity : 32;
        while (capacity < required) {
            if (capacity > SIZE_MAX / 2) { capacity = required; break; }
            capacity *= 2;
        }
        char *resized = realloc(buffer->data, capacity);
        if (!resized) return false;
        buffer->data = resized;
        buffer->capacity = capacity;
    }
    if (length) memcpy(buffer->data + buffer->length, value, length);
    buffer->length += length;
    buffer->data[buffer->length] = '\0';
    return true;
}

static bool buffer_text(date_buffer *buffer, const char *value)
{
    return buffer_bytes(buffer, value, strlen(value));
}

static bool buffer_character(date_buffer *buffer, char value)
{
    return buffer_bytes(buffer, &value, 1);
}

static char *buffer_take(date_buffer *buffer)
{
    if (!buffer->data) return copy_text("");
    char *result = buffer->data;
    buffer->data = NULL;
    buffer->length = buffer->capacity = 0;
    return result;
}

static char *copy_text(const char *value)
{
    size_t length = strlen(value);
    char *copy = malloc(length + 1);
    if (copy) memcpy(copy, value, length + 1);
    return copy;
}

static bool digits(const char *value, size_t count)
{
    for (size_t i = 0; i < count; ++i)
        if (!isdigit((unsigned char)value[i])) return false;
    return true;
}

static unsigned unsigned_at(const char *value, size_t count)
{
    unsigned result = 0;
    for (size_t i = 0; i < count; ++i) result = result * 10 + (unsigned)(value[i] - '0');
    return result;
}

static bool leap(int year)
{
    return year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
}

static unsigned month_days(int year, unsigned month)
{
    static const unsigned days[] = {31,28,31,30,31,30,31,31,30,31,30,31};
    return month == 2 ? days[1] + leap(year) : days[month - 1];
}

static long long days_from_civil(int year, unsigned month, unsigned day)
{
    year -= month <= 2;
    const int era = (year >= 0 ? year : year - 399) / 400;
    const unsigned yoe = (unsigned)(year - era * 400);
    const unsigned doy = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1;
    const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    return (long long)era * 146097 + (long long)doe - 719468;
}

static void civil_from_days(long long days, int *year, unsigned *month, unsigned *day)
{
    days += 719468;
    const long long era = (days >= 0 ? days : days - 146096) / 146097;
    const unsigned doe = (unsigned)(days - era * 146097);
    const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    int y = (int)yoe + (int)era * 400;
    const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    const unsigned mp = (5 * doy + 2) / 153;
    *day = doy - (153 * mp + 2) / 5 + 1;
    *month = mp + (mp < 10 ? 3 : -9);
    y += *month <= 2;
    *year = y;
}

static int weekday(long long days)
{
    int result = (int)((days + 4) % 7);
    return result < 0 ? result + 7 : result;
}

static bool same_word(const char *value, size_t length, const char *word)
{
    if (strlen(word) != length) return false;
    for (size_t i = 0; i < length; ++i)
        if (tolower((unsigned char)value[i]) != tolower((unsigned char)word[i])) return false;
    return true;
}

static bool month_number(const char *value, unsigned *month)
{
    static const char *names[] = {"jan","feb","mar","apr","may","jun",
                                  "jul","aug","sep","oct","nov","dec"};
    for (size_t i = 0; i < 12; ++i)
        if (same_word(value, 3, names[i])) { *month = (unsigned)i + 1; return true; }
    return false;
}

static bool zone_offset(const char *value, size_t length, int *offset)
{
    struct { const char *name; int value; } zones[] = {
        {"UT",0},{"GMT",0},{"EST",-300},{"EDT",-240},{"CST",-360},
        {"CDT",-300},{"MST",-420},{"MDT",-360},{"PST",-480},{"PDT",-420}
    };
    if (length == 1 && value[0] == 'Z') { *offset = 0; return true; }
    if ((length == 6 || length == 5) && (value[0] == '+' || value[0] == '-')) {
        bool colon = length == 6;
        if (!digits(value + 1, 2) || (colon && value[3] != ':') ||
            !digits(value + (colon ? 4 : 3), 2)) return false;
        unsigned hours = unsigned_at(value + 1, 2);
        unsigned minutes = unsigned_at(value + (colon ? 4 : 3), 2);
        if (hours > 23 || minutes > 59) return false;
        *offset = (int)(hours * 60 + minutes) * (value[0] == '-' ? -1 : 1);
        return true;
    }
    for (size_t i = 0; i < sizeof(zones) / sizeof(zones[0]); ++i)
        if (same_word(value, length, zones[i].name)) { *offset = zones[i].value; return true; }
    return false;
}

static bool valid_parts(const date_parts *parts)
{
    return parts->month >= 1 && parts->month <= 12 && parts->day >= 1 &&
        parts->day <= month_days(parts->year, parts->month) && parts->hour <= 23 &&
        parts->minute <= 59 && parts->second <= 59;
}

static bool parse_iso(const char *source, date_parts *parts, int *offset)
{
    size_t length = strlen(source);
    if (length < 10 || !digits(source, 4) || source[4] != '-' ||
        !digits(source + 5, 2) || source[7] != '-' || !digits(source + 8, 2)) return false;
    *parts = (date_parts){(int)unsigned_at(source, 4), unsigned_at(source + 5, 2),
                          unsigned_at(source + 8, 2), 0, 0, 0};
    *offset = 0;
    size_t cursor = 10;
    if (cursor == length) return valid_parts(parts);
    if ((source[cursor] != 'T' && source[cursor] != ' ') || cursor + 6 > length ||
        !digits(source + cursor + 1, 2) || source[cursor + 3] != ':' ||
        !digits(source + cursor + 4, 2)) return false;
    parts->hour = unsigned_at(source + cursor + 1, 2);
    parts->minute = unsigned_at(source + cursor + 4, 2);
    cursor += 6;
    if (cursor < length && source[cursor] == ':') {
        if (cursor + 3 > length || !digits(source + cursor + 1, 2)) return false;
        parts->second = unsigned_at(source + cursor + 1, 2);
        cursor += 3;
        if (cursor < length && source[cursor] == '.') {
            size_t start = ++cursor;
            while (cursor < length && isdigit((unsigned char)source[cursor])) cursor++;
            if (cursor == start) return false;
        }
    }
    if (cursor < length) {
        size_t zone_length = length - cursor;
        if (!zone_offset(source + cursor, zone_length, offset)) return false;
        cursor = length;
    }
    return cursor == length && valid_parts(parts);
}

static bool token(const char **cursor, const char *end, const char **start, size_t *length)
{
    while (*cursor < end && (**cursor == ' ' || **cursor == '\t')) (*cursor)++;
    if (*cursor == end) return false;
    *start = *cursor;
    while (*cursor < end && **cursor != ' ' && **cursor != '\t') (*cursor)++;
    *length = (size_t)(*cursor - *start);
    return true;
}

static bool parse_rfc(const char *source, date_parts *parts, int *offset)
{
    static const char *weekdays[] = {"sun","mon","tue","wed","thu","fri","sat"};
    const char *cursor = source, *end = source + strlen(source);
    int expected_weekday = -1;
    const char *comma = strchr(source, ',');
    if (comma) {
        if (comma - source != 3) return false;
        for (size_t i = 0; i < 7; ++i)
            if (same_word(source, 3, weekdays[i])) expected_weekday = (int)i;
        if (expected_weekday < 0) return false;
        cursor = comma + 1;
    }
    const char *day, *month, *year, *time, *zone;
    size_t day_length, month_length, year_length, time_length, zone_length;
    if (!token(&cursor,end,&day,&day_length) || !token(&cursor,end,&month,&month_length) ||
        !token(&cursor,end,&year,&year_length) || !token(&cursor,end,&time,&time_length) ||
        !token(&cursor,end,&zone,&zone_length)) return false;
    while (cursor < end && (*cursor == ' ' || *cursor == '\t')) cursor++;
    if (cursor != end || day_length < 1 || day_length > 2 || !digits(day, day_length) ||
        month_length != 3 || year_length != 4 || !digits(year, 4)) return false;
    unsigned parsed_month;
    if (!month_number(month, &parsed_month)) return false;
    if ((time_length != 5 && time_length != 8) || !digits(time, 2) || time[2] != ':' ||
        !digits(time + 3, 2) || (time_length == 8 && (time[5] != ':' || !digits(time + 6, 2))))
        return false;
    *parts = (date_parts){(int)unsigned_at(year,4), parsed_month, unsigned_at(day,day_length),
        unsigned_at(time,2), unsigned_at(time+3,2), time_length == 8 ? unsigned_at(time+6,2) : 0};
    if (!valid_parts(parts) || !zone_offset(zone, zone_length, offset)) return false;
    if (expected_weekday >= 0 && weekday(days_from_civil(parts->year, parts->month, parts->day)) != expected_weekday)
        return false;
    return true;
}

static bool parse_date(const char *source, date_parts *parts)
{
    int offset;
    date_parts local;
    if (!parse_iso(source, &local, &offset) && !parse_rfc(source, &local, &offset)) return false;
    long long total = days_from_civil(local.year, local.month, local.day) * 86400 +
        (long long)local.hour * 3600 + (long long)local.minute * 60 + local.second -
        (long long)offset * 60;
    long long days = total / 86400, remainder = total % 86400;
    if (remainder < 0) { remainder += 86400; days--; }
    civil_from_days(days, &parts->year, &parts->month, &parts->day);
    parts->hour = (unsigned)(remainder / 3600);
    parts->minute = (unsigned)(remainder % 3600 / 60);
    parts->second = (unsigned)(remainder % 60);
    return true;
}

static bool append_year(date_buffer *out, int year)
{
    char value[32];
    if (year < 0) snprintf(value, sizeof(value), "-%04u", (unsigned)(-year));
    else snprintf(value, sizeof(value), "%04u", (unsigned)year);
    return buffer_text(out, value);
}

char *ps_format_date_pattern(const char *source, const char *pattern)
{
    date_parts parts;
    if (!parse_date(source, &parts)) return copy_text(source);
    date_buffer out = {0};
    char value[8];
    for (const char *cursor = pattern; *cursor;) {
        if (!strncmp(cursor, "YYYY", 4)) {
            if (!append_year(&out, parts.year)) goto fail;
            cursor += 4;
        } else {
            struct { const char *token; unsigned value; } entries[] = {
                {"MM",parts.month},{"DD",parts.day},{"HH",parts.hour},
                {"mm",parts.minute},{"ss",parts.second}
            };
            bool matched = false;
            for (size_t i = 0; i < sizeof(entries) / sizeof(entries[0]); ++i) {
                if (!strncmp(cursor, entries[i].token, 2)) {
                    snprintf(value, sizeof(value), "%02u", entries[i].value);
                    if (!buffer_text(&out, value)) goto fail;
                    cursor += 2; matched = true; break;
                }
            }
            if (!matched && !buffer_character(&out, *cursor++)) goto fail;
        }
    }
    return buffer_take(&out);
fail:
    free(out.data);
    return NULL;
}

char *ps_format_date(const char *source, bool datetime)
{
    return ps_format_date_pattern(source, datetime ? "YYYY-MM-DDTHH:mm:ss" : "YYYY-MM-DD");
}
