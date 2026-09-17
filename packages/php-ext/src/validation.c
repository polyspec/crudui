#include "engine_internal.h"

#include <ctype.h>
#include <errno.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <time.h>

typedef struct {
    const ps_value *data;
    ps_value *errors;
    /* The failure that ends validation; NULL with a false result means an internal failure. */
    ps_value *failure;
    /* The declaration path of the current field: property names without row keys. */
    ps_text *declaration;
    size_t declaration_capacity;
    /* Compiled patterns by source text, filled when the parameters are checked. */
    ps_pattern_cache *patterns;
} validation_context;

static bool string_in(ps_text value, const char *const *items, size_t count)
{
    for (size_t i = 0; i < count; ++i) if (ps_text_is(value, items[i])) return true;
    return false;
}

static bool forbidden_key(ps_text key)
{
    static const char *const keys[] = {
        "display_switch", "display_target", "if", "when", "show_if",
        "_", "seqtokey", "__13hex__", "$after", "$before",
        "$merge", "$remove", "xclass", "xstyle",
    };
    return (key.length >= 2 && key.bytes[0] == 'x') || string_in(key, keys, sizeof(keys) / sizeof(keys[0]));
}

static ps_value *path_trace(const ps_text *path, size_t length, ps_text key)
{
    ps_value *trace = ps_array_value();
    if (!trace) return NULL;
    for (size_t i = 0; i < length; ++i)
        if (!ps_append(trace, ps_text_value(path[i]))) goto fail;
    if (key.bytes && !ps_append(trace, ps_text_value(key))) goto fail;
    return trace;
fail:
    ps_value_free(trace);
    return NULL;
}

/* The dotted path, followed by the key when it has bytes. */
static ps_chars path_text(const ps_text *path, size_t length, ps_text key)
{
    ps_html_buffer out = {0};
    for (size_t i = 0; i < length; ++i) {
        if (i) ps_html_character(&out, '.');
        ps_html_append(&out, path[i]);
    }
    if (key.bytes) {
        if (length) ps_html_character(&out, '.');
        ps_html_append(&out, key);
    }
    return ps_html_take(&out);
}

static ps_value *scan_forbidden(const ps_value *node, ps_text *path, size_t length)
{
    if (!node || (node->kind != PS_ARRAY && node->kind != PS_OBJECT)) return NULL;
    if (node->kind == PS_OBJECT) {
        for (size_t i = 0; i < ps_size(node); ++i) {
            ps_text key = ps_key(node, i);
            if (!forbidden_key(key)) continue;
            ps_chars at = path_text(path, length, key);
            ps_value *trace = path_trace(path, length, key);
            ps_chars message = at.bytes
                ? PS_CONCAT(PS_TEXT("forbidden meta key \""), key, PS_TEXT("\" at "), ps_view(at))
                : at;
            ps_value *error = message.bytes && trace
                ? ps_error_text("compose", "FORBIDDEN_META_KEY", ps_view(message), ps_view(at), trace)
                : NULL;
            free(message.bytes); free(at.bytes); ps_value_free(trace);
            return error ? error : ps_error("internal", "INTERNAL_ERROR", "Validation failed", "", NULL);
        }
    }
    for (size_t i = 0; i < ps_size(node); ++i) {
        char index[32];
        ps_text key = ps_key(node, i);
        if (node->kind == PS_ARRAY) { snprintf(index, sizeof(index), "%zu", i); key = ps_fixed(index); }
        ps_text *next = malloc((length + 1) * sizeof(*next));
        if (!next) return ps_error("internal", "INTERNAL_ERROR", "Validation failed", "", NULL);
        if (length) memcpy(next, path, length * sizeof(*next));
        next[length] = key;
        ps_value *error = scan_forbidden(ps_at(node, i), next, length + 1);
        free(next);
        if (error) return error;
    }
    return NULL;
}

