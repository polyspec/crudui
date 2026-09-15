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

typedef struct {
    char *data;
    size_t length;
    size_t capacity;
    bool failed;
} ps_html_buffer;

ps_value *ps_value_clone(const ps_value *value);
/*
 * Specification member order: every object lists array index names (canonical decimal integers
 * from 0 to 4294967294) first in ascending numeric order, then all other names in insertion
 * order. ps_value_order reorders an owned value in place and ps_value_ordered returns an ordered
 * copy; both return false or NULL only on allocation failure.
 */
bool ps_value_order(ps_value *value);
ps_value *ps_value_ordered(const ps_value *value);
/*
 * Copy a specification (or template) in member order and, when ordered_options is given, copy the
 * options with only options.files in member order; record data keeps its order. NULL inputs stay
 * NULL. Returns false only on allocation failure.
 */
bool ps_order_specification(const ps_value *spec, const ps_value *options,
                            ps_value **ordered_spec, ps_value **ordered_options);
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
char *ps_format_date_pattern(const char *source, const char *pattern);
bool ps_path_parts(const char *path, char ***parts, size_t *length);
void ps_path_parts_free(char **parts, size_t length);
bool ps_condition_expression(const char *value);

bool ps_html_bytes(ps_html_buffer *out, const char *value, size_t length);
bool ps_html_text(ps_html_buffer *out, const char *value);
bool ps_html_character(ps_html_buffer *out, char value);
char *ps_html_take(ps_html_buffer *out);
ps_value *ps_html_value(ps_html_buffer *out);
bool ps_html_escaped(ps_html_buffer *out, const char *value, size_t length, bool raw);
bool ps_html_raw_text(ps_html_buffer *out, const char *value, size_t length);
bool ps_html_void_tag(const char *tag);
bool ps_html_start_element(ps_html_buffer *out, const char *tag,
                           const ps_value *attrs, bool raw, bool style_last);
bool ps_html_end_element(ps_html_buffer *out, const char *tag);
bool ps_html_attr_string(ps_value *attrs, const char *name, const char *value);
bool ps_html_attr_clone(ps_value *attrs, const char *name, const ps_value *value);
ps_value *ps_html_appearance_attrs(const char *class_name, const char *style);

/* Interface labels for row, collection and form controls; {count} is replaced by a number. */
typedef struct {
    const char *move_up;
    const char *move_down;
    const char *add_row;
    const char *copy_row;
    const char *remove_row;
    const char *toggle_row;
    const char *expand_all;
    const char *collapse_all;
    const char *undo;
    const char *row_controls;
    const char *collection_controls;
    const char *form_controls;
    const char *form_actions;
    const char *submit;
    const char *reset;
    const char *outline;
    const char *data;
    const char *untitled;
    const char *collapsed;
    const char *count;
    const char *children;
} ps_form_messages;

/* Interface text for a supported language (ko, en, ja, zh), or NULL. */
const ps_form_messages *ps_form_messages_for(const char *language);
/* Replace the first {count} in a counted message. */
char *ps_format_count(const char *template, size_t count);

ps_value *ps_design(const ps_value *design, const ps_value *data, const char *path);
bool ps_widget_supported(const char *type);
ps_value *ps_widget(const ps_value *spec, const ps_value *value, bool value_present,
                    const char *path, const ps_value *design, const char *key_prefix,
                    const char *id_prefix, const char *language,
                    const size_t *row_segments, size_t row_count);
char *ps_render_fields(const ps_value *fields);
/* Evaluate the template buttons for a record: type, tag, text and attrs in output order. */
ps_value *ps_bind_buttons(const ps_value *template, const ps_value *data, const char *language);
/* Form markup: the field body, then the footer controls group holding the buttons. */
char *ps_render_form(const ps_value *fields, const ps_value *buttons, const char *actions_label);
/* Every interface text as an object keyed by message name. */
ps_value *ps_form_messages_value(const ps_form_messages *messages);

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

/*
 * Declaration checks (declaration.c). Each returns false with *error set to an INVALID_FORM_INPUT
 * error at "", or with *error NULL when allocation fails.
 * ps_declaration_error: "Invalid <key> at <path>: expected <expected>".
 * ps_known_keys: the first member of a closed bucket that is not allowed,
 * "Invalid <name>.<key> at <path>: unknown key".
 * ps_design_declaration_valid: the design declaration rules of a form field, a list or detail
 * specification, or a list column or detail field.
 */
bool ps_declaration_error(const char *key, const char *path, const char *expected, ps_value **error);
bool ps_known_keys(const ps_value *bucket, const char *name, const char *const *allowed,
                   size_t count, const char *path, ps_value **error);
bool ps_design_declaration_valid(const ps_value *design, const char *path, ps_value **error);

ps_value *ps_compose_properties(const ps_value *properties, const ps_value *files,
                                const char *basepath, ps_value **error);
ps_value *ps_compose_spec(const ps_value *spec, const ps_value *files,
                          const char *basepath, ps_value **error);

#endif
