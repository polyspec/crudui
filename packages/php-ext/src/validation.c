#include "engine_internal.h"

#include <ctype.h>
#include <errno.h>
#include <math.h>
#include <regex.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <time.h>

typedef struct {
    const ps_value *data;
    ps_value *errors;
    ps_value *failure;
} validation_context;

static bool string_in(const char *value, const char *const *items, size_t count)
{
    for (size_t i = 0; i < count; ++i) if (!strcmp(value, items[i])) return true;
    return false;
}

static bool forbidden_key(const char *key)
{
    static const char *const keys[] = {
        "display_switch", "display_target", "if", "when", "show_if",
        "_", "seqtokey", "__13hex__", "$after", "$before",
        "$merge", "$remove", "xclass", "xstyle",
    };
    return (key[0] == 'x' && key[1]) || string_in(key, keys, sizeof(keys) / sizeof(keys[0]));
}

static ps_value *path_trace(char *const *path, size_t length, const char *key)
{
    ps_value *trace = ps_array_value();
    if (!trace) return NULL;
    for (size_t i = 0; i < length; ++i)
        if (!ps_append(trace, ps_string_value(path[i]))) goto fail;
    if (key && !ps_append(trace, ps_string_value(key))) goto fail;
    return trace;
fail:
    ps_value_free(trace);
    return NULL;
}

static char *path_text(char *const *path, size_t length, const char *key)
{
    size_t size = key ? strlen(key) + 1 : 1;
    for (size_t i = 0; i < length; ++i) size += strlen(path[i]) + (i ? 1 : 0);
    if (key && length) size++;
    char *text = calloc(size, 1);
    if (!text) return NULL;
    for (size_t i = 0; i < length; ++i) {
        if (i) strcat(text, ".");
        strcat(text, path[i]);
    }
    if (key) {
        if (length) strcat(text, ".");
        strcat(text, key);
    }
    return text;
}

static ps_value *scan_forbidden(const ps_value *node, char **path, size_t length)
{
    if (!node || (node->kind != PS_ARRAY && node->kind != PS_OBJECT)) return NULL;
    if (node->kind == PS_OBJECT) {
        for (size_t i = 0; i < ps_size(node); ++i) {
            const char *key = ps_key_at(node, i);
            if (!forbidden_key(key)) continue;
            char *at = path_text(path, length, key);
            ps_value *trace = path_trace(path, length, key);
            size_t message_size = strlen(key) + (at ? strlen(at) : 0) + 32;
            char *message = malloc(message_size);
            if (message) snprintf(message, message_size, "forbidden meta key \"%s\" at %s", key, at ? at : "");
            ps_value *error = ps_error("compose", "FORBIDDEN_META_KEY",
                message ? message : "Forbidden meta key", at ? at : "", trace);
            free(message); free(at); ps_value_free(trace);
            return error;
        }
    }
    for (size_t i = 0; i < ps_size(node); ++i) {
        char index[32];
        const char *key = ps_key_at(node, i);
        if (node->kind == PS_ARRAY) { snprintf(index, sizeof(index), "%zu", i); key = index; }
        char **next = malloc((length + 1) * sizeof(*next));
        if (!next) return NULL;
        if (length) memcpy(next, path, length * sizeof(*next));
        next[length] = (char *)key;
        ps_value *error = scan_forbidden(ps_at(node, i), next, length + 1);
        free(next);
        if (error) return error;
    }
    return NULL;
}

static bool empty_value(const ps_value *value)
{
    if (!value || value->kind == PS_NULL) return true;
    if (value->kind == PS_STRING) {
        const char *start = ps_string(value), *end = start + value->data.string.length;
        while (start < end && isspace((unsigned char)*start)) start++;
        while (end > start && isspace((unsigned char)end[-1])) end--;
        return start == end;
    }
    return (value->kind == PS_ARRAY || value->kind == PS_OBJECT) && ps_size(value) == 0;
}

static bool strict_number(const ps_value *value, double *out)
{
    if (!value) return false;
    if (value->kind == PS_INT) { *out = (double)value->data.integer; return true; }
    if (value->kind == PS_FLOAT) { *out = value->data.number; return isfinite(*out); }
    if (value->kind != PS_STRING) return false;
    const char *source = ps_string(value);
    while (isspace((unsigned char)*source)) source++;
    if (!*source) return false;
    errno = 0; char *end = NULL; double number = strtod(source, &end);
    if (end == source || errno == ERANGE || !isfinite(number)) return false;
    while (isspace((unsigned char)*end)) end++;
    if (*end) return false;
    *out = number; return true;
}