static const ps_value *relative_field(ps_text reference, const validation_context *context,
                                      const ps_text *path, size_t length)
{
    size_t first = 0;
    while (first < reference.length) {
        uint32_t point;
        size_t size = ps_utf8_decode(reference, first, &point);
        if (!ps_whitespace(point)) break;
        first += size;
    }
    reference = ps_text_slice(reference, first, reference.length);
    size_t dots = 0;
    while (dots < reference.length && reference.bytes[dots] == '.') dots++;
    if (dots) {
        size_t base = length ? length - 1 : 0;
        for (size_t i = 1; i < dots && base; ++i) base--;
        size_t tail = 0; ps_text *parts = NULL;
        if (!ps_path_parts(ps_text_slice(reference, dots, reference.length), &parts, &tail)) return NULL;
        ps_text *segments = calloc(base + tail ? base + tail : 1, sizeof(*segments));
        if (!segments) { free(parts); return NULL; }
        for (size_t i = 0; i < base; ++i) segments[i] = path[i];
        for (size_t i = 0; i < tail; ++i) segments[base + i] = parts[i];
        const ps_value *value = ps_path_segments(context->data, segments, base + tail);
        free(segments); free(parts); return value;
    }
    if (ps_text_find_byte(reference, '.', 0) != SIZE_MAX) return ps_path(context->data, reference);
    const ps_value *parent = ps_path_segments(context->data, path, length ? length - 1 : 0);
    return parent && parent->kind == PS_OBJECT ? ps_get_text(parent, reference) : NULL;
}

static bool valid_email(ps_text text)
{
    static const char local_symbols[] = ".!#$%&'*+/=?^_`{|}~-";
    size_t at = ps_text_find_byte(text, '@', 0);
    if (at == SIZE_MAX || at == 0 || ps_text_find_byte(text, '@', at + 1) != SIZE_MAX ||
        at + 1 == text.length || text.bytes[at - 1] == '.' || text.bytes[0] == '.') return false;
    for (size_t i = 0; i + 1 < at; ++i)
        if (text.bytes[i] == '.' && text.bytes[i + 1] == '.') return false;
    if (!isalnum((unsigned char)text.bytes[at + 1])) return false;
    for (size_t i = 0; i < at; ++i) {
        unsigned char c = (unsigned char)text.bytes[i];
        if (!isalnum(c) && (!c || !memchr(local_symbols, c, sizeof(local_symbols) - 1))) return false;
    }
    for (size_t i = at + 1; i < text.length; ++i) {
        unsigned char c = (unsigned char)text.bytes[i];
        if (!isalnum(c) && c != '-' && c != '.') return false;
        if (c == '.' && (i + 1 == text.length || text.bytes[i - 1] == '.')) return false;
    }
    return true;
}

static int decimal_at(ps_text text, size_t start, size_t count)
{
    int value = 0;
    for (size_t i = start; i < start + count; ++i) value = value * 10 + (text.bytes[i] - '0');
    return value;
}

static bool iso_date(ps_text text, int *serial)
{
    if (text.length != 10 || text.bytes[4] != '-' || text.bytes[7] != '-') return false;
    for (size_t i = 0; i < 10; ++i) if (i != 4 && i != 7 && !isdigit((unsigned char)text.bytes[i])) return false;
    int year = decimal_at(text, 0, 4), month = decimal_at(text, 5, 2), day = decimal_at(text, 8, 2);
    static const int days[] = {0,31,28,31,30,31,30,31,31,30,31,30,31};
    if (month < 1 || month > 12) return false;
    int limit = days[month];
    if (month == 2 && (year % 400 == 0 || (year % 4 == 0 && year % 100 != 0))) limit++;
    if (day < 1 || day > limit) return false;
    if (serial) *serial = year * 372 + month * 31 + day;
    return true;
}

static bool same_letters(ps_text left, ps_text right)
{
    if (left.length != right.length) return false;
    for (size_t i = 0; i < left.length; ++i)
        if (tolower((unsigned char)left.bytes[i]) != tolower((unsigned char)right.bytes[i])) return false;
    return true;
}

static bool mime_extension(ps_text filename, ps_text extension)
{
    size_t dot = SIZE_MAX;
    for (size_t i = filename.length; i-- > 0;) if (filename.bytes[i] == '.') { dot = i; break; }
    if (dot == SIZE_MAX || dot + 1 == filename.length) return false;
    return same_letters(ps_text_slice(filename, dot + 1, filename.length), extension);
}

static bool accept_one(ps_text value, ps_text item)
{
    item = ps_trim(item);
    if (!item.length) return false;
    if (item.bytes[0] == '.') {
        /* An extension of 31 bytes or fewer. */
        if (item.length - 1 >= 32) return false;
        return mime_extension(value, ps_text_slice(item, 1, item.length));
    }
    if (ps_text_find_byte(value, '/', 0) == SIZE_MAX) return false;
    if (ps_text_is(item, "*/*")) return true;
    if (item.length >= 2 && item.bytes[item.length - 1] == '*' && item.bytes[item.length - 2] == '/')
        return value.length >= item.length - 1 &&
            same_letters(ps_text_slice(value, 0, item.length - 1), ps_text_slice(item, 0, item.length - 1));
    return same_letters(value, item);
}

