#include "engine_internal.h"

#include <ctype.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct ps_form {
    ps_value *template;
    ps_value *data;
    ps_value *fields;
    ps_value *options;
    int64_t revision;
};

typedef struct {
    char **items;
    size_t length;
} form_path;

static const ps_value *member(const ps_value *object, const char *key)
{
    return object && object->kind == PS_OBJECT ? ps_get(object, key) : NULL;
}

static ps_value *internal_error(void)
{
    return ps_error("internal", "INTERNAL_ERROR", "C form operation failed", "", NULL);
}

static ps_value *input_error(const char *message)
{
    return ps_error("form", "INVALID_FORM_INPUT", message, "", NULL);
}

static ps_value *input_error_format(const char *format, ...)
{
    va_list arguments;
    va_start(arguments, format);
    va_list copy;
    va_copy(copy, arguments);
    int length = vsnprintf(NULL, 0, format, copy);
    va_end(copy);
    if (length < 0) {
        va_end(arguments);
        return internal_error();
    }
    char *message = malloc((size_t)length + 1);
    if (!message) {
        va_end(arguments);
        return internal_error();
    }
    vsnprintf(message, (size_t)length + 1, format, arguments);
    va_end(arguments);
    ps_value *error = input_error(message);
    free(message);
    return error;
}

static bool field_repeats(const ps_value *field)
{
    const ps_value *multiple = member(member(field, "spec"), "multiple");
    return multiple && ((multiple->kind == PS_BOOL && multiple->data.boolean) ||
                        multiple->kind == PS_OBJECT);
}

static bool field_group(const ps_value *field)
{
    return ps_is_string(member(member(field, "spec"), "type"), "group");
}

static bool valid_key(const char *key)
{
    if (!key || !*key || !strcmp(key, "__proto__") || !strcmp(key, "prototype") ||
        !strcmp(key, "constructor")) return false;
    bool digits = true;
    for (const unsigned char *cursor = (const unsigned char *)key; *cursor; ++cursor) {
        if (!isalnum(*cursor) && *cursor != '_' && *cursor != '-') return false;
        if (!isdigit(*cursor)) digits = false;
    }
    return !digits;
}

static ps_value *checked_key_error(const char *key)
{
    return valid_key(key) ? NULL : input_error_format(
        "Invalid row key: %s; use sequenceRowKey for numeric ids", key ? key : "");
}

static ps_value *fresh_key(const ps_value *used, ps_value **error)
{
    for (size_t attempt = 0; attempt < 100; ++attempt) {
        ps_result result = ps_create_key();
        if (result.error) {
            *error = result.error;
            return NULL;
        }
        if (result.value && result.value->kind == PS_STRING &&
            !ps_has(used, ps_string(result.value))) return result.value;
        ps_value_free(result.value);
    }
    *error = input_error("Unable to generate an unused row key");
    return NULL;
}

static ps_value *normalize_fields(const ps_value *fields, const ps_value *value,
                                  ps_value **error);

static ps_value *normalize_row(const ps_value *field, const ps_value *value,
                               ps_value **error)
{
    if (field_group(field))
        return normalize_fields(member(field, "children"), value, error);
    if (value) return ps_value_clone(value);
    const ps_value *fallback = member(member(field, "spec"), "default");
    return fallback ? ps_value_clone(fallback) : ps_string_value("");
}

