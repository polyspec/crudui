#include "engine_internal.h"

#include <ctype.h>
#include <limits.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    char *data;
    size_t length;
    size_t capacity;
} text_buffer;

static bool buffer_reserve(text_buffer *buffer, size_t extra)
{
    if (extra > SIZE_MAX - buffer->length - 1) return false;
    size_t needed = buffer->length + extra + 1;
    if (needed <= buffer->capacity) return true;
    size_t capacity = buffer->capacity ? buffer->capacity : 64;
    while (capacity < needed) {
        if (capacity > SIZE_MAX / 2) { capacity = needed; break; }
        capacity *= 2;
    }
    char *data = realloc(buffer->data, capacity);
    if (!data) return false;
    buffer->data = data;
    buffer->capacity = capacity;
    return true;
}

static bool buffer_bytes(text_buffer *buffer, const char *value, size_t length)
{
    if (!buffer_reserve(buffer, length)) return false;
    if (length) memcpy(buffer->data + buffer->length, value, length);
    buffer->length += length;
    buffer->data[buffer->length] = '\0';
    return true;
}

static bool buffer_text(text_buffer *buffer, const char *value)
{
    return buffer_bytes(buffer, value, strlen(value));
}

static bool buffer_char(text_buffer *buffer, char value)
{
    return buffer_bytes(buffer, &value, 1);
}

static char *buffer_take(text_buffer *buffer)
{
    if (!buffer->data) {
        buffer->data = calloc(1, 1);
        if (!buffer->data) return NULL;
    }
    char *data = buffer->data;
    buffer->data = NULL;
    buffer->length = buffer->capacity = 0;
    return data;
}

static char *copy_range(const char *value, size_t length)
{
    char *copy = malloc(length + 1);
    if (!copy) return NULL;
    if (length) memcpy(copy, value, length);
    copy[length] = '\0';
    return copy;
}

char *ps_string_join(const char *left, const char *middle, const char *right)
{
    text_buffer out = {0};
    if (!buffer_text(&out, left ? left : "") ||
        !buffer_text(&out, middle ? middle : "") ||
        !buffer_text(&out, right ? right : "")) {
        free(out.data); return NULL;
    }
    return buffer_take(&out);
}

static bool whitespace(char value)
{
    return isspace((unsigned char)value) != 0;
}

char *ps_join_classes(const char *first, const char *second, const char *third)
{
    const char *parts[] = {first, second, third};
    text_buffer out = {0};
    bool pending_space = false;
    for (size_t part = 0; part < 3; ++part) {
        const char *value = parts[part] ? parts[part] : "";
        for (; *value; ++value) {
            if (whitespace(*value)) {
                if (out.length) pending_space = true;
            } else {
                if (pending_space && !buffer_char(&out, ' ')) goto fail;
                pending_space = false;
                if (!buffer_char(&out, *value)) goto fail;
            }
        }
        if (out.length) pending_space = true;
    }
    return buffer_take(&out);
fail:
    free(out.data); return NULL;
}

char *ps_join_path(const char *parent, const char *child)
{
    if (!parent || !*parent) return copy_range(child ? child : "", strlen(child ? child : ""));
    return ps_string_join(parent, ".", child ? child : "");
}

bool ps_path_parts(const char *path, char ***result, size_t *length)
{
    if (!path || !result || !length) return false;
    *result = NULL;
    *length = 0;
    size_t capacity = 0;
    char **parts = NULL;
    const char *start = path;
    bool bracket = false;
    for (const char *cursor = path;; ++cursor) {
        char value = *cursor;
        bool boundary = (!value || (!bracket && (value == '.' || value == '[')) ||
                         (bracket && value == ']'));
        if (boundary && cursor > start) {
            if (*length == capacity) {
                size_t next = capacity ? capacity * 2 : 4;
                char **resized = realloc(parts, next * sizeof(*parts));
                if (!resized) goto fail;
                parts = resized; capacity = next;
            }
            parts[*length] = copy_range(start, (size_t)(cursor - start));
            if (!parts[*length]) goto fail;
            (*length)++;
        }
        if (!value) break;
        if (!bracket && value == '[') { bracket = true; start = cursor + 1; }
        else if (bracket && value == ']') { bracket = false; start = cursor + 1; }
        else if (!bracket && value == '.') start = cursor + 1;
    }
    *result = parts;
    return true;
fail:
    ps_path_parts_free(parts, *length);
    *length = 0;
    return false;
}

