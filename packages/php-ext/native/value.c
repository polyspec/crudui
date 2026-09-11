#include "engine_internal.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

static bool valid_utf8(const uint8_t *input, size_t length)
{
    size_t i = 0;
    while (i < length) {
        uint8_t byte = input[i++];
        if (byte < 0x80) continue;
        size_t continuation;
        uint32_t code;
        if (byte >= 0xc2 && byte <= 0xdf) { continuation = 1; code = byte & 0x1f; }
        else if (byte >= 0xe0 && byte <= 0xef) { continuation = 2; code = byte & 0x0f; }
        else if (byte >= 0xf0 && byte <= 0xf4) { continuation = 3; code = byte & 0x07; }
        else return false;
        if (i + continuation > length) return false;
        for (size_t j = 0; j < continuation; ++j) {
            uint8_t next = input[i++];
            if ((next & 0xc0) != 0x80) return false;
            code = (code << 6) | (next & 0x3f);
        }
        if ((continuation == 2 && code < 0x800) ||
            (continuation == 3 && code < 0x10000) ||
            code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return false;
    }
    return true;
}

static char *copy_bytes(const uint8_t *input, size_t length)
{
    char *copy = malloc(length + 1);
    if (!copy) return NULL;
    if (length) memcpy(copy, input, length);
    copy[length] = '\0';
    return copy;
}

ps_value *ps_value_new(uint8_t kind)
{
    ps_value *value = calloc(1, sizeof(*value));
    if (!value) return NULL;
    value->kind = kind == PS_ARRAY || kind == PS_OBJECT ? kind : PS_NULL;
    return value;
}

void ps_value_free(ps_value *value)
{
    if (!value) return;
    if (value->kind == PS_STRING) free(value->data.string.bytes);
    if (value->kind == PS_ARRAY || value->kind == PS_OBJECT) {
        for (size_t i = 0; i < value->data.children.length; ++i) {
            free(value->data.children.items[i].key);
            ps_value_free(value->data.children.items[i].value);
        }
        free(value->data.children.items);
    }
    free(value);
}

static void clear_value(ps_value *value)
{
    if (value->kind == PS_STRING) free(value->data.string.bytes);
    if (value->kind == PS_ARRAY || value->kind == PS_OBJECT) {
        for (size_t i = 0; i < value->data.children.length; ++i) {
            free(value->data.children.items[i].key);
            ps_value_free(value->data.children.items[i].value);
        }
        free(value->data.children.items);
    }
    memset(&value->data, 0, sizeof(value->data));
}

void ps_value_bool(ps_value *value, bool input)
{
    clear_value(value); value->kind = PS_BOOL; value->data.boolean = input;
}

void ps_value_int(ps_value *value, int64_t input)
{
    clear_value(value); value->kind = PS_INT; value->data.integer = input;
}

bool ps_value_float(ps_value *value, double input)
{
    if (!isfinite(input)) return false;
    clear_value(value); value->kind = PS_FLOAT; value->data.number = input; return true;
}

bool ps_value_string(ps_value *value, const uint8_t *input, size_t length)
{
    if (!valid_utf8(input, length)) return false;
    char *copy = copy_bytes(input, length);
    if (!copy) return false;
    clear_value(value); value->kind = PS_STRING;
    value->data.string.bytes = copy; value->data.string.length = length; return true;
}

static bool reserve(ps_value *value)
{
    if (value->data.children.length < value->data.children.capacity) return true;
    size_t capacity = value->data.children.capacity ? value->data.children.capacity * 2 : 4;
    if (capacity > SIZE_MAX / sizeof(ps_member)) return false;
    ps_member *items = realloc(value->data.children.items, capacity * sizeof(*items));
    if (!items) return false;
    value->data.children.items = items; value->data.children.capacity = capacity; return true;
}

static size_t member_index(const ps_value *object, const char *key, size_t length)
{
    if (!object || object->kind != PS_OBJECT) return SIZE_MAX;
    for (size_t i = 0; i < object->data.children.length; ++i) {
        const ps_member *member = &object->data.children.items[i];
        if (member->key_length == length && !memcmp(member->key, key, length)) return i;
    }
    return SIZE_MAX;
}

bool ps_value_insert(ps_value *parent, const uint8_t *key, size_t length, ps_value *child)
{
    if (!parent || !child) { ps_value_free(child); return false; }
    if (parent->kind == PS_ARRAY && !key) {
        if (!reserve(parent)) { ps_value_free(child); return false; }
        parent->data.children.items[parent->data.children.length++] = (ps_member){NULL, 0, child};
        return true;
    }
    if (parent->kind != PS_OBJECT || !key || !valid_utf8(key, length)) {
        ps_value_free(child); return false;
    }
    size_t index = member_index(parent, (const char *)key, length);
    if (index != SIZE_MAX) {
        ps_value_free(parent->data.children.items[index].value);
        parent->data.children.items[index].value = child;
        return true;
    }
    char *copy = copy_bytes(key, length);
    if (!copy || !reserve(parent)) { free(copy); ps_value_free(child); return false; }
    parent->data.children.items[parent->data.children.length++] = (ps_member){copy, length, child};
    return true;
}

uint8_t ps_value_read(const ps_value *value, int64_t *integer, double *number,
                      const uint8_t **text, size_t *length)
{
    if (!value) return UINT8_MAX;
    switch (value->kind) {
        case PS_BOOL: *integer = value->data.boolean; break;
        case PS_INT: *integer = value->data.integer; break;
        case PS_FLOAT: *number = value->data.number; break;
        case PS_STRING:
            *text = (const uint8_t *)value->data.string.bytes;
            *length = value->data.string.length; break;
        default: break;
    }
    return value->kind;
}

bool ps_value_visit(const ps_value *value, void *context, ps_visitor visitor)
{
    if (!value || (value->kind != PS_ARRAY && value->kind != PS_OBJECT)) return false;
    for (size_t i = 0; i < value->data.children.length; ++i) {
        const ps_member *member = &value->data.children.items[i];
        const uint8_t *key = value->kind == PS_OBJECT ? (const uint8_t *)member->key : NULL;
        if (!visitor(context, key, value->kind == PS_OBJECT ? member->key_length : 0, member->value)) return false;
    }
    return true;
}

ps_value *ps_value_clone(const ps_value *value)
{
    if (!value) return NULL;
    ps_value *copy = ps_value_new(value->kind);
    if (!copy) return NULL;
    switch (value->kind) {
        case PS_BOOL: ps_value_bool(copy, value->data.boolean); break;
        case PS_INT: ps_value_int(copy, value->data.integer); break;
        case PS_FLOAT: if (!ps_value_float(copy, value->data.number)) goto fail; break;
        case PS_STRING:
            if (!ps_value_string(copy, (const uint8_t *)value->data.string.bytes, value->data.string.length)) goto fail;
            break;
        case PS_ARRAY: case PS_OBJECT:
            for (size_t i = 0; i < value->data.children.length; ++i) {
                const ps_member *member = &value->data.children.items[i];
                ps_value *child = ps_value_clone(member->value);
                if (!child || !ps_value_insert(copy, value->kind == PS_OBJECT ? (const uint8_t *)member->key : NULL, member->key_length, child)) goto fail;
            }
            break;
        default: break;
    }
    return copy;
fail:
    ps_value_free(copy); return NULL;
}

const ps_value *ps_get(const ps_value *value, const char *key)
{
    size_t index = member_index(value, key, strlen(key));
    return index == SIZE_MAX ? NULL : value->data.children.items[index].value;
}

ps_value *ps_get_mut(ps_value *value, const char *key)
{
    return (ps_value *)ps_get(value, key);
}

bool ps_has(const ps_value *value, const char *key) { return ps_get(value, key) != NULL; }
size_t ps_size(const ps_value *value) { return value && (value->kind == PS_ARRAY || value->kind == PS_OBJECT) ? value->data.children.length : 0; }
const ps_value *ps_at(const ps_value *value, size_t index) { return index < ps_size(value) ? value->data.children.items[index].value : NULL; }
const char *ps_key_at(const ps_value *value, size_t index) { return value && value->kind == PS_OBJECT && index < ps_size(value) ? value->data.children.items[index].key : NULL; }
bool ps_set(ps_value *object, const char *key, ps_value *value) { return ps_value_insert(object, (const uint8_t *)key, strlen(key), value); }
bool ps_append(ps_value *array, ps_value *value) { return ps_value_insert(array, NULL, 0, value); }

bool ps_delete(ps_value *object, const char *key)
{
    size_t index = member_index(object, key, strlen(key));
    if (index == SIZE_MAX) return false;
    ps_member *member = &object->data.children.items[index];
    free(member->key); ps_value_free(member->value);
    memmove(member, member + 1, (object->data.children.length - index - 1) * sizeof(*member));
    object->data.children.length--; return true;
}

bool ps_equal(const ps_value *left, const ps_value *right)
{
    if (left == right) return true;
    if (!left || !right || left->kind != right->kind) {
        if (left && right && (left->kind == PS_INT || left->kind == PS_FLOAT) &&
            (right->kind == PS_INT || right->kind == PS_FLOAT)) {
            double a = left->kind == PS_INT ? (double)left->data.integer : left->data.number;
            double b = right->kind == PS_INT ? (double)right->data.integer : right->data.number;
            return a == b;
        }
        return false;
    }
    switch (left->kind) {
        case PS_NULL: return true;
        case PS_BOOL: return left->data.boolean == right->data.boolean;
        case PS_INT: return left->data.integer == right->data.integer;
        case PS_FLOAT: return left->data.number == right->data.number;
        case PS_STRING: return left->data.string.length == right->data.string.length && !memcmp(left->data.string.bytes, right->data.string.bytes, left->data.string.length);
        case PS_ARRAY: case PS_OBJECT:
            if (ps_size(left) != ps_size(right)) return false;
            for (size_t i = 0; i < ps_size(left); ++i) {
                if (left->kind == PS_OBJECT && strcmp(ps_key_at(left, i), ps_key_at(right, i))) return false;
                if (!ps_equal(ps_at(left, i), ps_at(right, i))) return false;
            }
            return true;
        default: return false;
    }
}

bool ps_is_string(const ps_value *value, const char *text)
{
    return value && value->kind == PS_STRING && strlen(text) == value->data.string.length &&
        !memcmp(value->data.string.bytes, text, value->data.string.length);
}
const char *ps_string(const ps_value *value) { return value && value->kind == PS_STRING ? value->data.string.bytes : ""; }
bool ps_truthy(const ps_value *value)
{
    if (!value) return false;
    switch (value->kind) {
        case PS_NULL: return false;
        case PS_BOOL: return value->data.boolean;
        case PS_INT: return value->data.integer != 0;
        case PS_FLOAT: return value->data.number != 0;
        case PS_STRING: return value->data.string.length != 0;
        default: return true;
    }
}