static bool accept_value(const ps_value *value, const ps_value *parameter)
{
    if (!parameter || parameter->kind != PS_STRING || !value || value->kind != PS_STRING) return true;
    ps_text list = ps_string(parameter);
    size_t start = 0;
    for (;;) {
        size_t comma = ps_text_find_byte(list, ',', start);
        size_t end = comma == SIZE_MAX ? list.length : comma;
        if (accept_one(ps_string(value), ps_text_slice(list, start, end))) return true;
        if (comma == SIZE_MAX) break;
        start = comma + 1;
    }
    return false;
}

/* The member name of an array or object item at index, with index text in the buffer. */
static ps_text item_key(const ps_value *container, size_t index, char *buffer, size_t size)
{
    if (container->kind == PS_OBJECT) return ps_key(container, index);
    snprintf(buffer, size, "%zu", index);
    return ps_fixed(buffer);
}

/* 1 when the values are unique, 0 when not, -1 on allocation failure. */
static int unique_values(const ps_value *values, const ps_value *parameter,
                         const validation_context *context, const ps_text *path, size_t length)
{
    bool condition = parameter && parameter->kind == PS_STRING && ps_condition_expression(ps_string(parameter));
    for (size_t i = 0; i < ps_size(values); ++i) {
        const ps_value *left = ps_at(values, i);
        char left_index[32];
        ps_text left_key = item_key(values, i, left_index, sizeof(left_index));
        ps_text *left_path = calloc(length + 1, sizeof(*left_path));
        if (!left_path) return -1;
        for (size_t p = 0; p < length; ++p) left_path[p] = path[p];
        left_path[length] = left_key;
        if (condition) {
            bool parsed = false, included = ps_expression_truth(ps_string(parameter), context->data, left_path, length + 1, &parsed);
            if (!parsed || !included) { free(left_path); continue; }
        }
        if (parameter && parameter->kind == PS_STRING && !condition) left = ps_path(left, ps_string(parameter));
        free(left_path); if (ps_empty_value(left)) continue;
        for (size_t j = 0; j < i; ++j) {
            const ps_value *right = ps_at(values, j);
            char right_index[32];
            ps_text right_key = item_key(values, j, right_index, sizeof(right_index));
            if (condition) {
                ps_text *right_path = calloc(length + 1, sizeof(*right_path)); if (!right_path) return -1;
                for (size_t p = 0; p < length; ++p) right_path[p] = path[p];
                right_path[length] = right_key;
                bool parsed = false, included = ps_expression_truth(ps_string(parameter), context->data, right_path, length + 1, &parsed);
                free(right_path); if (!parsed || !included) continue;
            }
            if (parameter && parameter->kind == PS_STRING && !condition) right = ps_path(right, ps_string(parameter));
            if (!ps_empty_value(right) && ps_equal(left, right)) return 0;
        }
    }
    return 1;
}

static const ps_value *effective_parameter(ps_text rule, const ps_value *declared,
                                           const validation_context *context,
                                           const ps_text *path, size_t length, ps_value **owned)
{
    static const char *const verbatim[] = {
        "equalTo", "notEqual", "unique", "enddate", "accept",
        "match", "pattern", "in",
    };
    *owned = NULL;
    if (!declared || string_in(rule, verbatim, sizeof(verbatim) / sizeof(verbatim[0]))) return declared;
    *owned = ps_resolve_conditional(declared, context->data, path, length);
    return *owned;
}

/*
 * Visibility (docs/spec/validation-rules.md, "Evaluation"): 1 when design.show resolves to false in
 * the field's row context, 0 when the field is visible, -1 when the resolution cannot be allocated.
 */
static int hidden_field(const ps_value *field, const validation_context *context,
                        const ps_text *path, size_t length)
{
    const ps_value *design = ps_get(field, "design");
    bool failed = false;
    bool shown = ps_shown(design && design->kind == PS_OBJECT ? ps_get(design, "show") : NULL,
                          context->data, path, length, &failed);
    return failed ? -1 : !shown;
}

static const ps_value *custom_message(const ps_value *field, ps_text rule)
{
    const ps_value *messages = ps_get(field, "messages");
    const ps_value *message = messages && messages->kind == PS_OBJECT ? ps_get_text(messages, rule) : NULL;
    return message && message->kind == PS_STRING ? message : NULL;
}

/*
 * The message of a failed rule: the declared message or the default. The parameters of the length,
 * numeric and count rules are shown as their canonical text: every {0} is the parameter, or the
 * first of a pair, and every {1} the second of a pair.
 */