static bool parameter_number(const ps_value *value, double *out)
{
    if (!value) return false;
    if (value->kind == PS_BOOL) { *out = value->data.boolean ? 1 : 0; return true; }
    if (value->kind == PS_NULL) { *out = 0; return true; }
    return strict_number(value, out);
}

static size_t utf8_length(const char *text)
{
    size_t length = 0;
    for (const unsigned char *p = (const unsigned char *)text; *p; ++p)
        if ((*p & 0xc0) != 0x80) length++;
    return length;
}

static const ps_value *relative_field(const char *reference, const validation_context *context,
                                      char *const *path, size_t length)
{
    while (isspace((unsigned char)*reference)) reference++;
    size_t dots = 0;
    while (reference[dots] == '.') dots++;
    if (dots) {
        size_t base = length ? length - 1 : 0;
        for (size_t i = 1; i < dots && base; ++i) base--;
        size_t tail = 0; char **parts = NULL;
        if (!ps_path_parts(reference + dots, &parts, &tail)) return NULL;
        char **segments = calloc(base + tail, sizeof(*segments));
        if (!segments && base + tail) { ps_path_parts_free(parts, tail); return NULL; }
        for (size_t i = 0; i < base; ++i) segments[i] = path[i];
        for (size_t i = 0; i < tail; ++i) segments[base + i] = parts[i];
        const ps_value *value = ps_path_segments(context->data, (const char *const *)segments, base + tail);
        free(segments); ps_path_parts_free(parts, tail); return value;
    }
    if (strchr(reference, '.')) return ps_path(context->data, reference);
    const ps_value *parent = ps_path_segments(context->data, (const char *const *)path, length ? length - 1 : 0);
    return ps_get(parent, reference);
}

static bool valid_email(const char *text)
{
    const char *at = strchr(text, '@');
    if (!at || at == text || strchr(at + 1, '@') || !at[1] || at[-1] == '.' || text[0] == '.') return false;
    for (const char *p = text; p + 1 < at; ++p) if (p[0] == '.' && p[1] == '.') return false;
    if (!isalnum((unsigned char)at[1])) return false;
    for (const char *p = text; p < at; ++p) {
        unsigned char c = (unsigned char)*p;
        if (!isalnum(c) && !strchr(".!#$%&'*+/=?^_`{|}~-", c)) return false;
    }
    for (const char *p = at + 1; *p; ++p) {
        unsigned char c = (unsigned char)*p;
        if (!isalnum(c) && c != '-' && c != '.') return false;
        if (c == '.' && (!p[1] || p[-1] == '.')) return false;
    }
    return true;
}

static bool digits_only(const ps_value *value)
{
    if (value->kind == PS_INT) return value->data.integer >= 0;
    if (value->kind == PS_FLOAT) return value->data.number >= 0 && floor(value->data.number) == value->data.number;
    if (value->kind != PS_STRING) return false;
    const char *text = ps_string(value); if (!*text) return false;
    for (; *text; ++text) if (!isdigit((unsigned char)*text)) return false;
    return true;
}

static bool iso_date(const char *text, int *serial)
{
    if (strlen(text) != 10 || text[4] != '-' || text[7] != '-') return false;
    for (size_t i = 0; i < 10; ++i) if (i != 4 && i != 7 && !isdigit((unsigned char)text[i])) return false;
    int year = atoi(text), month = atoi(text + 5), day = atoi(text + 8);
    static const int days[] = {0,31,28,31,30,31,30,31,31,30,31,30,31};
    if (month < 1 || month > 12) return false;
    int limit = days[month];
    if (month == 2 && (year % 400 == 0 || (year % 4 == 0 && year % 100 != 0))) limit++;
    if (day < 1 || day > limit) return false;
    if (serial) *serial = year * 372 + month * 31 + day;
    return true;
}

static bool mime_extension(const char *filename, const char *extension)
{
    const char *dot = strrchr(filename, '.');
    if (!dot || !dot[1]) return false;
    dot++;
    while (*dot && *extension && tolower((unsigned char)*dot) == tolower((unsigned char)*extension)) { dot++; extension++; }
    return !*dot && !*extension;
}

static bool accept_one(const char *value, const char *item)
{
    while (isspace((unsigned char)*item)) item++;
    size_t length = strlen(item); while (length && isspace((unsigned char)item[length - 1])) length--;
    if (!length) return false;
    if (item[0] == '.') {
        char extension[32]; if (length - 1 >= sizeof(extension)) return false;
        memcpy(extension, item + 1, length - 1); extension[length - 1] = '\0';
        return mime_extension(value, extension);
    }
    const char *slash = strchr(value, '/');
    if (!slash) return false;
    if (length == 3 && !strncmp(item, "*/*", 3)) return true;
    if (length >= 2 && item[length - 1] == '*' && item[length - 2] == '/')
        return !strncasecmp(value, item, length - 1);
    return strlen(value) == length && !strncasecmp(value, item, length);
}