static ps_value *normalize_fields(const ps_value *fields, const ps_value *value,
                                  ps_value **error)
{
    if (!fields || fields->kind != PS_ARRAY) {
        *error = input_error("Unsupported form template");
        return NULL;
    }
    if (value && value->kind != PS_OBJECT) {
        *error = input_error("Group data must be an object");
        return NULL;
    }
    ps_value *data = value ? ps_value_clone(value) : ps_object_value();
    if (!data) {
        *error = internal_error();
        return NULL;
    }
    for (size_t index = 0; index < ps_size(fields); ++index) {
        const ps_value *field = ps_at(fields, index);
        const ps_value *name_value = member(field, "name");
        if (!name_value || name_value->kind != PS_STRING) {
            *error = input_error("Unsupported form template");
            goto fail;
        }
        const char *name = ps_string(name_value);
        const ps_value *raw = ps_get(data, name);
        ps_value *normalized = NULL;
        if (field_repeats(field)) {
            if (raw && raw->kind != PS_OBJECT) {
                *error = input_error_format(
                    "Repeated data must be a keyed object: %s", name);
                goto fail;
            }
            ps_value *rows = ps_object_value();
            if (!rows) {
                *error = internal_error();
                goto fail;
            }
            if (!raw) {
                ps_value *key = fresh_key(rows, error);
                ps_value *row = key ? normalize_row(field, NULL, error) : NULL;
                if (!key || !row || !ps_set(rows, ps_string(key), row)) {
                    ps_value_free(key);
                    ps_value_free(rows);
                    if (!*error) *error = internal_error();
                    goto fail;
                }
                ps_value_free(key);
            } else {
                for (size_t row_index = 0; row_index < ps_size(raw); ++row_index) {
                    const char *key = ps_key_at(raw, row_index);
                    *error = checked_key_error(key);
                    if (*error) {
                        ps_value_free(rows);
                        goto fail;
                    }
                    ps_value *row = normalize_row(field, ps_at(raw, row_index), error);
                    if (!row || !ps_set(rows, key, row)) {
                        ps_value_free(rows);
                        if (!*error) *error = internal_error();
                        goto fail;
                    }
                }
            }
            normalized = rows;
        } else if (field_group(field)) {
            normalized = normalize_fields(member(field, "children"), raw, error);
        } else if (!raw) {
            const ps_value *fallback = member(member(field, "spec"), "default");
            if (fallback) normalized = ps_value_clone(fallback);
            else continue;
        } else {
            continue;
        }
        if (!normalized || !ps_set(data, name, normalized)) {
            if (!*error) *error = internal_error();
            goto fail;
        }
    }
    return data;
fail:
    ps_value_free(data);
    return NULL;
}

static form_path checked_path(const char *path, ps_value **error)
{
    form_path result = {0};
    if (!ps_path_parts(path ? path : "", &result.items, &result.length) ||
        !result.length) {
        ps_path_parts_free(result.items, result.length);
        result = (form_path){0};
        *error = input_error_format("Invalid form path: %s", path ? path : "");
        return result;
    }
    for (size_t index = 0; index < result.length; ++index) {
        if (!strcmp(result.items[index], "__proto__") ||
            !strcmp(result.items[index], "prototype") ||
            !strcmp(result.items[index], "constructor")) {
            ps_path_parts_free(result.items, result.length);
            result = (form_path){0};
            *error = input_error_format("Invalid form path: %s", path ? path : "");
            return result;
        }
    }
    return result;
}

static void free_path(form_path *path)
{
    ps_path_parts_free(path->items, path->length);
    *path = (form_path){0};
}

static ps_value *put_at(const ps_value *current, char *const *path, size_t length,
                        const ps_value *value)
{
    if (!length) return NULL;
    ps_value *object = current && current->kind == PS_OBJECT
        ? ps_value_clone(current) : ps_object_value();
    if (!object) return NULL;
    ps_value *next = length == 1
        ? ps_value_clone(value)
        : put_at(member(current, path[0]), path + 1, length - 1, value);
    if (!next || !ps_set(object, path[0], next)) {
        ps_value_free(object);
        return NULL;
    }
    return object;
}

static const ps_value *find_field(const ps_value *fields, const char *name)
{
    if (!fields || fields->kind != PS_ARRAY) return NULL;
    for (size_t index = 0; index < ps_size(fields); ++index) {
        const ps_value *field = ps_at(fields, index);
        if (ps_is_string(member(field, "name"), name)) return field;
    }
    return NULL;
}