static ps_chars message_for(const ps_value *field, ps_text rule, const ps_value *parameter)
{
    const ps_value *custom = custom_message(field, rule);
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
    ps_text format = {NULL, 0};
    if (custom) format = ps_string(custom);
    for (size_t i = 0; !custom && i < sizeof(defaults) / sizeof(defaults[0]); ++i)
        if (ps_text_is(rule, defaults[i].rule)) { format = ps_fixed(defaults[i].message); break; }
    if (!format.bytes) return (ps_chars){NULL, 0};
    bool shown = ps_length_rule(rule) ||
        (ps_number_rule(rule) && !ps_text_is(rule, "number") && !ps_text_is(rule, "digits"));
    if (!shown) return ps_copy(format);
    bool pair = ps_text_is(rule, "range") || ps_text_is(rule, "rangelength");
    ps_chars texts[2] = {{NULL, 0}, {NULL, 0}};
    const ps_value *values[2] = {pair ? ps_at(parameter, 0) : parameter, pair ? ps_at(parameter, 1) : NULL};
    for (size_t i = 0; i < 2; ++i)
        if (values[i] && ps_canonical_text(values[i], &texts[i]) < 0) values[i] = NULL, texts[0].length = SIZE_MAX;
    ps_html_buffer out = {0};
    if (texts[0].length == SIZE_MAX) out.failed = true;
    for (size_t cursor = 0; cursor < format.length;) {
        size_t index = cursor + 2 < format.length && format.bytes[cursor] == '{' && format.bytes[cursor + 2] == '}'
            ? (size_t)(format.bytes[cursor + 1] - '0') : 2;
        if (index < 2 && texts[index].bytes) {
            ps_html_append(&out, ps_view(texts[index]));
            cursor += 3;
        } else ps_html_character(&out, format.bytes[cursor++]);
    }
    free(texts[0].bytes); free(texts[1].bytes);
    return ps_html_take(&out);
}

static bool url_valid(ps_text value)
{
    size_t separator = ps_text_find(value, PS_TEXT("://"), 0);
    if (separator == SIZE_MAX || separator + 3 == value.length) return false;
    ps_text scheme = ps_text_slice(value, 0, separator);
    return same_letters(scheme, PS_TEXT("http")) || same_letters(scheme, PS_TEXT("https")) ||
        same_letters(scheme, PS_TEXT("ftp"));
}

/*
 * The whole-value pattern match of a nonempty value (docs/spec/validation-rules.md, "Patterns"):
 * the canonical text of a scalar against the pattern compiled when it was checked; an array or
 * object has no canonical text and fails.
 */
static int pattern_passes(validation_context *context, const ps_value *value, const ps_value *parameter)
{
    const ps_pattern *pattern = NULL;
    ps_pattern_error error;
    if (parameter->kind != PS_STRING ||
        ps_pattern_cache_get(context->patterns, ps_string(parameter), &pattern, &error) <= 0) return -1;
    ps_chars text;
    int scalar = ps_canonical_text(value, &text);
    if (scalar <= 0) return scalar;
    int matched = ps_pattern_matches(pattern, ps_view(text));
    free(text.bytes);
    return matched;
}