static bool accept_value(const ps_value *value, const ps_value *parameter)
{
    if (!parameter || parameter->kind != PS_STRING || !value || value->kind != PS_STRING) return true;
    const char *list = ps_string(parameter), *start = list;
    for (const char *cursor = list;; ++cursor) {
        if (*cursor && *cursor != ',') continue;
        size_t length = (size_t)(cursor - start); char *item = calloc(length + 1, 1);
        if (!item) return false;
        memcpy(item, start, length);
        item[length] = '\0';
        bool accepted = accept_one(ps_string(value), item); free(item);
        if (accepted) return true;
        if (!*cursor) break;
        start = cursor + 1;
    }
    return false;
}

static bool in_value(const ps_value *value, const ps_value *parameter)
{
    if (!parameter) return true;
    if (parameter->kind == PS_OBJECT) {
        bool labels = ps_size(parameter) > 0;
        for (size_t i = 0; i < ps_size(parameter); ++i) {
            const ps_value *label = ps_at(parameter, i);
            if (label->kind != PS_NULL && label->kind != PS_STRING && label->kind != PS_OBJECT) { labels = false; break; }
        }
        if (labels) {
            char *text = ps_scalar_string(value);
            bool found = text && ps_has(parameter, text); free(text); return found;
        }
    }
    if (parameter->kind == PS_ARRAY || parameter->kind == PS_OBJECT) {
        for (size_t i = 0; i < ps_size(parameter); ++i) if (in_value(value, ps_at(parameter, i))) return true;
        return false;
    }
    if (parameter->kind == PS_STRING && strchr(ps_string(parameter), ',')) {
        const char *start = ps_string(parameter);
        for (const char *cursor = start;; ++cursor) {
            if (*cursor && *cursor != ',') continue;
            while (start < cursor && isspace((unsigned char)*start)) start++;
            const char *end = cursor; while (end > start && isspace((unsigned char)end[-1])) end--;
            char *probe = malloc((size_t)(end - start) + 1); if (!probe) return false;
            memcpy(probe, start, (size_t)(end - start)); probe[end - start] = '\0';
            char *actual = ps_scalar_string(value); bool equal = actual && !strcmp(actual, probe);
            free(actual); free(probe); if (equal) return true;
            if (!*cursor) break;
            start = cursor + 1;
        }
        return false;
    }
    return ps_equal(value, parameter);
}

static bool unique_values(const ps_value *values, const ps_value *parameter,
                          const validation_context *context, char *const *path, size_t length)
{
    bool condition = parameter && parameter->kind == PS_STRING && ps_condition_expression(ps_string(parameter));
    for (size_t i = 0; i < ps_size(values); ++i) {
        const ps_value *left = ps_at(values, i);
        const char *left_key = values->kind == PS_OBJECT ? ps_key_at(values, i) : NULL;
        char left_index[32]; if (!left_key) { snprintf(left_index, sizeof(left_index), "%zu", i); left_key = left_index; }
        char **left_path = calloc(length + 1, sizeof(*left_path));
        if (!left_path) return false;
        for (size_t p = 0; p < length; ++p) left_path[p] = path[p];
        left_path[length] = (char *)left_key;
        if (condition) {
            bool parsed = false, included = ps_expression_truth(ps_string(parameter), context->data, (const char *const *)left_path, length + 1, &parsed);
            if (!parsed || !included) { free(left_path); continue; }
        }
        if (parameter && parameter->kind == PS_STRING && !condition) left = ps_path(left, ps_string(parameter));
        free(left_path); if (empty_value(left)) continue;
        for (size_t j = 0; j < i; ++j) {
            const ps_value *right = ps_at(values, j);
            const char *right_key = values->kind == PS_OBJECT ? ps_key_at(values, j) : NULL;
            char right_index[32]; if (!right_key) { snprintf(right_index, sizeof(right_index), "%zu", j); right_key = right_index; }
            if (condition) {
                char **right_path = calloc(length + 1, sizeof(*right_path)); if (!right_path) return false;
                for (size_t p = 0; p < length; ++p) right_path[p] = path[p];
                right_path[length] = (char *)right_key;
                bool parsed = false, included = ps_expression_truth(ps_string(parameter), context->data, (const char *const *)right_path, length + 1, &parsed);
                free(right_path); if (!parsed || !included) continue;
            }
            if (parameter && parameter->kind == PS_STRING && !condition) right = ps_path(right, ps_string(parameter));
            if (!empty_value(right) && ps_equal(left, right)) return false;
        }
    }
    return true;
}