static bool collection(const ps_form *form, const char *source, form_path *path,
                       const ps_value **field, const ps_value **rows, ps_value **error)
{
    *path = checked_path(source, error);
    if (*error) return false;
    const ps_value *fields = member(form->template, "fields");
    const ps_value *selected = NULL;
    for (size_t index = 0; index < path->length; ++index) {
        selected = find_field(fields, path->items[index]);
        if (!selected) {
            *error = input_error_format("Unknown collection: %s", source);
            free_path(path);
            return false;
        }
        if (index + 1 == path->length) break;
        if (field_repeats(selected)) ++index;
        fields = member(selected, "children");
        selected = NULL;
    }
    const ps_value *data = ps_path_segments(form->data,
        (const char *const *)path->items, path->length);
    if (!selected || !field_repeats(selected) || !data || data->kind != PS_OBJECT) {
        *error = input_error_format("Not a keyed collection: %s", source);
        free_path(path);
        return false;
    }
    *field = selected;
    *rows = data;
    return true;
}

static ps_result commit(ps_form *form, ps_value *data)
{
    ps_result binding = ps_bind_form(form->template, data, form->options);
    if (binding.error) {
        ps_value_free(data);
        return binding;
    }
    if (!binding.value) {
        ps_value_free(data);
        return (ps_result){NULL, internal_error()};
    }
    ps_value_free(form->data);
    ps_value_free(form->fields);
    form->data = data;
    form->fields = binding.value;
    form->revision++;
    return ps_ok(ps_null_value());
}

static ps_result replace_data(ps_form *form, const ps_value *value)
{
    ps_value *error = NULL;
    ps_value *data = normalize_fields(member(form->template, "fields"), value, &error);
    if (!data) return (ps_result){NULL, error ? error : internal_error()};
    return commit(form, data);
}

static ps_value *copy_row_value(const ps_value *field, const ps_value *value,
                                ps_value **error)
{
    if (!field_group(field)) return ps_value_clone(value);
    if (!value || value->kind != PS_OBJECT) {
        *error = input_error("Group data must be an object");
        return NULL;
    }
    ps_value *row = ps_value_clone(value);
    const ps_value *children = member(field, "children");
    if (!row || !children || children->kind != PS_ARRAY) {
        ps_value_free(row);
        *error = internal_error();
        return NULL;
    }
    for (size_t index = 0; index < ps_size(children); ++index) {
        const ps_value *child = ps_at(children, index);
        const ps_value *name_value = member(child, "name");
        if (!name_value || name_value->kind != PS_STRING) continue;
        const char *name = ps_string(name_value);
        const ps_value *raw = ps_get(row, name);
        if (!raw || raw->kind != PS_OBJECT) continue;
        if (field_repeats(child)) {
            ps_value *used = ps_value_clone(raw);
            ps_value *copied = ps_object_value();
            if (!used || !copied) {
                ps_value_free(used);
                ps_value_free(copied);
                ps_value_free(row);
                *error = internal_error();
                return NULL;
            }
            for (size_t row_index = 0; row_index < ps_size(raw); ++row_index) {
                ps_value *key = fresh_key(used, error);
                ps_value *item = key
                    ? copy_row_value(child, ps_at(raw, row_index), error) : NULL;
                if (!key || !item || !ps_set(copied, ps_string(key), item) ||
                    !ps_set(used, ps_string(key), ps_null_value())) {
                    ps_value_free(key);
                    ps_value_free(used);
                    ps_value_free(copied);
                    ps_value_free(row);
                    if (!*error) *error = internal_error();
                    return NULL;
                }
                ps_value_free(key);
            }
            ps_value_free(used);
            if (!ps_set(row, name, copied)) {
                ps_value_free(row);
                *error = internal_error();
                return NULL;
            }
        } else if (field_group(child)) {
            ps_value *copied = copy_row_value(child, raw, error);
            if (!copied || !ps_set(row, name, copied)) {
                ps_value_free(row);
                if (!*error) *error = internal_error();
                return NULL;
            }
        }
    }
    return row;
}

