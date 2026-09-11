#include "engine_internal.h"

#include <ctype.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    char *property;
    char *value;
} style_declaration;

static bool reserve(ps_html_buffer *out, size_t extra)
{
    if (out->failed) return false;
    if (extra > SIZE_MAX - out->length - 1) { out->failed = true; return false; }
    size_t needed = out->length + extra + 1;
    if (needed <= out->capacity) return true;
    size_t capacity = out->capacity ? out->capacity : 256;
    while (capacity < needed) {
        if (capacity > SIZE_MAX / 2) { capacity = needed; break; }
        capacity *= 2;
    }
    char *data = realloc(out->data, capacity);
    if (!data) { out->failed = true; return false; }
    out->data = data;
    out->capacity = capacity;
    return true;
}

bool ps_html_bytes(ps_html_buffer *out, const char *value, size_t length)
{
    if (!reserve(out, length)) return false;
    if (length) memcpy(out->data + out->length, value, length);
    out->length += length;
    out->data[out->length] = '\0';
    return true;
}

bool ps_html_text(ps_html_buffer *out, const char *value)
{
    return ps_html_bytes(out, value ? value : "", strlen(value ? value : ""));
}

bool ps_html_character(ps_html_buffer *out, char value)
{
    return ps_html_bytes(out, &value, 1);
}

char *ps_html_take(ps_html_buffer *out)
{
    if (out->failed) { free(out->data); out->data = NULL; return NULL; }
    if (!out->data) {
        out->data = calloc(1, 1);
        if (!out->data) return NULL;
    }
    char *result = out->data;
    out->data = NULL;
    out->length = out->capacity = 0;
    return result;
}

ps_value *ps_html_value(ps_html_buffer *out)
{
    if (out->failed) { free(out->data); out->data = NULL; return NULL; }
    ps_value *value = ps_value_new(PS_STRING);
    if (!value || !ps_value_string(value, (const uint8_t *)(out->data ? out->data : ""),
                                   out->length)) {
        ps_value_free(value);
        free(out->data);
        out->data = NULL;
        return NULL;
    }
    free(out->data);
    out->data = NULL;
    out->length = out->capacity = 0;
    return value;
}

static char *copy_range(const char *start, const char *end)
{
    while (start < end && isspace((unsigned char)*start)) start++;
    while (end > start && isspace((unsigned char)end[-1])) end--;
    size_t length = (size_t)(end - start);
    char *copy = malloc(length + 1);
    if (!copy) return NULL;
    if (length) memcpy(copy, start, length);
    copy[length] = '\0';
    return copy;
}

bool ps_html_escaped(ps_html_buffer *out, const char *value, size_t length, bool raw)
{
    for (size_t i = 0; i < length; ++i) {
        switch ((unsigned char)value[i]) {
            case '&': if (!ps_html_text(out, "&amp;")) return false; break;
            case '<': if (!ps_html_text(out, "&lt;")) return false; break;
            case '>':
                if (raw) { if (!ps_html_character(out, '>')) return false; }
                else if (!ps_html_text(out, "&gt;")) return false;
                break;
            case '"': if (!ps_html_text(out, "&quot;")) return false; break;
            case '\'':
                if (raw) { if (!ps_html_character(out, '\'')) return false; }
                else if (!ps_html_text(out, "&#x27;")) return false;
                break;
            default: if (!ps_html_character(out, value[i])) return false;
        }
    }
    return true;
}

bool ps_html_raw_text(ps_html_buffer *out, const char *value, size_t length)
{
    for (size_t i = 0; i < length; ++i) {
        if (value[i] == '&') { if (!ps_html_text(out, "&amp;")) return false; }
        else if (value[i] == '<') { if (!ps_html_text(out, "&lt;")) return false; }
        else if (value[i] == '>') { if (!ps_html_text(out, "&gt;")) return false; }
        else if (!ps_html_character(out, value[i])) return false;
    }
    return true;
}

