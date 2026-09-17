#ifndef CRUDUI_ENGINE_INTERNAL_H
#define CRUDUI_ENGINE_INTERNAL_H

#include "crudui_engine.h"

#include <string.h>

/*
 * Strings carry their byte length. Every string that can hold user data (keys, values, paths,
 * expressions, messages and markup) is a ps_text or a ps_chars and is read by its length, so a
 * NUL character is an ordinary character. A plain C string is used only for a fixed identifier
 * known when the engine is compiled (a member name, a tag, a message or an error code).
 */

/* Borrowed bytes. */
typedef struct {
    const char *bytes;
    size_t length;
} ps_text;

/* Owned bytes from malloc, followed by one terminating zero that is never read as an end; bytes is
   NULL after an allocation failure. */
typedef struct {
    char *bytes;
    size_t length;
} ps_chars;

/* A fixed C string literal as text. */
#define PS_TEXT(literal) ((ps_text){"" literal, sizeof(literal) - 1})
/* Several texts joined into new memory. */
#define PS_CONCAT(...) \
    ps_concat((const ps_text[]){__VA_ARGS__}, sizeof((const ps_text[]){__VA_ARGS__}) / sizeof(ps_text))

/* A fixed identifier as text; NULL is empty. */
static inline ps_text ps_fixed(const char *identifier)
{
    return (ps_text){identifier ? identifier : "", identifier ? strlen(identifier) : 0};
}

static inline ps_text ps_view(ps_chars owned)
{
    return (ps_text){owned.bytes ? owned.bytes : "", owned.bytes ? owned.length : 0};
}

bool ps_text_equal(ps_text left, ps_text right);
/* Text equal to a fixed identifier. */
bool ps_text_is(ps_text text, const char *identifier);
bool ps_text_starts(ps_text text, const char *prefix);
bool ps_text_ends(ps_text text, const char *suffix);
/* The first position at or after from of a byte or a text, or SIZE_MAX. */
size_t ps_text_find_byte(ps_text text, char byte, size_t from);
size_t ps_text_find(ps_text text, ps_text needle, size_t from);
ps_text ps_text_slice(ps_text text, size_t start, size_t end);
/* Bytewise order of two texts: negative, zero or positive. */
int ps_text_compare(ps_text left, ps_text right);
ps_chars ps_copy(ps_text text);
ps_chars ps_concat(const ps_text *parts, size_t count);
/* Decimal text of an unsigned integer. */
ps_chars ps_decimal(size_t value);

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
/* Members by a fixed identifier. */
const ps_value *ps_get(const ps_value *value, const char *key);
ps_value *ps_get_mut(ps_value *value, const char *key);
bool ps_has(const ps_value *value, const char *key);
bool ps_set(ps_value *object, const char *key, ps_value *value);
/* Members by a text key. */
const ps_value *ps_get_text(const ps_value *value, ps_text key);
ps_value *ps_get_mut_text(ps_value *value, ps_text key);
bool ps_has_text(const ps_value *value, ps_text key);
bool ps_set_text(ps_value *object, ps_text key, ps_value *value);
bool ps_delete_text(ps_value *object, ps_text key);
size_t ps_size(const ps_value *value);
const ps_value *ps_at(const ps_value *value, size_t index);
/* The member name at index of an object; empty text for any other value. */
ps_text ps_key(const ps_value *value, size_t index);
bool ps_append(ps_value *array, ps_value *value);
bool ps_equal(const ps_value *left, const ps_value *right);
bool ps_is_string(const ps_value *value, const char *text);
/*
 * The bytes of a string value; empty text for any other value. The stored bytes are followed by a
 * zero byte, so a C parser such as strtod may start inside them: it stops at the first zero byte,
 * and the caller compares the end it reports with the length.
 */
ps_text ps_string(const ps_value *value);
bool ps_truthy(const ps_value *value);
ps_value *ps_null_value(void);
ps_value *ps_bool_value(bool value);
ps_value *ps_int_value(int64_t value);
ps_value *ps_float_value(double value);
/* A string value of a fixed identifier. */
ps_value *ps_string_value(const char *value);
ps_value *ps_text_value(ps_text value);
/* A string value that takes the owned bytes, which are freed in every case. */
ps_value *ps_chars_value(ps_chars value);
ps_value *ps_array_value(void);
ps_value *ps_object_value(void);
bool ps_replace(ps_value *parent, size_t index, ps_value *value);
const ps_value *ps_path(const ps_value *root, ps_text path);
const ps_value *ps_path_segments(const ps_value *root, const ps_text *segments, size_t length);
ps_chars ps_scalar_string(const ps_value *value);
ps_chars ps_js_string(const ps_value *value);
ps_chars ps_json_string(const ps_value *value);
ps_chars ps_json_quote(ps_text value);
ps_chars ps_join_classes(ps_text first, ps_text second, ps_text third);
ps_chars ps_join_path(ps_text parent, ps_text child);
/* An absent prefix has NULL bytes. */
ps_chars ps_bracket_name(ps_text path, ps_text prefix);
ps_chars ps_rule_name(ps_text path, const size_t *row_segments, size_t row_count);
ps_chars ps_leaf_name(ps_text path, const size_t *row_segments, size_t row_count);
ps_chars ps_control_id(ps_text prefix, ps_text path);
ps_chars ps_translate(const ps_value *value, ps_text language);
ps_chars ps_style_string(ps_text source);
ps_chars ps_format_date(ps_text source, bool datetime);
ps_chars ps_format_date_pattern(ps_text source, ps_text pattern);
/* Path segments as views into path; free the array with free. */
bool ps_path_parts(ps_text path, ps_text **parts, size_t *length);
bool ps_condition_expression(ps_text value);