static const ps_value *effective_parameter(const char *rule, const ps_value *declared,
                                           const validation_context *context,
                                           char *const *path, size_t length, ps_value **owned)
{
    static const char *const verbatim[] = {
        "equalTo", "notEqual", "unique", "enddate", "accept",
        "match", "pattern", "in",
    };
    *owned = NULL;
    if (!declared || string_in(rule, verbatim, sizeof(verbatim) / sizeof(verbatim[0]))) return declared;
    if (declared->kind == PS_OBJECT) {
        *owned = ps_condition_value(declared, context->data, (const char *const *)path, length);
        return *owned;
    }
    if (declared->kind == PS_STRING && ps_condition_expression(ps_string(declared))) {
        bool parsed = false;
        *owned = ps_expression_value(ps_string(declared), context->data, (const char *const *)path, length, &parsed);
        if (!parsed) { ps_value_free(*owned); *owned = ps_bool_value(false); }
        return *owned;
    }
    return declared;
}

static const char *custom_message(const ps_value *field, const char *rule)
{
    const ps_value *messages = ps_get(field, "messages");
    const ps_value *message = ps_get(messages, rule);
    return message && message->kind == PS_STRING ? ps_string(message) : NULL;
}

static char *parameter_text(const ps_value *parameter)
{
    if (!parameter) return NULL;
    return ps_scalar_string(parameter);
}

static char *message_for(const ps_value *field, const char *rule, const ps_value *parameter)
{
    const char *custom = custom_message(field, rule);
    if (custom) { char *copy = malloc(strlen(custom) + 1); if (copy) strcpy(copy, custom); return copy; }
    struct default_message { const char *rule, *message; };
    static const struct default_message defaults[] = {
        {"required", "This field is required."},
        {"email", "Please enter a valid email address."},
        {"minlength", "Please enter at least {0} characters."},
        {"maxlength", "Please enter no more than {0} characters."},
        {"min", "Please enter a value greater than or equal to {0}."},
        {"max", "Please enter a value less than or equal to {0}."},
        {"match", "Please enter a valid format."}, {"pattern", "Please enter a valid format."},
        {"unique", "Values must be unique."}, {"in", "Please select a valid option."},
        {"range", "Please enter a value between {0} and {1}."},
        {"rangelength", "Please enter a value between {0} and {1} characters."},
        {"number", "Please enter a valid number."}, {"digits", "Please enter only digits."},
        {"equalTo", "Please enter the same value again."}, {"notEqual", "Please enter a different value."},
        {"date", "Please enter a valid date."}, {"dateISO", "Please enter a valid date in ISO format (YYYY-MM-DD)."},
        {"enddate", "End date must be after the start date."}, {"url", "Please enter a valid URL."},
        {"accept", "Please upload a file with a valid format."},
        {"mincount", "Please select at least {0} items."}, {"maxcount", "Please select no more than {0} items."},
        {"step", "Please enter a value that is a multiple of {0}."},
    };
    const char *format = NULL;
    for (size_t i = 0; i < sizeof(defaults) / sizeof(defaults[0]); ++i)
        if (!strcmp(rule, defaults[i].rule)) { format = defaults[i].message; break; }
    if (!format) return NULL;
    char *first = NULL, *second = NULL;
    if (parameter && parameter->kind == PS_ARRAY) {
        first = parameter_text(ps_at(parameter, 0)); second = parameter_text(ps_at(parameter, 1));
    } else first = parameter_text(parameter);
    size_t size = strlen(format) + (first ? strlen(first) : 0) + (second ? strlen(second) : 0) + 1;
    char *out = calloc(size, 1); if (!out) { free(first); free(second); return NULL; }
    const char *cursor = format;
    while (*cursor) {
        if (!strncmp(cursor, "{0}", 3)) { strcat(out, first ? first : ""); cursor += 3; }
        else if (!strncmp(cursor, "{1}", 3)) { strcat(out, second ? second : ""); cursor += 3; }
        else { size_t used = strlen(out); out[used] = *cursor++; out[used + 1] = '\0'; }
    }
    free(first); free(second); return out;
}

static bool pattern_match(const char *value, const char *pattern)
{
    regex_t expression;
    if (regcomp(&expression, pattern, REG_EXTENDED | REG_NOSUB)) return true;
    bool matched = regexec(&expression, value, 0, NULL, 0) == 0;
    regfree(&expression); return matched;
}