static char *style_property(const char *start, const char *end)
{
    ps_html_buffer cleaned = {0};
    for (const char *cursor = start; cursor < end;) {
        if (cursor + 1 < end && cursor[0] == '/' && cursor[1] == '*') {
            if (cleaned.length && cleaned.data[cleaned.length - 1] != ' ' &&
                !ps_html_character(&cleaned, ' ')) return ps_html_take(&cleaned);
            cursor += 2;
            while (cursor < end && !(cursor + 1 < end && cursor[0] == '*' && cursor[1] == '/'))
                cursor++;
            if (cursor < end) cursor += 2;
        } else if (!ps_html_character(&cleaned, *cursor++)) return ps_html_take(&cleaned);
    }
    char *raw = ps_html_take(&cleaned);
    if (!raw) return NULL;
    char *trimmed = copy_range(raw, raw + strlen(raw));
    free(raw);
    if (!trimmed || !strncmp(trimmed, "--", 2)) return trimmed;

    ps_html_buffer camel = {0};
    for (size_t i = 0; trimmed[i]; ++i) {
        if (trimmed[i] == '-' && trimmed[i + 1] >= 'a' && trimmed[i + 1] <= 'z') {
            if (!ps_html_character(&camel, (char)toupper((unsigned char)trimmed[++i]))) break;
        } else if (!ps_html_character(&camel, trimmed[i])) break;
    }
    free(trimmed);
    char *key = ps_html_take(&camel);
    if (!key) return NULL;
    ps_html_buffer css = {0};
    for (const char *cursor = key; *cursor; ++cursor) {
        if (*cursor >= 'A' && *cursor <= 'Z') {
            if (!ps_html_character(&css, '-') ||
                !ps_html_character(&css, (char)tolower((unsigned char)*cursor))) break;
        } else if (!ps_html_character(&css, *cursor)) break;
    }
    free(key);
    char *property = ps_html_take(&css);
    if (!property) return NULL;
    if (!strncmp(property, "ms-", 3)) {
        size_t length = strlen(property);
        char *prefixed = malloc(length + 2);
        if (!prefixed) { free(property); return NULL; }
        prefixed[0] = '-';
        memcpy(prefixed + 1, property, length + 1);
        free(property);
        property = prefixed;
    }
    return property;
}

static bool style_finish(const char *end, const char *start, const char *colon,
                         style_declaration **items, size_t *length, size_t *capacity)
{
    if (!colon) return true;
    char *property = style_property(start, colon);
    char *value = copy_range(colon + 1, end);
    if (!property || !value) { free(property); free(value); return false; }
    if (!*property || !*value) { free(property); free(value); return true; }
    for (size_t i = 0; i < *length; ++i) {
        if (!strcmp((*items)[i].property, property)) {
            free((*items)[i].value);
            (*items)[i].value = value;
            free(property);
            return true;
        }
    }
    if (*length == *capacity) {
        size_t next = *capacity ? *capacity * 2 : 4;
        if (next > SIZE_MAX / sizeof(**items)) { free(property); free(value); return false; }
        style_declaration *resized = realloc(*items, next * sizeof(**items));
        if (!resized) { free(property); free(value); return false; }
        *items = resized;
        *capacity = next;
    }
    (*items)[(*length)++] = (style_declaration){property, value};
    return true;
}

static char *render_style(const char *source)
{
    style_declaration *items = NULL;
    size_t length = 0, capacity = 0;
    const char *start = source, *colon = NULL;
    char quote = 0, blocks[128];
    size_t depth = 0;
    bool escaped = false, comment = false;
    for (const char *cursor = source;; ++cursor) {
        char current = *cursor, next = current ? cursor[1] : 0;
        if (comment) {
            if (current == '*' && next == '/') { comment = false; cursor++; }
            if (!current) break;
            continue;
        }
        if (escaped) { escaped = false; if (!current) break; continue; }
        if (current == '\\') { escaped = true; continue; }
        if (quote) { if (current == quote) quote = 0; if (!current) break; continue; }
        if (current == '/' && next == '*') { comment = true; cursor++; continue; }
        if (current == '"' || current == '\'') { quote = current; continue; }
        if (current == '(' || current == '[' || current == '{') {
            if (depth < sizeof(blocks)) blocks[depth++] = current;
            continue;
        }
        if (current == ')' || current == ']' || current == '}') {
            char open = current == ')' ? '(' : current == ']' ? '[' : '{';
            if (depth && blocks[depth - 1] == open) depth--;
            continue;
        }
        if (!depth && current == ':' && !colon) { colon = cursor; continue; }
        if ((!depth && current == ';') || !current) {
            if (!style_finish(cursor, start, colon, &items, &length, &capacity)) goto fail;
            start = cursor + 1;
            colon = NULL;
        }
        if (!current) break;
    }
    ps_html_buffer out = {0};
    for (size_t i = 0; i < length; ++i) {
        if ((i && !ps_html_character(&out, ';')) || !ps_html_text(&out, items[i].property) ||
            !ps_html_character(&out, ':') || !ps_html_text(&out, items[i].value))
            out.failed = true;
        free(items[i].property);
        free(items[i].value);
    }
    free(items);
    return ps_html_take(&out);
fail:
    for (size_t i = 0; i < length; ++i) {
        free(items[i].property);
        free(items[i].value);
    }
    free(items);
    return NULL;
}

static bool dangerous_url(const char *value, size_t length)
{
    size_t cursor = 0;
    while (cursor < length && (unsigned char)value[cursor] <= 0x20) cursor++;
    const char *scheme = "javascript";
    for (size_t i = 0; scheme[i]; ++i) {
        if (i) {
            while (cursor < length &&
                   (value[cursor] == '\r' || value[cursor] == '\n' || value[cursor] == '\t'))
                cursor++;
        }
        if (cursor >= length || tolower((unsigned char)value[cursor]) != scheme[i]) return false;
        cursor++;
    }
    while (cursor < length &&
           (value[cursor] == '\r' || value[cursor] == '\n' || value[cursor] == '\t'))
        cursor++;
    return cursor < length && value[cursor] == ':';
}