/* 1 when the rule passes, 0 when it fails, -1 when validation cannot continue. */
static int rule_passes(ps_text rule, const ps_value *value, const ps_value *parameter,
                       const ps_value *field, validation_context *context,
                       const ps_text *path, size_t length)
{
    if (ps_text_is(rule, "required")) return !(parameter->kind == PS_BOOL && parameter->data.boolean && ps_empty_value(value));
    if (ps_empty_value(value) && !ps_text_is(rule, "mincount") && !ps_text_is(rule, "maxcount")) return 1;
    if (ps_text_is(rule, "email")) return parameter->kind != PS_BOOL || !parameter->data.boolean ||
        (value->kind == PS_STRING && valid_email(ps_string(value)));
    if (ps_number_rule(rule)) return ps_number_passes(rule, value, parameter);
    if (ps_length_rule(rule)) return ps_length_passes(rule, value, parameter);
    if (ps_text_is(rule, "match") || ps_text_is(rule, "pattern")) return pattern_passes(context, value, parameter);
    if (ps_text_is(rule, "in")) return ps_in_passes(value, parameter);
    if (ps_text_is(rule, "unique")) {
        if (value && (value->kind == PS_ARRAY || value->kind == PS_OBJECT)) return unique_values(value, parameter, context, path, length);
        if (length < 2 || ps_empty_value(value)) return 1;
        const ps_value *container = ps_path_segments(context->data, path, length - 2);
        if (!container || (container->kind != PS_ARRAY && container->kind != PS_OBJECT)) return 1;
        ps_text item_name = path[length - 2], field_name = path[length - 1];
        bool condition = parameter->kind == PS_STRING && ps_condition_expression(ps_string(parameter));
        if (condition) { bool parsed = false; if (!ps_expression_truth(ps_string(parameter), context->data, path, length, &parsed) || !parsed) return 1; }
        for (size_t i = 0; i < ps_size(container); ++i) {
            char index[32];
            ps_text key = item_key(container, i, index, sizeof(index));
            if (ps_text_equal(key, item_name)) break;
            const ps_value *item = ps_at(container, i);
            const ps_value *other = item && item->kind == PS_OBJECT ? ps_get_text(item, field_name) : NULL;
            if (ps_empty_value(other)) continue;
            if (condition) {
                ps_text *sibling = calloc(length, sizeof(*sibling)); if (!sibling) return -1;
                for (size_t p = 0; p < length; ++p) sibling[p] = path[p];
                sibling[length - 2] = key;
                bool parsed = false, included = ps_expression_truth(ps_string(parameter), context->data, sibling, length, &parsed);
                free(sibling); if (!parsed || !included) continue;
            }
            if (ps_equal(value, other)) return 0;
        }
        return 1;
    }
    if (ps_text_is(rule, "equalTo") || ps_text_is(rule, "notEqual")) {
        const ps_value *other = parameter->kind == PS_STRING ? relative_field(ps_string(parameter), context, path, length) : parameter;
        bool equal = ps_equal(value, other); return ps_text_is(rule, "equalTo") ? equal : !equal;
    }
    if (ps_text_is(rule, "dateISO")) { int serial; return value->kind == PS_STRING && iso_date(ps_trim(ps_string(value)), &serial); }
    if (ps_text_is(rule, "date")) { int serial; return value->kind == PS_INT || value->kind == PS_FLOAT || (value->kind == PS_STRING && iso_date(ps_trim(ps_string(value)), &serial)); }
    if (ps_text_is(rule, "enddate")) {
        if (value->kind != PS_STRING || parameter->kind != PS_STRING) return 1;
        int end, start; const ps_value *other = relative_field(ps_string(parameter), context, path, length);
        return !other || other->kind != PS_STRING || !iso_date(ps_trim(ps_string(value)), &end) || !iso_date(ps_trim(ps_string(other)), &start) || end >= start;
    }
    if (ps_text_is(rule, "url")) return parameter->kind == PS_BOOL && !parameter->data.boolean ? 1 : value->kind == PS_STRING && url_valid(ps_trim(ps_string(value)));
    if (ps_text_is(rule, "accept")) return accept_value(value, parameter);
    (void)field; return 1;
}

static bool append_error(validation_context *context, const ps_text *path, size_t length,
                         ps_text rule, ps_text message, const ps_value *value)
{
    ps_chars full = path_text(path, length, (ps_text){NULL, 0});
    ps_value *error = ps_object_value();
    bool ok = full.bytes && error &&
        ps_set(error, "path", ps_text_value(ps_view(full))) &&
        ps_set(error, "field", ps_text_value(length ? path[length - 1] : PS_TEXT(""))) &&
        ps_set(error, "rule", ps_text_value(rule)) &&
        ps_set(error, "message", ps_text_value(message)) &&
        ps_set(error, "value", value ? ps_value_clone(value) : ps_null_value()) &&
        ps_append(context->errors, error);
    if (!ok) ps_value_free(error);
    free(full.bytes); return ok;
}

/* Record a failed rule; false when the error cannot be recorded. */
static bool rule_error(validation_context *context, const ps_text *path, size_t length,
                       const ps_value *field, ps_text rule, const ps_value *parameter,
                       const ps_value *value)
{
    ps_chars message = message_for(field, rule, parameter);
    bool ok = message.bytes && append_error(context, path, length, rule, ps_view(message), value);
    free(message.bytes);
    return ok;
}

static bool array_level_rule(ps_text rule)
{
    return ps_text_is(rule, "required") || ps_text_is(rule, "unique") ||
        ps_text_is(rule, "mincount") || ps_text_is(rule, "maxcount");
}

/*
 * The rules of a field. depth is the length of the field's declaration path in
 * context->declaration.
 */