static bool url_valid(const char *value)
{
    const char *separator = strstr(value, "://");
    if (!separator || !separator[3]) return false;
    size_t scheme = (size_t)(separator - value);
    return (scheme == 4 && !strncasecmp(value, "http", 4)) ||
        (scheme == 5 && !strncasecmp(value, "https", 5)) ||
        (scheme == 3 && !strncasecmp(value, "ftp", 3));
}

static bool rule_passes(const char *rule, const ps_value *value, const ps_value *parameter,
                        const ps_value *field, const validation_context *context,
                        char *const *path, size_t length)
{
    if (!strcmp(rule, "required")) return !(parameter->kind == PS_BOOL && parameter->data.boolean && empty_value(value));
    if (empty_value(value) && strcmp(rule, "mincount") && strcmp(rule, "maxcount")) return true;
    if (!strcmp(rule, "email")) return parameter->kind != PS_BOOL || !parameter->data.boolean ||
        (value->kind == PS_STRING && valid_email(ps_string(value)));
    if (!strcmp(rule, "number")) { double number; return parameter->kind == PS_BOOL && !parameter->data.boolean ? true : strict_number(value, &number); }
    if (!strcmp(rule, "digits")) return parameter->kind == PS_BOOL && !parameter->data.boolean ? true : digits_only(value);
    if (!strcmp(rule, "minlength") || !strcmp(rule, "maxlength")) {
        double limit; if (!parameter_number(parameter, &limit)) return true;
        size_t count = value->kind == PS_STRING ? utf8_length(ps_string(value)) : (value->kind == PS_ARRAY ? ps_size(value) : 0);
        return !strcmp(rule, "minlength") ? (double)count >= limit : (double)count <= limit;
    }
    if (!strcmp(rule, "min") || !strcmp(rule, "max")) {
        double actual, limit; if (!strict_number(value, &actual) || !parameter_number(parameter, &limit)) return true;
        return !strcmp(rule, "min") ? actual >= limit : actual <= limit;
    }
    if (!strcmp(rule, "range") || !strcmp(rule, "rangelength")) {
        if (parameter->kind != PS_ARRAY || ps_size(parameter) != 2) return true;
        double low, high; if (!parameter_number(ps_at(parameter, 0), &low) || !parameter_number(ps_at(parameter, 1), &high)) return true;
        double actual;
        if (!strcmp(rule, "range")) { if (!strict_number(value, &actual)) return true; }
        else actual = value->kind == PS_STRING ? (double)utf8_length(ps_string(value)) : (value->kind == PS_ARRAY ? (double)ps_size(value) : 0);
        return actual >= low && actual <= high;
    }
    if (!strcmp(rule, "step")) {
        double actual, step; if (!strict_number(value, &actual) || !parameter_number(parameter, &step) || step <= 0) return true;
        double quotient = actual / step; return fabs(quotient - round(quotient)) < 1e-9;
    }
    if (!strcmp(rule, "match") || !strcmp(rule, "pattern")) return parameter->kind != PS_STRING ||
        pattern_match(ps_string(value), ps_string(parameter));
    if (!strcmp(rule, "in")) {
        if (value->kind == PS_ARRAY) { for (size_t i = 0; i < ps_size(value); ++i) if (!in_value(ps_at(value, i), parameter)) return false; return true; }
        return in_value(value, parameter);
    }
    if (!strcmp(rule, "mincount") || !strcmp(rule, "maxcount")) {
        double limit; if (!parameter_number(parameter, &limit)) return true;
        size_t count = value && (value->kind == PS_ARRAY || value->kind == PS_OBJECT) ? ps_size(value) : 0;
        return !strcmp(rule, "mincount") ? (double)count >= limit : (double)count <= limit;
    }
    if (!strcmp(rule, "unique")) {
        if (value && (value->kind == PS_ARRAY || value->kind == PS_OBJECT)) return unique_values(value, parameter, context, path, length);
        if (length < 2 || empty_value(value)) return true;
        const ps_value *container = ps_path_segments(context->data, (const char *const *)path, length - 2);
        if (!container || (container->kind != PS_ARRAY && container->kind != PS_OBJECT)) return true;
        const char *item_key = path[length - 2], *field_name = path[length - 1];
        bool condition = parameter->kind == PS_STRING && ps_condition_expression(ps_string(parameter));
        if (condition) { bool parsed = false; if (!ps_expression_truth(ps_string(parameter), context->data, (const char *const *)path, length, &parsed) || !parsed) return true; }
        for (size_t i = 0; i < ps_size(container); ++i) {
            char index[32]; const char *key = container->kind == PS_OBJECT ? ps_key_at(container, i) : NULL;
            if (!key) { snprintf(index, sizeof(index), "%zu", i); key = index; }
            if (!strcmp(key, item_key)) break;
            const ps_value *item = ps_at(container, i), *other = ps_get(item, field_name);
            if (empty_value(other)) continue;
            if (condition) {
                char **sibling = calloc(length, sizeof(*sibling)); if (!sibling) return false;
                for (size_t p = 0; p < length; ++p) sibling[p] = path[p];
                sibling[length - 2] = (char *)key;
                bool parsed = false, included = ps_expression_truth(ps_string(parameter), context->data, (const char *const *)sibling, length, &parsed);
                free(sibling); if (!parsed || !included) continue;
            }
            if (ps_equal(value, other)) return false;
        }
        return true;
    }
    if (!strcmp(rule, "equalTo") || !strcmp(rule, "notEqual")) {
        const ps_value *other = parameter->kind == PS_STRING ? relative_field(ps_string(parameter), context, path, length) : parameter;
        bool equal = ps_equal(value, other); return !strcmp(rule, "equalTo") ? equal : !equal;
    }
    if (!strcmp(rule, "dateISO")) { int serial; return value->kind == PS_STRING && iso_date(ps_string(value), &serial); }
    if (!strcmp(rule, "date")) { int serial; return value->kind == PS_INT || value->kind == PS_FLOAT || (value->kind == PS_STRING && iso_date(ps_string(value), &serial)); }
    if (!strcmp(rule, "enddate")) {
        if (value->kind != PS_STRING || parameter->kind != PS_STRING) return true;
        int end, start; const ps_value *other = relative_field(ps_string(parameter), context, path, length);
        return !other || other->kind != PS_STRING || !iso_date(ps_string(value), &end) || !iso_date(ps_string(other), &start) || end >= start;
    }
    if (!strcmp(rule, "url")) return parameter->kind == PS_BOOL && !parameter->data.boolean ? true : value->kind == PS_STRING && url_valid(ps_string(value));
    if (!strcmp(rule, "accept")) return accept_value(value, parameter);
    (void)field; return true;
}