void ps_path_parts_free(char **parts, size_t length)
{
    for (size_t i = 0; i < length; ++i) free(parts[i]);
    free(parts);
}

char *ps_bracket_name(const char *path, const char *prefix)
{
    size_t length = 0;
    char **parts = NULL;
    if (!ps_path_parts(path, &parts, &length)) return NULL;
    text_buffer out = {0};
    bool has_prefix = prefix && *prefix;
    if (has_prefix && !buffer_text(&out, prefix)) goto fail;
    for (size_t i = 0; i < length; ++i) {
        const char *part = parts[i];
        if (!out.length) { if (!buffer_text(&out, part)) goto fail; }
        else if (!buffer_char(&out, '[') || !buffer_text(&out, part) ||
                 !buffer_char(&out, ']')) goto fail;
    }
    if (!length && has_prefix && !buffer_text(&out, "[]")) goto fail;
    ps_path_parts_free(parts, length);
    return buffer_take(&out);
fail:
    ps_path_parts_free(parts, length); free(out.data); return NULL;
}

static bool row_segment(size_t index, const size_t *rows, size_t count)
{
    for (size_t i = 0; i < count; ++i) if (rows[i] == index) return true;
    return false;
}

char *ps_rule_name(const char *path, const size_t *rows, size_t count)
{
    size_t length = 0;
    char **parts = NULL;
    if (!ps_path_parts(path, &parts, &length)) return NULL;
    text_buffer out = {0};
    if (length && !buffer_text(&out, parts[0])) goto fail;
    for (size_t i = 1; i < length; ++i) {
        if (row_segment(i, rows, count)) {
            if (!buffer_text(&out, "[]")) goto fail;
        } else if (!buffer_char(&out, '[') || !buffer_text(&out, parts[i]) ||
                   !buffer_char(&out, ']')) goto fail;
    }
    size_t source_length = strlen(path);
    if (source_length >= 2 && !strcmp(path + source_length - 2, "[]") &&
        !buffer_text(&out, "[]")) goto fail;
    ps_path_parts_free(parts, length); return buffer_take(&out);
fail:
    ps_path_parts_free(parts, length); free(out.data); return NULL;
}

char *ps_leaf_name(const char *path, const size_t *rows, size_t count)
{
    size_t length = 0;
    char **parts = NULL;
    if (!ps_path_parts(path, &parts, &length)) return NULL;
    const char *last = length ? parts[length - 1] : path;
    bool repeated = length && row_segment(length - 1, rows, count);
    const char *base = repeated ? (length > 1 ? parts[length - 2] : "") : last;
    size_t source_length = strlen(path);
    bool suffix = repeated || (source_length >= 2 && !strcmp(path + source_length - 2, "[]"));
    char *out = suffix ? ps_string_join(base, "[]", "") : copy_range(base, strlen(base));
    ps_path_parts_free(parts, length); return out;
}

static bool unreserved(unsigned char value)
{
    return (value >= 'A' && value <= 'Z') ||
           (value >= 'a' && value <= 'z') ||
           (value >= '0' && value <= '9') ||
           strchr("-_.!~*'()", value) != NULL;
}

static bool encode_component(text_buffer *out, const char *value)
{
    static const char hex[] = "0123456789ABCDEF";
    for (const unsigned char *cursor = (const unsigned char *)value; *cursor; ++cursor) {
        if (unreserved(*cursor)) { if (!buffer_char(out, (char)*cursor)) return false; }
        else {
            char encoded[] = {'%', hex[*cursor >> 4], hex[*cursor & 15]};
            if (!buffer_bytes(out, encoded, sizeof(encoded))) return false;
        }
    }
    return true;
}

char *ps_control_id(const char *prefix, const char *path)
{
    text_buffer out = {0};
    if (!encode_component(&out, prefix ? prefix : "") || !buffer_char(&out, ':') ||
        !encode_component(&out, path ? path : "")) { free(out.data); return NULL; }
    return buffer_take(&out);
}