static bool validate_rules(const ps_value *field, const ps_value *value,
                           validation_context *context, ps_text *path, size_t length,
                           size_t depth, bool array_level, bool element)
{
    const ps_value *rules = ps_get(field, "validate");
    if (ps_is_string(ps_get(field, "type"), "number") && (!rules || !ps_has(rules, "number"))) {
        ps_value *enabled = ps_bool_value(true);
        if (!enabled) return false;
        int pass = rule_passes(PS_TEXT("number"), value, enabled, field, context, path, length);
        bool ok = pass >= 0 && (pass || rule_error(context, path, length, field, PS_TEXT("number"), enabled, value));
        ps_value_free(enabled);
        if (!ok || !pass) return ok;
    }
    if (!rules || rules->kind != PS_OBJECT) return true;
    for (size_t i = 0; i < ps_size(rules); ++i) {
        ps_text rule = ps_key(rules, i); bool collection = array_level_rule(rule);
        if ((array_level && !collection) || (element && collection)) continue;
        ps_value *owned = NULL; const ps_value *parameter = effective_parameter(rule, ps_at(rules, i), context, path, length, &owned);
        if (!parameter) return false;
        if (parameter->kind == PS_NULL || (parameter->kind == PS_BOOL && !parameter->data.boolean)) { ps_value_free(owned); continue; }
        if (owned) {
            /* A resolved parameter is checked when it is selected; a literal was checked at load. */
            ps_parameter_problem problem;
            if (!ps_rule_parameter(rule, parameter, context->patterns, &problem)) { ps_value_free(owned); return false; }
            if (problem.code) {
                context->failure = ps_parameter_error(rule, &problem, context->declaration, depth);
                ps_value_free(owned); return false;
            }
        }
        int pass = rule_passes(rule, value, parameter, field, context, path, length);
        if (pass <= 0) {
            bool ok = pass == 0 && rule_error(context, path, length, field, rule, parameter, value);
            ps_value_free(owned); return ok;
        }
        ps_value_free(owned);
    }
    return true;
}

static int compare_keys(const void *left, const void *right)
{ return ps_text_compare(*(const ps_text *)left, *(const ps_text *)right); }

/* Record a form input failure for the data path and stop traversal. */
static bool input_failure(validation_context *context, const char *label,
                          const ps_text *path, size_t length)
{
    ps_chars full = path_text(path, length, (ps_text){NULL, 0});
    ps_chars message = full.bytes ? PS_CONCAT(ps_fixed(label), ps_view(full)) : full;
    context->failure = message.bytes
        ? ps_error_text("input", "INVALID_FORM_INPUT", ps_view(message), PS_TEXT(""), NULL) : NULL;
    free(full.bytes); free(message.bytes);
    return false;
}

/* Row keys of a keyed collection in sorted order; NULL only on allocation failure. */
static ps_text *sorted_row_keys(const ps_value *rows, size_t *count)
{
    *count = ps_size(rows);
    ps_text *keys = calloc(*count ? *count : 1, sizeof(*keys));
    if (!keys) return NULL;
    for (size_t j = 0; j < *count; ++j) keys[j] = ps_key(rows, j);
    qsort(keys, *count, sizeof(*keys), compare_keys);
    return keys;
}

/* A repeated field: multiple is true, only or an object. */
static bool repeated_field(const ps_value *field)
{
    const ps_value *multiple = ps_get(field, "multiple");
    return multiple && (multiple->kind == PS_OBJECT || ps_is_string(multiple, "only") ||
                        (multiple->kind == PS_BOOL && multiple->data.boolean));
}

/* The rows of a repeated scalar field, each with its element rules, in sorted key order. */
static bool validate_elements(const ps_value *field, const ps_value *rows, validation_context *context,
                              const ps_text *path, size_t length, size_t depth)
{
    size_t count = 0;
    ps_text *keys = sorted_row_keys(rows, &count);
    if (!keys) return false;
    ps_text *item_path = malloc((length + 1) * sizeof(*item_path));
    bool valid = item_path != NULL;
    if (valid) memcpy(item_path, path, length * sizeof(*item_path));
    for (size_t j = 0; valid && j < count; ++j) {
        item_path[length] = keys[j];
        valid = validate_rules(field, ps_get_text(rows, keys[j]), context, item_path, length + 1, depth, false, true);
    }
    free(item_path); free(keys);
    return valid;
}

/*
 * Validate fields; path is owned and freed. depth is the declaration path length of properties.
 * The data shape is checked for every field; the rules of a hidden field and of everything it
 * contains are not evaluated (hidden is set inside a hidden field). A repeated field without data
 * is an empty collection: its collection rules run and it has no rows.
 */
