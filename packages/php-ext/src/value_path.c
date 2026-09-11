#include "engine_internal.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const ps_value *segment(const ps_value *value, const char *key, size_t length)
{
    if (!value) return NULL;
    if (value->kind == PS_OBJECT) {
        for (size_t i = 0; i < ps_size(value); ++i)
            if (strlen(ps_key_at(value, i)) == length && !memcmp(ps_key_at(value, i), key, length))
                return ps_at(value, i);
    } else if (value->kind == PS_ARRAY) {
        if (length > 1 && key[0] == '#') { key++; length--; }
        if (!length) return NULL;
        size_t index = 0;
        for (size_t i = 0; i < length; ++i) {
            if (key[i] < '0' || key[i] > '9' || index > (SIZE_MAX - 9) / 10) return NULL;
            index = index * 10 + (size_t)(key[i] - '0');
        }
        return ps_at(value, index);
    }
    return NULL;
}

const ps_value *ps_path(const ps_value *root, const char *path)
{
    if (!path) return NULL;
    const ps_value *value = root;
    const char *start = path;
    bool bracket = false;
    for (const char *cursor = path;; ++cursor) {
        char c = *cursor;
        bool boundary = !c || (!bracket && (c == '.' || c == '[')) || (bracket && c == ']');
        if (boundary && cursor > start) {
            value = segment(value, start, (size_t)(cursor - start));
            if (!value) return NULL;
        }
        if (!c) break;
        if (!bracket && c == '[') { bracket = true; start = cursor + 1; }
        else if (bracket && c == ']') { bracket = false; start = cursor + 1; }
        else if (!bracket && c == '.') start = cursor + 1;
    }
    return value;
}

const ps_value *ps_path_segments(const ps_value *root, const char *const *segments,
                                 size_t length)
{
    if (!segments && length) return NULL;
    const ps_value *value = root;
    for (size_t i = 0; i < length; ++i) {
        if (!segments[i]) return NULL;
        value = segment(value, segments[i], strlen(segments[i]));
        if (!value) return NULL;
    }
    return value;
}

static char *copy_text(const char *text)
{
    char *copy = malloc(strlen(text) + 1);
    if (copy) strcpy(copy, text);
    return copy;
}

char *ps_scalar_string(const ps_value *value)
{
    if (!value || value->kind == PS_NULL || value->kind == PS_ARRAY || value->kind == PS_OBJECT)
        return copy_text("");
    if (value->kind == PS_STRING) return copy_text(ps_string(value));
    if (value->kind == PS_BOOL) return copy_text(value->data.boolean ? "1" : "");
    char buffer[64];
    if (value->kind == PS_INT) snprintf(buffer, sizeof(buffer), "%lld", (long long)value->data.integer);
    else snprintf(buffer, sizeof(buffer), "%.15g", value->data.number);
    return copy_text(buffer);
}

char *ps_js_string(const ps_value *value)
{
    if (!value) return copy_text("undefined");
    if (value->kind == PS_NULL) return copy_text("null");
    if (value->kind == PS_BOOL) return copy_text(value->data.boolean ? "true" : "false");
    if (value->kind == PS_OBJECT) return copy_text("[object Object]");
    if (value->kind != PS_ARRAY) return ps_scalar_string(value);
    size_t count = ps_size(value);
    size_t length = 1;
    char **items = calloc(count, sizeof(*items));
    if (!items && count) return NULL;
    for (size_t i = 0; i < count; ++i) {
        const ps_value *item = ps_at(value, i);
        items[i] = item && item->kind != PS_NULL ? ps_js_string(item) : copy_text("");
        if (!items[i]) goto fail;
        length += strlen(items[i]) + (i ? 1 : 0);
    }
    char *out = calloc(length, 1);
    if (!out) goto fail;
    for (size_t i = 0; i < count; ++i) {
        if (i) strcat(out, ",");
        strcat(out, items[i]);
        free(items[i]);
    }
    free(items); return out;
fail:
    for (size_t i = 0; i < count; ++i) free(items[i]);
    free(items); return NULL;
}