static double numeric_setting(const ps_value *field, const char *name, bool *present)
{
    const ps_value *multiple = member(member(field, "spec"), "multiple");
    const ps_value *value = member(multiple, name);
    if (value && value->kind == PS_INT) {
        *present = true;
        return (double)value->data.integer;
    }
    if (value && value->kind == PS_FLOAT) {
        *present = true;
        return value->data.number;
    }
    *present = false;
    return 0;
}

static ps_value *object_with_insert(const ps_value *rows, const char *key,
                                    ps_value *value, size_t at)
{
    ps_value *output = ps_object_value();
    if (!output) {
        ps_value_free(value);
        return NULL;
    }
    for (size_t index = 0; index <= ps_size(rows); ++index) {
        if (index == at) {
            if (!ps_set(output, key, value)) {
                ps_value_free(output);
                return NULL;
            }
            value = NULL;
        }
        if (index < ps_size(rows) &&
            !ps_set(output, ps_key_at(rows, index), ps_value_clone(ps_at(rows, index)))) {
            ps_value_free(value);
            ps_value_free(output);
            return NULL;
        }
    }
    return output;
}

static ps_result add_row(ps_form *form, const char *source, const ps_value *options)
{
    if (!options || options->kind != PS_OBJECT)
        return (ps_result){NULL, input_error("Row options must be an object")};
    form_path path = {0};
    const ps_value *field = NULL, *rows = NULL;
    ps_value *error = NULL;
    if (!collection(form, source, &path, &field, &rows, &error))
        return (ps_result){NULL, error};
    bool has_max = false;
    double maximum = numeric_setting(field, "max", &has_max);
    if (has_max && (double)ps_size(rows) >= maximum) {
        free_path(&path);
        return (ps_result){NULL, input_error_format("Maximum row count reached: %s", source)};
    }
    const ps_value *requested = member(options, "key");
    ps_value *key = NULL;
    if (!requested || requested->kind == PS_NULL) key = fresh_key(rows, &error);
    else if (requested->kind == PS_STRING) key = ps_value_clone(requested);
    else error = input_error("A row key must be a string");
    if (!key) {
        free_path(&path);
        return (ps_result){NULL, error ? error : internal_error()};
    }
    error = checked_key_error(ps_string(key));
    if (error || ps_has(rows, ps_string(key))) {
        if (!error) error = input_error_format("Row key already exists: %s", ps_string(key));
        ps_value_free(key);
        free_path(&path);
        return (ps_result){NULL, error};
    }
    size_t at = ps_size(rows);
    const ps_value *after = member(options, "afterKey");
    if (after && after->kind != PS_NULL) {
        if (after->kind != PS_STRING) error = input_error("afterKey must be a string");
        else {
            at = SIZE_MAX;
            for (size_t index = 0; index < ps_size(rows); ++index)
                if (!strcmp(ps_key_at(rows, index), ps_string(after))) { at = index + 1; break; }
            if (at == SIZE_MAX)
                error = input_error_format("Unknown row: %s", ps_string(after));
        }
    }
    const ps_value *source_value = ps_has(options, "value") ? member(options, "value") : NULL;
    ps_value *row = error ? NULL : normalize_row(field, source_value, &error);
    ps_value *next_rows = row
        ? object_with_insert(rows, ps_string(key), row, at) : NULL;
    ps_value *data = next_rows
        ? put_at(form->data, path.items, path.length, next_rows) : NULL;
    ps_value_free(next_rows);
    free_path(&path);
    if (!data) {
        ps_value_free(key);
        return (ps_result){NULL, error ? error : internal_error()};
    }
    ps_result result = commit(form, data);
    if (result.error) {
        ps_value_free(key);
        return result;
    }
    ps_value_free(result.value);
    return ps_ok(key);
}