static size_t utf8_codepoint(const unsigned char *value, uint32_t *code)
{
    if (value[0] < 0x80) { *code = value[0]; return 1; }
    if ((value[0] & 0xe0) == 0xc0) { *code = ((value[0] & 0x1f) << 6) | (value[1] & 0x3f); return 2; }
    if ((value[0] & 0xf0) == 0xe0) { *code = ((value[0] & 0x0f) << 12) | ((value[1] & 0x3f) << 6) | (value[2] & 0x3f); return 3; }
    *code = ((value[0] & 7) << 18) | ((value[1] & 0x3f) << 12) |
            ((value[2] & 0x3f) << 6) | (value[3] & 0x3f); return 4;
}

char *ps_element_id(const char *prefix, const char *path)
{
    text_buffer out = {0};
    if (prefix && *prefix && (!buffer_text(&out, prefix) || !buffer_char(&out, '-'))) goto fail;
    const unsigned char *cursor = (const unsigned char *)path;
    while (*cursor) {
        if (cursor[0] == '[' && cursor[1] == ']' ) { cursor += 2; continue; }
        if (cursor[0] == ']' && cursor[1] == '[') {
            if (!buffer_char(&out, '-')) goto fail;
            cursor += 2;
            continue;
        }
        if (*cursor == '[' || *cursor == ']') {
            if (!buffer_char(&out, '-')) goto fail;
            cursor++;
            continue;
        }
        uint32_t code = 0;
        size_t bytes = utf8_codepoint(cursor, &code);
        if (code < 128 && (isalnum((unsigned char)code) || code == '_' || code == '-')) {
            if (!buffer_char(&out, (char)code)) goto fail;
        } else {
            if (!buffer_char(&out, '-') || (code > 0xffff && !buffer_char(&out, '-'))) goto fail;
        }
        cursor += bytes;
    }
    return buffer_take(&out);
fail:
    free(out.data); return NULL;
}

char *ps_translate(const ps_value *value, const char *language)
{
    if (value && value->kind == PS_STRING) return copy_range(ps_string(value), value->data.string.length);
    if (!value || value->kind != PS_OBJECT) return copy_range("", 0);
    const char *keys[] = {language ? language : "ko", "en", "ko"};
    for (size_t i = 0; i < 4; ++i) {
        const ps_value *candidate = i < 3 ? ps_get(value, keys[i]) : ps_at(value, 0);
        if (candidate && ps_truthy(candidate)) return ps_scalar_string(candidate);
    }
    return copy_range("", 0);
}

static bool append_json(text_buffer *out, const ps_value *value);

static bool append_quoted(text_buffer *out, const char *value, size_t length)
{
    static const char hex[] = "0123456789abcdef";
    if (!buffer_char(out, '"')) return false;
    for (size_t i = 0; i < length; ++i) {
        unsigned char c = (unsigned char)value[i];
        if (c == '"' || c == '\\') {
            if (!buffer_char(out, '\\') || !buffer_char(out, (char)c)) return false;
        } else if (c == '\b' || c == '\f' || c == '\n' || c == '\r' || c == '\t') {
            const char escape = c == '\b' ? 'b' : c == '\f' ? 'f' : c == '\n' ? 'n' : c == '\r' ? 'r' : 't';
            if (!buffer_char(out, '\\') || !buffer_char(out, escape)) return false;
        } else if (c < 0x20) {
            char escaped[] = {'\\','u','0','0',hex[c >> 4],hex[c & 15]};
            if (!buffer_bytes(out, escaped, sizeof(escaped))) return false;
        } else if (!buffer_char(out, (char)c)) return false;
    }
    return buffer_char(out, '"');
}

