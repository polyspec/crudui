#ifndef CRUDUI_ENGINE_INTERNAL_H
#define CRUDUI_ENGINE_INTERNAL_H

#include "crudui_engine.h"

typedef struct {
    char *key;
    size_t key_length;
    ps_value *value;
} ps_member;

struct ps_value {
    uint8_t kind;
    union {
        bool boolean;
        int64_t integer;
        double number;
        struct { char *bytes; size_t length; } string;
        struct { ps_member *items; size_t length; size_t capacity; } children;
    } data;
};

ps_value *ps_value_clone(const ps_value *value);
const ps_value *ps_get(const ps_value *value, const char *key);
ps_value *ps_get_mut(ps_value *value, const char *key);
bool ps_has(const ps_value *value, const char *key);
size_t ps_size(const ps_value *value);
const ps_value *ps_at(const ps_value *value, size_t index);
const char *ps_key_at(const ps_value *value, size_t index);
bool ps_set(ps_value *object, const char *key, ps_value *value);
bool ps_append(ps_value *array, ps_value *value);
bool ps_delete(ps_value *object, const char *key);
bool ps_equal(const ps_value *left, const ps_value *right);
bool ps_is_string(const ps_value *value, const char *text);
const char *ps_string(const ps_value *value);
bool ps_truthy(const ps_value *value);

ps_result ps_ok(ps_value *value);
ps_result ps_fail(const char *kind, const char *code, const char *message,
                  const char *at);

#endif