static ps_result copy_row(ps_form *form, const char *source, const char *key,
                          const ps_value *options)
{
    if (!options || options->kind != PS_OBJECT)
        return (ps_result){NULL, input_error("Row options must be an object")};
    form_path path = {0};
    const ps_value *field = NULL, *rows = NULL;
    ps_value *error = NULL;
    if (!collection(form, source, &path, &field, &rows, &error))
        return (ps_result){NULL, error};
    const ps_value *value = ps_get(rows, key);
    if (!value) {
        free_path(&path);
        return (ps_result){NULL, input_error_format("Unknown row: %s", key)};
    }
    ps_value *copied = copy_row_value(field, value, &error);
    ps_value *next_options = ps_value_clone(options);
    if (!copied || !next_options || !ps_set(next_options, "value", copied) ||
        ((!member(next_options, "afterKey") || member(next_options, "afterKey")->kind == PS_NULL) &&
         !ps_set(next_options, "afterKey", ps_string_value(key)))) {
        ps_value_free(next_options);
        free_path(&path);
        return (ps_result){NULL, error ? error : internal_error()};
    }
    free_path(&path);
    ps_result result = add_row(form, source, next_options);
    ps_value_free(next_options);
    return result;
}

static ps_result remove_row(ps_form *form, const char *source, const char *key)
{
    form_path path = {0};
    const ps_value *field = NULL, *rows = NULL;
    ps_value *error = NULL;
    if (!collection(form, source, &path, &field, &rows, &error))
        return (ps_result){NULL, error};
    if (!ps_has(rows, key)) {
        free_path(&path);
        return (ps_result){NULL, input_error_format("Unknown row: %s", key)};
    }
    bool has_min = false;
    double minimum = numeric_setting(field, "min", &has_min);
    if (has_min && (double)ps_size(rows) <= minimum) {
        free_path(&path);
        return (ps_result){NULL, input_error_format("Minimum row count reached: %s", source)};
    }
    ps_value *next_rows = ps_value_clone(rows);
    if (!next_rows || !ps_delete(next_rows, key)) {
        ps_value_free(next_rows);
        free_path(&path);
        return (ps_result){NULL, internal_error()};
    }
    ps_value *data = put_at(form->data, path.items, path.length, next_rows);
    ps_value_free(next_rows);
    free_path(&path);
    return data ? commit(form, data) : (ps_result){NULL, internal_error()};
}

static ps_value *reordered_rows(const ps_value *rows, size_t from, size_t to)
{
    ps_value *output = ps_object_value();
    if (!output) return NULL;
    for (size_t target = 0; target < ps_size(rows); ++target) {
        size_t source;
        if (target == to) source = from;
        else if (from < to && target >= from && target < to) source = target + 1;
        else if (from > to && target > to && target <= from) source = target - 1;
        else source = target;
        if (!ps_set(output, ps_key_at(rows, source), ps_value_clone(ps_at(rows, source)))) {
            ps_value_free(output);
            return NULL;
        }
    }
    return output;
}

static ps_result move_row(ps_form *form, const char *source, const char *key,
                          int64_t position)
{
    form_path path = {0};
    const ps_value *field = NULL, *rows = NULL;
    ps_value *error = NULL;
    if (!collection(form, source, &path, &field, &rows, &error))
        return (ps_result){NULL, error};
    (void)field;
    size_t from = SIZE_MAX;
    for (size_t index = 0; index < ps_size(rows); ++index)
        if (!strcmp(ps_key_at(rows, index), key)) { from = index; break; }
    if (from == SIZE_MAX) {
        free_path(&path);
        return (ps_result){NULL, input_error_format("Unknown row: %s", key)};
    }
    if (position < 0 || (uint64_t)position >= ps_size(rows)) {
        free_path(&path);
        return (ps_result){NULL, input_error_format(
            "Invalid row position: %lld", (long long)position)};
    }
    if (from == (size_t)position) {
        free_path(&path);
        return ps_ok(ps_null_value());
    }
    ps_value *next_rows = reordered_rows(rows, from, (size_t)position);
    ps_value *data = next_rows
        ? put_at(form->data, path.items, path.length, next_rows) : NULL;
    ps_value_free(next_rows);
    free_path(&path);
    return data ? commit(form, data) : (ps_result){NULL, internal_error()};
}