static const char *attribute_name(const char *name)
{
    if (!strcmp(name, "autocomplete")) return "autoComplete";
    if (!strcmp(name, "readonly")) return "readOnly";
    if (!strcmp(name, "maxlength")) return "maxLength";
    if (!strcmp(name, "minlength")) return "minLength";
    if (!strcmp(name, "colspan")) return "colSpan";
    if (!strcmp(name, "rowspan")) return "rowSpan";
    return name;
}

static bool boolean_attribute(const char *name)
{
    return !strcmp(name, "readonly") || !strcmp(name, "disabled") ||
        !strcmp(name, "required") || !strcmp(name, "multiple") ||
        !strcmp(name, "autofocus");
}

static bool moved_input_attribute(const char *name)
{
    return !strcmp(name, "name") || !strcmp(name, "checked") || !strcmp(name, "value");
}

static bool append_attribute(ps_html_buffer *out, const char *name,
                             const ps_value *value, bool raw)
{
    if (!value || value->kind == PS_NULL) return true;
    char *owned = NULL, *style = NULL;
    const char *rendered;
    size_t length;
    if (value->kind == PS_STRING) {
        rendered = value->data.string.bytes;
        length = value->data.string.length;
    } else {
        owned = ps_scalar_string(value);
        if (!owned) return false;
        rendered = owned;
        length = strlen(owned);
    }
    if (!raw && !strcmp(name, "style")) {
        if (memchr(rendered, '\0', length)) { free(owned); return false; }
        style = render_style(rendered);
        if (!style) { free(owned); return false; }
        rendered = style;
        length = strlen(style);
        if (!length) { free(style); free(owned); return true; }
    } else if (!raw && boolean_attribute(name)) {
        rendered = "";
        length = 0;
    } else if (!raw && (!strcmp(name, "href") || !strcmp(name, "src"))) {
        if (!strcmp(name, "src") && !length) { free(owned); return true; }
        if (dangerous_url(rendered, length)) {
            rendered = "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')";
            length = strlen(rendered);
        }
    }
    bool ok = ps_html_character(out, ' ') && ps_html_text(out, raw ? name : attribute_name(name)) &&
        ps_html_text(out, "=\"") && ps_html_escaped(out, rendered, length, raw) &&
        ps_html_character(out, '"');
    free(style);
    free(owned);
    return ok;
}

static bool append_attributes(ps_html_buffer *out, const char *tag,
                              const ps_value *attrs, bool raw, bool style_last)
{
    if (!attrs || attrs->kind != PS_OBJECT) return true;
    bool input = !raw && !strcmp(tag, "input");
    bool value_control = !raw && (!strcmp(tag, "select") || !strcmp(tag, "textarea"));
    for (size_t i = 0; i < ps_size(attrs); ++i) {
        const char *name = ps_key_at(attrs, i);
        if ((input && moved_input_attribute(name)) || (value_control && !strcmp(name, "value")) ||
            (style_last && !strcmp(name, "style"))) continue;
        if (!append_attribute(out, name, ps_at(attrs, i), raw)) return false;
    }
    if (style_last && ps_has(attrs, "style") &&
        !append_attribute(out, "style", ps_get(attrs, "style"), raw)) return false;
    if (input) {
        const char *names[] = {"name", "checked", "value"};
        for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); ++i)
            if (ps_has(attrs, names[i]) &&
                !append_attribute(out, names[i], ps_get(attrs, names[i]), false)) return false;
    }
    return true;
}

bool ps_html_void_tag(const char *tag)
{
    return !strcmp(tag, "input") || !strcmp(tag, "img") || !strcmp(tag, "br") ||
        !strcmp(tag, "hr") || !strcmp(tag, "link");
}

bool ps_html_start_element(ps_html_buffer *out, const char *tag,
                           const ps_value *attrs, bool raw, bool style_last)
{
    return ps_html_character(out, '<') && ps_html_text(out, tag) &&
        append_attributes(out, tag, attrs, raw, style_last) &&
        ps_html_text(out, !raw && ps_html_void_tag(tag) ? "/>" : ">");
}

bool ps_html_end_element(ps_html_buffer *out, const char *tag)
{
    return ps_html_void_tag(tag) ? true : ps_html_text(out, "</") && ps_html_text(out, tag) &&
        ps_html_character(out, '>');
}

bool ps_html_attr_string(ps_value *attrs, const char *name, const char *value)
{
    return ps_set(attrs, name, ps_string_value(value ? value : ""));
}

bool ps_html_attr_clone(ps_value *attrs, const char *name, const ps_value *value)
{
    return value && ps_set(attrs, name, ps_value_clone(value));
}

ps_value *ps_html_appearance_attrs(const char *class_name, const char *style)
{
    ps_value *attrs = ps_object_value();
    if (!attrs || (*class_name && !ps_html_attr_string(attrs, "class", class_name)) ||
        (*style && !ps_html_attr_string(attrs, "style", style))) {
        ps_value_free(attrs);
        return NULL;
    }
    return attrs;
}