static bool append_error(validation_context *context, char *const *path, size_t length,
                         const char *rule, const char *message, const ps_value *value)
{
    char *full = path_text(path, length, NULL);
    ps_value *error = ps_object_value();
    bool ok = full && error &&
        ps_set(error, "path", ps_string_value(full)) &&
        ps_set(error, "field", ps_string_value(length ? path[length - 1] : "")) &&
        ps_set(error, "rule", ps_string_value(rule)) &&
        ps_set(error, "message", ps_string_value(message)) &&
        ps_set(error, "value", value ? ps_value_clone(value) : ps_null_value()) &&
        ps_append(context->errors, error);
    if (!ok) ps_value_free(error);
    free(full); return ok;
}

static bool array_level_rule(const char *rule)
{
    return !strcmp(rule, "required") || !strcmp(rule, "unique") ||
        !strcmp(rule, "mincount") || !strcmp(rule, "maxcount");
}

static bool validate_rules(const ps_value *field, const ps_value *value,
                           validation_context *context, char **path, size_t length,
                           bool array_level, bool element)
{
    const ps_value *rules = ps_get(field, "validate");
    if (ps_is_string(ps_get(field, "type"), "number") && (!rules || !ps_has(rules, "number"))) {
        ps_value *enabled = ps_bool_value(true);
        bool pass = rule_passes("number", value, enabled, field, context, path, length);
        if (!pass) { char *message = message_for(field, "number", enabled); bool ok = append_error(context, path, length, "number", message, value); free(message); ps_value_free(enabled); return ok; }
        ps_value_free(enabled);
    }
    if (!rules || rules->kind != PS_OBJECT) return true;
    for (size_t i = 0; i < ps_size(rules); ++i) {
        const char *rule = ps_key_at(rules, i); bool collection = array_level_rule(rule);
        if ((array_level && !collection) || (element && collection)) continue;
        ps_value *owned = NULL; const ps_value *parameter = effective_parameter(rule, ps_at(rules, i), context, path, length, &owned);
        if (!parameter || parameter->kind == PS_NULL || (parameter->kind == PS_BOOL && !parameter->data.boolean)) { ps_value_free(owned); continue; }
        if (!rule_passes(rule, value, parameter, field, context, path, length)) {
            char *message = message_for(field, rule, parameter);
            bool ok = message && append_error(context, path, length, rule, message, value);
            free(message); ps_value_free(owned); return ok;
        }
        ps_value_free(owned);
    }
    return true;
}