static bool validate_properties(const ps_value *properties, const ps_value *data,
                                validation_context *context, ps_text *path, size_t length,
                                size_t depth, bool hidden)
{
    if (!properties || properties->kind != PS_OBJECT) { free(path); return true; }
    for (size_t i = 0; i < ps_size(properties); ++i) {
        ps_text name = ps_key(properties, i); const ps_value *field = ps_at(properties, i);
        if (!field || field->kind != PS_OBJECT) continue;
        if (depth + 1 > context->declaration_capacity) {
            size_t capacity = context->declaration_capacity ? context->declaration_capacity * 2 : 8;
            ps_text *declaration = realloc(context->declaration, capacity * sizeof(*declaration));
            if (!declaration) { free(path); return false; }
            context->declaration = declaration; context->declaration_capacity = capacity;
        }
        context->declaration[depth] = name;
        ps_text *field_path = realloc(path, (length + 1) * sizeof(*field_path));
        if (!field_path) { free(path); return false; } path = field_path; path[length] = name;
        const ps_value *value = data && data->kind == PS_OBJECT ? ps_get_text(data, name) : NULL;
        bool repeated = repeated_field(field);
        const ps_value *children = ps_get(field, "properties");
        bool group = ps_is_string(ps_get(field, "type"), "group") && children && children->kind == PS_OBJECT;
        if (repeated && value && value->kind != PS_OBJECT) {
            input_failure(context, "Repeated data must be a keyed object: ", path, length + 1);
            free(path); return false;
        }
        if (group && !repeated && value && value->kind != PS_OBJECT) {
            input_failure(context, "Group data must be an object: ", path, length + 1);
            free(path); return false;
        }
        int hides = hidden ? 1 : hidden_field(field, context, path, length + 1);
        if (hides < 0) { free(path); return false; }
        bool skipped = hides == 1;
        bool valid = true;
        if (group && repeated) {
            /* Keyed rows use sorted-key traversal in every implementation. */
            size_t count = 0; ps_text *keys = value ? sorted_row_keys(value, &count) : NULL;
            if (value && !keys) { free(path); return false; }
            for (size_t j = 0; valid && j < count; ++j) {
                const ps_value *item = ps_get_text(value, keys[j]);
                ps_text *item_path = malloc((length + 2) * sizeof(*item_path));
                if (!item_path) { valid = false; break; }
                memcpy(item_path, path, (length + 1) * sizeof(*item_path)); item_path[length + 1] = keys[j];
                if (!item || item->kind != PS_OBJECT) {
                    input_failure(context, "Group data must be an object: ", item_path, length + 2);
                    free(item_path); valid = false; break;
                }
                valid = validate_properties(children, item, context, item_path, length + 2, depth + 1, skipped);
            }
            free(keys);
            if (valid && !skipped)
                valid = validate_rules(field, value, context, path, length + 1, depth + 1, false, false);
        } else if (group) {
            ps_text *child_path = malloc((length + 1) * sizeof(*child_path));
            if (!child_path) { free(path); return false; }
            memcpy(child_path, path, (length + 1) * sizeof(*child_path));
            valid = validate_properties(children, value, context, child_path, length + 1, depth + 1, skipped) &&
                (skipped || validate_rules(field, value, context, path, length + 1, depth + 1, false, false));
        } else if (skipped) {
            /* A hidden scalar field has no data shape to check. */
        } else if (repeated) {
            size_t before = ps_size(context->errors);
            valid = validate_rules(field, value, context, path, length + 1, depth + 1, true, false);
            if (valid && value && ps_size(context->errors) == before)
                valid = validate_elements(field, value, context, path, length + 1, depth + 1);
        } else {
            valid = validate_rules(field, value, context, path, length + 1, depth + 1, false, false);
        }
        if (!valid) { free(path); return false; }
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

static ps_text option_basepath(const ps_value *options)
{
    const ps_value *basepath = options && options->kind == PS_OBJECT ? ps_get(options, "basepath") : NULL;
    return ps_string(basepath);
}

static ps_result validate_form(const ps_value *spec, const ps_value *data, const ps_value *options);
static ps_result validate_list(const ps_value *spec, const ps_value *options);
static ps_result validate_detail(const ps_value *spec, const ps_value *options);

/*
 * Specifications and composition files are validated in specification member order; the
 * submitted data keeps its order.
 */
ps_result ps_validate(const ps_value *spec, const ps_value *data, const ps_value *options)
{
    ps_value *ordered_spec = NULL, *ordered_options = NULL;
    if (!ps_order_specification(spec, options, &ordered_spec, &ordered_options))
        return ps_fail("internal", "INTERNAL_ERROR", "Validation failed", "");
    ps_result result = validate_form(ordered_spec, data, ordered_options);
    ps_value_free(ordered_spec); ps_value_free(ordered_options);
    return result;
}

ps_result ps_validate_list(const ps_value *spec, const ps_value *options)
{
    ps_value *ordered_spec = NULL, *ordered_options = NULL;
    if (!ps_order_specification(spec, options, &ordered_spec, &ordered_options))
        return ps_fail("internal", "INTERNAL_ERROR", "Validation failed", "");
    ps_result result = validate_list(ordered_spec, ordered_options);
    ps_value_free(ordered_spec); ps_value_free(ordered_options);
    return result;
}

ps_result ps_validate_detail(const ps_value *spec, const ps_value *options)
{
    ps_value *ordered_spec = NULL, *ordered_options = NULL;
    if (!ps_order_specification(spec, options, &ordered_spec, &ordered_options))
        return ps_fail("internal", "INTERNAL_ERROR", "Validation failed", "");
    ps_result result = validate_detail(ordered_spec, ordered_options);
    ps_value_free(ordered_spec); ps_value_free(ordered_options);
    return result;
}

static ps_result validate_form(const ps_value *spec, const ps_value *data, const ps_value *options)
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
    ps_text root_path[1] = {PS_TEXT("properties")};
    error = scan_forbidden(properties, root_path, 1);
    /* The form root declarations are scanned like the fields they sit beside. */
    static const char *const form_keys[] = {"buttons", "action"};
    for (size_t i = 0; !error && spec && spec->kind == PS_OBJECT && i < 2; ++i) {
        ps_text form_path[1] = {ps_fixed(form_keys[i])};
        if (ps_get(spec, form_keys[i])) error = scan_forbidden(ps_get(spec, form_keys[i]), form_path, 1);
    }
    ps_pattern_cache *patterns = error ? NULL : ps_pattern_cache_new();
    if (!error && !patterns) error = ps_error("internal", "INTERNAL_ERROR", "Validation failed", "", NULL);
    /* Rule parameters are checked after composition and the forbidden-key scan. */
    if (!error) error = ps_check_rule_parameters(properties, patterns);
    if (error) { ps_pattern_cache_free(patterns); ps_value_free(properties); return (ps_result){NULL, error}; }
    validation_context context = {data, ps_array_value(), NULL, NULL, 0, patterns};
    bool valid = context.errors && validate_properties(properties, data, &context, NULL, 0, 0, false);
    free(context.declaration);
    ps_pattern_cache_free(patterns);
    ps_value_free(properties);
    if (!valid) {
        ps_value_free(context.errors);
        if (context.failure) return (ps_result){NULL, context.failure};
        return ps_fail("internal", "INTERNAL_ERROR", "Validation failed", "");
    }
    return validation_result(context.errors);
}

/* Compose a list or detail root; NULL with *error unset means an internal failure. */
static ps_value *compose_view_root(const ps_value *spec, const ps_value *options, ps_value **error)
{
    ps_value *composed = ps_compose_spec(spec, option_files(options), option_basepath(options), error);
    if (!composed && !*error) composed = ps_object_value();
    return composed;
}

/* Expand an object map member of a composed view root with properties composition. */
static void compose_view_map(ps_value *composed, const char *key, const ps_value *options, ps_value **error)
{
    const ps_value *map = ps_get(composed, key);
    if (*error || !map || map->kind != PS_OBJECT) return;
    ps_value *resolved = ps_compose_properties(map, option_files(options), option_basepath(options), error);
    if (resolved && !ps_set(composed, key, resolved)) { ps_value_free(resolved); }
}

/* Scan the composed view tree and return the clean-load result. */
static ps_result finish_view(ps_value *composed, ps_value *error)
{
    if (!error) error = scan_forbidden(composed, NULL, 0);
    ps_value_free(composed);
    if (error) return (ps_result){NULL, error};
    return validation_result(ps_array_value());
}

static ps_result validate_list(const ps_value *spec, const ps_value *options)
{
    ps_value *error = NULL;
    ps_value *composed = compose_view_root(spec, options, &error);
    if (error) return (ps_result){NULL, error};
    compose_view_map(composed, "columns", options, &error);
    const ps_value *search = ps_get(composed, "search");
    if (search && search->kind == PS_OBJECT && (ps_has(search, "$ref") || ps_has(search, "$patch")))
        compose_view_map(composed, "search", options, &error);
    return finish_view(composed, error);
}

static ps_result validate_detail(const ps_value *spec, const ps_value *options)
{
    ps_value *error = NULL;
    ps_value *composed = compose_view_root(spec, options, &error);
    if (error) return (ps_result){NULL, error};
    compose_view_map(composed, "fields", options, &error);
    return finish_view(composed, error);
}