static ps_result rekey_row(ps_form *form, const char *source, const char *old_key,
                           const char *new_key)
{
    ps_value *error = checked_key_error(new_key);
    if (error) return (ps_result){NULL, error};
    form_path path = {0};
    const ps_value *field = NULL, *rows = NULL;
    if (!collection(form, source, &path, &field, &rows, &error))
        return (ps_result){NULL, error};
    (void)field;
    if (!ps_has(rows, old_key)) {
        free_path(&path);
        return (ps_result){NULL, input_error_format("Unknown row: %s", old_key)};
    }
    if (!strcmp(old_key, new_key)) {
        free_path(&path);
        return ps_ok(ps_null_value());
    }
    if (ps_has(rows, new_key)) {
        free_path(&path);
        return (ps_result){NULL, input_error_format("Row key already exists: %s", new_key)};
    }
    ps_value *next_rows = ps_object_value();
    for (size_t index = 0; next_rows && index < ps_size(rows); ++index) {
        const char *key = !strcmp(ps_key_at(rows, index), old_key)
            ? new_key : ps_key_at(rows, index);
        if (!ps_set(next_rows, key, ps_value_clone(ps_at(rows, index)))) {
            ps_value_free(next_rows);
            next_rows = NULL;
        }
    }
    ps_value *data = next_rows
        ? put_at(form->data, path.items, path.length, next_rows) : NULL;
    ps_value_free(next_rows);
    free_path(&path);
    return data ? commit(form, data) : (ps_result){NULL, internal_error()};
}

ps_form_result ps_form_new(const ps_value *template, const ps_value *data,
                           const ps_value *options)
{
    if (!template || template->kind != PS_OBJECT || !data || data->kind != PS_OBJECT ||
        !options || options->kind != PS_OBJECT)
        return (ps_form_result){NULL, input_error("Invalid form input")};
    ps_value *error = NULL;
    ps_value *normalized = normalize_fields(member(template, "fields"), data, &error);
    if (!normalized) return (ps_form_result){NULL, error ? error : internal_error()};
    ps_result binding = ps_bind_form(template, normalized, options);
    if (binding.error) {
        ps_value_free(normalized);
        return (ps_form_result){NULL, binding.error};
    }
    ps_form *form = calloc(1, sizeof(*form));
    if (!form) {
        ps_value_free(normalized);
        ps_value_free(binding.value);
        return (ps_form_result){NULL, internal_error()};
    }
    form->template = ps_value_clone(template);
    form->options = ps_value_clone(options);
    form->data = normalized;
    form->fields = binding.value;
    if (!form->template || !form->options) {
        ps_form_free(form);
        return (ps_form_result){NULL, internal_error()};
    }
    return (ps_form_result){form, NULL};
}

void ps_form_free(ps_form *form)
{
    if (!form) return;
    ps_value_free(form->template);
    ps_value_free(form->data);
    ps_value_free(form->fields);
    ps_value_free(form->options);
    free(form);
}

ps_form *ps_form_clone(const ps_form *form)
{
    if (!form) return NULL;
    ps_form *copy = calloc(1, sizeof(*copy));
    if (!copy) return NULL;
    copy->template = ps_value_clone(form->template);
    copy->data = ps_value_clone(form->data);
    copy->fields = ps_value_clone(form->fields);
    copy->options = ps_value_clone(form->options);
    copy->revision = form->revision;
    if (!copy->template || !copy->data || !copy->fields || !copy->options) {
        ps_form_free(copy);
        return NULL;
    }
    return copy;
}

ps_result ps_form_read(const ps_form *form, uint8_t member_index)
{
    if (!form) return (ps_result){NULL, input_error("Form is not initialized")};
    if (member_index == 0) return ps_ok(ps_value_clone(form->template));
    if (member_index == 1) return ps_ok(ps_value_clone(form->data));
    if (member_index == 2) return ps_ok(ps_value_clone(form->fields));
    if (member_index == 3) return ps_ok(ps_int_value(form->revision));
    if (member_index == 4) {
        char *html = ps_render_fields(form->fields);
        if (!html) return (ps_result){NULL, internal_error()};
        ps_value *value = ps_string_value(html);
        free(html);
        return value ? ps_ok(value) : (ps_result){NULL, internal_error()};
    }
    return (ps_result){NULL, input_error("Unknown form member")};
}