static int compare_keys(const void *left, const void *right)
{ return strcmp(*(const char *const *)left, *(const char *const *)right); }

/* Record a form input failure for the data path and stop traversal. */
static bool input_failure(validation_context *context, const char *label,
                          char *const *path, size_t length)
{
    char *full = path_text(path, length, NULL);
    char *message = full ? ps_string_join(label, full, "") : NULL;
    context->failure = message ? ps_error("input", "INVALID_FORM_INPUT", message, "", NULL) : NULL;
    free(full); free(message);
    return false;
}

/* Row keys of a keyed collection in sorted order; NULL only on allocation failure. */
static char **sorted_row_keys(const ps_value *rows, size_t *count)
{
    *count = ps_size(rows);
    char **keys = calloc(*count ? *count : 1, sizeof(*keys));
    if (!keys) return NULL;
    for (size_t j = 0; j < *count; ++j) keys[j] = (char *)ps_key_at(rows, j);
    qsort(keys, *count, sizeof(*keys), compare_keys);
    return keys;
}

static bool validate_properties(const ps_value *properties, const ps_value *data,
                                validation_context *context, char **path, size_t length)
{
    if (!properties || properties->kind != PS_OBJECT) return true;
    for (size_t i = 0; i < ps_size(properties); ++i) {
        const char *name = ps_key_at(properties, i); const ps_value *field = ps_at(properties, i);
        if (!field || field->kind != PS_OBJECT) continue;
        char **field_path = realloc(path, (length + 1) * sizeof(*field_path));
        if (!field_path) { free(path); return false; } path = field_path; path[length] = (char *)name;
        const ps_value *value = ps_get(data, name);
        const ps_value *multiple = ps_get(field, "multiple");
        bool repeated = multiple && (multiple->kind == PS_OBJECT || (multiple->kind == PS_BOOL && multiple->data.boolean));
        const ps_value *children = ps_get(field, "properties");
        bool group = ps_is_string(ps_get(field, "type"), "group") && children && children->kind == PS_OBJECT;
        if (repeated && value && value->kind != PS_OBJECT) {
            input_failure(context, "Repeated data must be a keyed object: ", path, length + 1);
            free(path); return false;
        }
        if (group) {
            if (repeated) {
                if (value) {
                    /* Keyed rows use sorted-key traversal in every implementation. */
                    size_t count = 0; char **keys = sorted_row_keys(value, &count);
                    if (!keys) { free(path); return false; }
                    bool valid = true;
                    for (size_t j = 0; valid && j < count; ++j) {
                        const ps_value *item = ps_get(value, keys[j]);
                        char **item_path = malloc((length + 2) * sizeof(*item_path));
                        if (!item_path) { valid = false; break; }
                        memcpy(item_path, path, (length + 1) * sizeof(*item_path)); item_path[length + 1] = keys[j];
                        if (!item || item->kind != PS_OBJECT) {
                            input_failure(context, "Group data must be an object: ", item_path, length + 2);
                            free(item_path); valid = false; break;
                        }
                        if (!validate_properties(children, item, context, item_path, length + 2))
                            valid = false;
                    }
                    if (valid)
                        valid = validate_rules(field, value, context, path, length + 1, false, false);
                    free(keys);
                    if (!valid) { free(path); return false; }
                }
            } else {
                if (value && value->kind != PS_OBJECT) {
                    input_failure(context, "Group data must be an object: ", path, length + 1);
                    free(path); return false;
                }
                char **child_path = malloc((length + 1) * sizeof(*child_path));
                if (!child_path) { free(path); return false; } memcpy(child_path, path, (length + 1) * sizeof(*child_path));
                if (!validate_properties(children, value, context, child_path, length + 1) ||
                    !validate_rules(field, value, context, path, length + 1, false, false)) { free(path); return false; }
            }
        } else if (repeated && value) {
            size_t before = ps_size(context->errors);
            if (!validate_rules(field, value, context, path, length + 1, true, false)) { free(path); return false; }
            if (ps_size(context->errors) == before) {
                size_t count = 0; char **keys = sorted_row_keys(value, &count);
                if (!keys) { free(path); return false; }
                bool valid = true;
                for (size_t j = 0; valid && j < count; ++j) {
                    const ps_value *item = ps_get(value, keys[j]);
                    char **item_path = malloc((length + 2) * sizeof(*item_path));
                    if (!item_path) { valid = false; break; }
                    memcpy(item_path, path, (length + 1) * sizeof(*item_path)); item_path[length + 1] = keys[j];
                    valid = validate_rules(field, item, context, item_path, length + 2, false, true);
                    free(item_path);
                }
                free(keys);
                if (!valid) { free(path); return false; }
            }
        } else if (!validate_rules(field, value, context, path, length + 1, false, false)) { free(path); return false; }
    }
    free(path); return true;
}