bool ps_html_bytes(ps_html_buffer *out, const char *value, size_t length);
bool ps_html_append(ps_html_buffer *out, ps_text value);
/* Fixed markup. */
bool ps_html_text(ps_html_buffer *out, const char *value);
bool ps_html_character(ps_html_buffer *out, char value);
ps_chars ps_html_take(ps_html_buffer *out);
ps_value *ps_html_value(ps_html_buffer *out);
bool ps_html_escaped(ps_html_buffer *out, ps_text value, bool raw);
bool ps_html_raw_text(ps_html_buffer *out, ps_text value);
bool ps_html_void_tag(ps_text tag);
bool ps_html_start_element(ps_html_buffer *out, ps_text tag,
                           const ps_value *attrs, bool raw, bool style_last);
bool ps_html_end_element(ps_html_buffer *out, ps_text tag);
bool ps_html_attr_string(ps_value *attrs, const char *name, const char *value);
bool ps_html_attr_text(ps_value *attrs, const char *name, ps_text value);
bool ps_html_attr_clone(ps_value *attrs, const char *name, const ps_value *value);
ps_value *ps_html_appearance_attrs(ps_text class_name, ps_text style);

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
const ps_form_messages *ps_form_messages_for(ps_text language);
/* Replace the first {count} in a counted message. */
ps_chars ps_format_count(const char *template, size_t count);

ps_value *ps_design(const ps_value *design, const ps_value *data, ps_text path);
bool ps_widget_supported(ps_text type);
/* An absent key prefix has NULL bytes. */
ps_value *ps_widget(const ps_value *spec, const ps_value *value, bool value_present,
                    ps_text path, const ps_value *design, ps_text key_prefix,
                    ps_text id_prefix, ps_text language,
                    const size_t *row_segments, size_t row_count);
ps_chars ps_render_fields(const ps_value *fields);
/* Evaluate the template buttons for a record: type, tag, text and attrs in output order. */
ps_value *ps_bind_buttons(const ps_value *template, const ps_value *data, ps_text language);
/* Form markup: the field body, then the footer controls group holding the buttons. */
ps_chars ps_render_form(const ps_value *fields, const ps_value *buttons, const char *actions_label);
/* Every interface text as an object keyed by message name. */
ps_value *ps_form_messages_value(const ps_form_messages *messages);

ps_value *ps_expression_value(ps_text expression, const ps_value *data,
                              const ps_text *current_path, size_t path_length,
                              bool *parsed);
bool ps_expression_truth(ps_text expression, const ps_value *data,
                         const ps_text *current_path, size_t path_length,
                         bool *parsed);
ps_value *ps_condition_value(const ps_value *map, const ps_value *data,
                             const ps_text *current_path, size_t path_length);

/*
 * The pattern and match validation rule, implemented by the host: 1 when the value passes the
 * rule with this parameter, 0 when it fails, -1 when the host raised an error that ends the
 * validation.
 */
int ps_pattern_rule(const ps_value *value, const ps_value *parameter);

ps_result ps_ok(ps_value *value);
/* Errors with fixed text. */
ps_result ps_fail(const char *kind, const char *code, const char *message,
                  const char *at);
ps_value *ps_error(const char *kind, const char *code, const char *message,
                   const char *at, const ps_value *trace);
/* Errors whose message or location holds user data. */
ps_result ps_fail_text(const char *kind, const char *code, ps_text message, ps_text at);
ps_value *ps_error_text(const char *kind, const char *code, ps_text message,
                        ps_text at, const ps_value *trace);

/*
 * Declaration checks (declaration.c). Each returns false with *error set to an INVALID_FORM_INPUT
 * error at "", or with *error NULL when allocation fails.
 * ps_declaration_error: "Invalid <key> at <path>: expected <expected>".
 * ps_known_keys: the first member of a closed bucket that is not allowed,
 * "Invalid <name>.<key> at <path>: unknown key".
 * ps_design_declaration_valid: the design declaration rules of a form field, a list or detail
 * specification, or a list column or detail field.
 */
bool ps_declaration_error(ps_text key, ps_text path, const char *expected, ps_value **error);
bool ps_known_keys(const ps_value *bucket, const char *name, const char *const *allowed,
                   size_t count, ps_text path, ps_value **error);
bool ps_design_declaration_valid(const ps_value *design, ps_text path, ps_value **error);

ps_value *ps_compose_properties(const ps_value *properties, const ps_value *files,
                                ps_text basepath, ps_value **error);
ps_value *ps_compose_spec(const ps_value *spec, const ps_value *files,
                          ps_text basepath, ps_value **error);

#endif
