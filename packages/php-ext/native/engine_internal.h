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
ps_value *ps_null_value(void);
ps_value *ps_bool_value(bool value);
ps_value *ps_int_value(int64_t value);
ps_value *ps_float_value(double value);
ps_value *ps_string_value(const char *value);
ps_value *ps_array_value(void);
ps_value *ps_object_value(void);
bool ps_replace(ps_value *parent, size_t index, ps_value *value);
const ps_value *ps_path(const ps_value *root, const char *path);
const ps_value *ps_path_segments(const ps_value *root, const char *const *segments,
                                 size_t length);
char *ps_scalar_string(const ps_value *value);
char *ps_js_string(const ps_value *value);
char *ps_json_string(const ps_value *value);
char *ps_json_quote(const char *value);
char *ps_string_join(const char *left, const char *middle, const char *right);
char *ps_join_classes(const char *first, const char *second, const char *third);
char *ps_join_path(const char *parent, const char *child);
char *ps_bracket_name(const char *path, const char *prefix);
char *ps_rule_name(const char *path, const size_t *row_segments, size_t row_count);
char *ps_leaf_name(const char *path, const size_t *row_segments, size_t row_count);
char *ps_element_id(const char *prefix, const char *path);
char *ps_control_id(const char *prefix, const char *path);
char *ps_translate(const ps_value *value, const char *language);
char *ps_style_string(const char *source);
char *ps_format_date(const char *source, bool datetime);
char **ps_path_parts(const char *path, size_t *length);
void ps_path_parts_free(char **parts, size_t length);
const char *ps_position(const char *segment);
bool ps_condition_expression(const char *value);

ps_value *ps_design(const ps_value *design, const ps_value *data, const char *path);
ps_value *ps_widget(const ps_value *spec, const ps_value *value, bool value_present,
                    const char *path, const ps_value *design, const char *key_prefix,
                    const char *id_prefix, const char *language,
                    const size_t *row_segments, size_t row_count);

ps_value *ps_expression_value(const char *expression, const ps_value *data,
                              const char *const *current_path, size_t path_length,
                              bool *parsed);
bool ps_expression_truth(const char *expression, const ps_value *data,
                         const char *const *current_path, size_t path_length,
                         bool *parsed);
ps_value *ps_condition_value(const ps_value *map, const ps_value *data,
                             const char *const *current_path, size_t path_length);

ps_result ps_ok(ps_value *value);
ps_result ps_fail(const char *kind, const char *code, const char *message,
                  const char *at);
ps_value *ps_error(const char *kind, const char *code, const char *message,
                   const char *at, const ps_value *trace);

ps_value *ps_compose_properties(const ps_value *properties, const ps_value *files,
                                const char *basepath, ps_value **error);
ps_value *ps_compose_spec(const ps_value *spec, const ps_value *files,
                          const char *basepath, ps_value **error);

#endif