static bool append_json(text_buffer *out, const ps_value *value)
{
    char number[80];
    if (!value || value->kind == PS_NULL) return buffer_text(out, "null");
    switch (value->kind) {
        case PS_BOOL: return buffer_text(out, value->data.boolean ? "true" : "false");
        case PS_INT:
            snprintf(number, sizeof(number), "%lld", (long long)value->data.integer);
            return buffer_text(out, number);
        case PS_FLOAT:
            snprintf(number, sizeof(number), "%.15g", value->data.number);
            return buffer_text(out, number);
        case PS_STRING:
            return append_quoted(out, value->data.string.bytes, value->data.string.length);
        case PS_ARRAY:
            if (!buffer_char(out, '[')) return false;
            for (size_t i = 0; i < ps_size(value); ++i)
                if ((i && !buffer_char(out, ',')) || !append_json(out, ps_at(value, i))) return false;
            return buffer_char(out, ']');
        case PS_OBJECT:
            if (!buffer_char(out, '{')) return false;
            for (size_t i = 0; i < ps_size(value); ++i) {
                if ((i && !buffer_char(out, ',')) ||
                    !append_quoted(out, ps_key_at(value, i), strlen(ps_key_at(value, i))) ||
                    !buffer_char(out, ':') || !append_json(out, ps_at(value, i))) return false;
            }
            return buffer_char(out, '}');
        default: return false;
    }
}

char *ps_json_string(const ps_value *value)
{
    text_buffer out = {0};
    if (!append_json(&out, value)) { free(out.data); return NULL; }
    return buffer_take(&out);
}

char *ps_json_quote(const char *value)
{
    text_buffer out = {0};
    if (!append_quoted(&out, value, strlen(value))) { free(out.data); return NULL; }
    return buffer_take(&out);
}

static char *trim_range(const char *start, const char *end)
{
    while (start < end && whitespace(*start)) start++;
    while (end > start && whitespace(end[-1])) end--;
    return copy_range(start, (size_t)(end - start));
}

char *ps_style_string(const char *source)
{
    text_buffer out = {0};
    const char *start = source;
    const char *colon = NULL;
    char quote = 0;
    bool escaped = false, comment = false;
    char blocks[128];
    size_t depth = 0;
    for (const char *cursor = source;; ++cursor) {
        char c = *cursor, next = c ? cursor[1] : 0;
        bool finish = !c;
        if (comment) {
            if (c == '*' && next == '/') { comment = false; cursor++; }
            if (!c) break;
            continue;
        }
        if (escaped) { escaped = false; if (!c) break; continue; }
        if (c == '\\') { escaped = true; continue; }
        if (quote) { if (c == quote) quote = 0; if (!c) break; continue; }
        if (c == '/' && next == '*') { comment = true; cursor++; continue; }
        if (c == '"' || c == '\'') { quote = c; continue; }
        if (c == '(' || c == '[' || c == '{') { if (depth < sizeof(blocks)) blocks[depth++] = c; continue; }
        if (c == ')' || c == ']' || c == '}') {
            char open = c == ')' ? '(' : c == ']' ? '[' : '{';
            if (depth && blocks[depth - 1] == open) depth--;
            continue;
        }
        if (!depth && c == ':' && !colon) { colon = cursor; continue; }
        if (!depth && c == ';') finish = true;
        if (finish) {
            if (colon) {
                char *property = trim_range(start, colon);
                char *value = trim_range(colon + 1, cursor);
                if (!property || !value) { free(property); free(value); goto fail; }
                if (*property && *value) {
                    if (out.length && !buffer_text(&out, "; ")) { free(property); free(value); goto fail; }
                    if (!buffer_text(&out, property) || !buffer_text(&out, ": ") ||
                        !buffer_text(&out, value)) { free(property); free(value); goto fail; }
                }
                free(property); free(value);
            }
            start = cursor + 1; colon = NULL;
        }
        if (!c) break;
    }
    return buffer_take(&out);
fail:
    free(out.data); return NULL;
}


static const char *trim_left(const char *value)
{
    while (*value && whitespace(*value)) value++;
    return value;
}

bool ps_condition_expression(const char *value)
{
    const char *text = trim_left(value);
    if (*text == '.') return true;
    if (isalpha((unsigned char)*text) || *text == '_') {
        const char *cursor = text + 1;
        while (isalnum((unsigned char)*cursor) || *cursor == '_') cursor++;
        if (*cursor == '.') return true;
    }
    if (strchr(text, '?') && strchr(strchr(text, '?') + 1, ':')) return true;
    const char *words[] = {" == ", " != ", " > ", " >= ", " < ", " <= ",
                           " && ", " || ", " in ", " not in "};
    for (size_t i = 0; i < sizeof(words) / sizeof(words[0]); ++i)
        if (strstr(text, words[i])) return true;
    return false;
}