static const ps_value *argument(const ps_value *args, size_t index, ps_value **error)
{
    if (!args || args->kind != PS_ARRAY || index >= ps_size(args)) {
        *error = input_error("Missing form argument");
        return NULL;
    }
    return ps_at(args, index);
}

static const char *string_argument(const ps_value *args, size_t index, ps_value **error)
{
    const ps_value *value = argument(args, index, error);
    if (!value) return NULL;
    if (value->kind != PS_STRING) {
        *error = input_error("Expected a string");
        return NULL;
    }
    return ps_string(value);
}

ps_result ps_form_apply(ps_form *form, uint8_t method, const ps_value *args)
{
    if (!form) return (ps_result){NULL, input_error("Form is not initialized")};
    ps_value *error = NULL;
    if (!args || args->kind != PS_ARRAY)
        return (ps_result){NULL, input_error("Expected an argument array")};
    if (method == 0) {
        const char *source = string_argument(args, 0, &error);
        if (!source) return (ps_result){NULL, error};
        form_path path = checked_path(source, &error);
        if (error) return (ps_result){NULL, error};
        const ps_value *value = ps_path_segments(form->data,
            (const char *const *)path.items, path.length);
        free_path(&path);
        return ps_ok(value ? ps_value_clone(value) : ps_null_value());
    }
    if (method == 1) {
        const ps_value *data = argument(args, 0, &error);
        if (!data) return (ps_result){NULL, error};
        return replace_data(form, data);
    }
    if (method == 2) {
        const char *source = string_argument(args, 0, &error);
        const ps_value *value = error ? NULL : argument(args, 1, &error);
        if (error) return (ps_result){NULL, error};
        form_path path = checked_path(source, &error);
        if (error) return (ps_result){NULL, error};
        ps_value *updated = put_at(form->data, path.items, path.length, value);
        free_path(&path);
        if (!updated) return (ps_result){NULL, internal_error()};
        ps_value *normalized = normalize_fields(member(form->template, "fields"), updated, &error);
        ps_value_free(updated);
        return normalized ? commit(form, normalized)
                          : (ps_result){NULL, error ? error : internal_error()};
    }
    if (method == 3) {
        const char *source = string_argument(args, 0, &error);
        const ps_value *options = error ? NULL : argument(args, 1, &error);
        return error ? (ps_result){NULL, error} : add_row(form, source, options);
    }
    if (method == 4) {
        const char *source = string_argument(args, 0, &error);
        const char *key = error ? NULL : string_argument(args, 1, &error);
        const ps_value *options = error ? NULL : argument(args, 2, &error);
        return error ? (ps_result){NULL, error} : copy_row(form, source, key, options);
    }
    if (method == 5) {
        const char *source = string_argument(args, 0, &error);
        const char *key = error ? NULL : string_argument(args, 1, &error);
        return error ? (ps_result){NULL, error} : remove_row(form, source, key);
    }
    if (method == 6) {
        const char *source = string_argument(args, 0, &error);
        const char *key = error ? NULL : string_argument(args, 1, &error);
        const ps_value *position = error ? NULL : argument(args, 2, &error);
        if (!error && position->kind != PS_INT) error = input_error("Invalid row position");
        return error ? (ps_result){NULL, error}
                     : move_row(form, source, key, position->data.integer);
    }
    if (method == 7) {
        const char *source = string_argument(args, 0, &error);
        const char *old_key = error ? NULL : string_argument(args, 1, &error);
        const char *new_key = error ? NULL : string_argument(args, 2, &error);
        return error ? (ps_result){NULL, error}
                     : rekey_row(form, source, old_key, new_key);
    }
    return (ps_result){NULL, input_error("Unknown form operation")};
}