static ps_result validation_result(ps_value *errors)
{
    ps_value *result = ps_object_value(); bool valid = ps_size(errors) == 0;
    if (!result || !ps_set(result, "valid", ps_bool_value(valid)) || !ps_set(result, "errors", errors)) {
        ps_value_free(result); ps_value_free(errors); return ps_fail("internal", "INTERNAL_ERROR", "Validation failed", "");
    }
    return ps_ok(result);
}

static const ps_value *option_files(const ps_value *options)
{
    const ps_value *files = ps_get(options, "files");
    return files && files->kind == PS_OBJECT ? files : NULL;
}

static const char *option_basepath(const ps_value *options)
{
    const ps_value *basepath = ps_get(options, "basepath");
    return basepath && basepath->kind == PS_STRING ? ps_string(basepath) : "";
}

ps_result ps_validate(const ps_value *spec, const ps_value *data, const ps_value *options)
{
    /* Root data is a request precondition, checked before composition. */
    if (!data || data->kind != PS_OBJECT)
        return ps_fail("input", "INVALID_FORM_INPUT", "Form data must be an object", "");
    const ps_value *files = option_files(options); ps_value *error = NULL, *properties = NULL;
    if (spec && spec->kind == PS_OBJECT && (ps_has(spec, "$ref") || ps_has(spec, "$patch")) &&
        (!ps_get(spec, "properties") || ps_get(spec, "properties")->kind != PS_OBJECT))
        properties = ps_compose_properties(spec, files, option_basepath(options), &error);
    else {
        ps_value *composed = ps_compose_spec(spec, files, option_basepath(options), &error);
        if (composed) { properties = ps_value_clone(ps_get(composed, "properties")); ps_value_free(composed); }
    }
    if (error) { ps_value_free(properties); return (ps_result){NULL, error}; }
    if (!properties) properties = ps_object_value();
    char **root_path = malloc(sizeof(*root_path)); if (root_path) root_path[0] = "properties";
    error = scan_forbidden(properties, root_path, 1);
    free(root_path);
    /* The form root declarations are scanned like the fields they sit beside. */
    static const char *const form_keys[] = {"buttons", "action"};
    for (size_t i = 0; !error && spec && spec->kind == PS_OBJECT && i < 2; ++i) {
        char *form_path[1] = {(char *)form_keys[i]};
        if (ps_get(spec, form_keys[i])) error = scan_forbidden(ps_get(spec, form_keys[i]), form_path, 1);
    }
    if (error) { ps_value_free(properties); return (ps_result){NULL, error}; }
    validation_context context = {data, ps_array_value(), NULL};
    if (!context.errors || !validate_properties(properties, data, &context, NULL, 0)) {
        ps_value_free(properties); ps_value_free(context.errors);
        if (context.failure) return (ps_result){NULL, context.failure};
        return ps_fail("internal", "INTERNAL_ERROR", "Validation failed", "");
    }
    ps_value_free(properties); return validation_result(context.errors);
}

ps_result ps_validate_list(const ps_value *spec, const ps_value *options)
{
    const ps_value *files = option_files(options); ps_value *error = NULL;
    ps_value *composed = ps_compose_spec(spec, files, option_basepath(options), &error);
    if (!composed && !error) composed = ps_object_value();
    if (error) return (ps_result){NULL, error};
    const ps_value *columns = ps_get(composed, "columns");
    if (columns && columns->kind == PS_OBJECT) {
        ps_value *resolved = ps_compose_properties(columns, files, option_basepath(options), &error);
        if (resolved && !ps_set(composed, "columns", resolved)) { ps_value_free(resolved); }
    }
    const ps_value *search = ps_get(composed, "search");
    if (!error && search && search->kind == PS_OBJECT && (ps_has(search, "$ref") || ps_has(search, "$patch"))) {
        ps_value *resolved = ps_compose_properties(search, files, option_basepath(options), &error);
        if (resolved && !ps_set(composed, "search", resolved)) { ps_value_free(resolved); }
    }
    if (!error) error = scan_forbidden(composed, NULL, 0);
    ps_value_free(composed);
    if (error) return (ps_result){NULL, error};
    return validation_result(ps_array_value());
}
