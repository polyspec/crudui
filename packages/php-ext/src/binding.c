#include "engine_internal.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    const ps_value *data;
    const char *key_prefix;
    const char *id_prefix;
    const char *language;
    bool unsupported_marker;
} bind_context;

static const ps_value *member(const ps_value *object, const char *key)
{
    return object && object->kind == PS_OBJECT ? ps_get(object, key) : NULL;
}

static bool set_string(ps_value *object, const char *key, const char *value)
{
    return ps_set(object, key, ps_string_value(value ? value : ""));
}

static bool set_owned(ps_value *object, const char *key, ps_value **value)
{
    ps_value *owned = *value;
    *value = NULL;
    return ps_set(object, key, owned);
}

static bool append_owned(ps_value *array, ps_value **value)
{
    ps_value *owned = *value;
    *value = NULL;
    return ps_append(array, owned);
}

static char *field_type(const ps_value *spec)
{
    const ps_value *value = member(spec, "type");
    if (!value || value->kind == PS_NULL) return ps_string_join("", "", "");
    return ps_js_string(value);
}

static char *wrapper_name(const char *path, const char *prefix)
{
    size_t extra = prefix && *prefix ? strlen(prefix) + 1 : 0;
    size_t path_length = strlen(path);
    char *result = malloc(extra + path_length * 2 + sizeof("-layer"));
    if (!result) return NULL;
    char *out = result;
    if (extra) {
        size_t length = strlen(prefix);
        memcpy(out, prefix, length); out += length; *out++ = '.';
    }
    for (size_t i = 0; i < path_length; ++i) {
        if (path[i] == '[' && path[i + 1] == ']') {
            *out++ = '.'; *out++ = '*'; ++i;
        } else {
            *out++ = path[i];
        }
    }
    memcpy(out, "-layer", sizeof("-layer"));
    return result;
}

static bool numeric(const ps_value *value)
{
    return value && (value->kind == PS_INT || value->kind == PS_FLOAT);
}

static ps_value *multiple_settings(const ps_value *multiple)
{
    if (!multiple || (multiple->kind == PS_BOOL && !multiple->data.boolean) ||
        (multiple->kind != PS_BOOL && multiple->kind != PS_OBJECT)) return NULL;
    ps_value *settings = ps_object_value();
    if (!settings || !ps_set(settings, "show", ps_bool_value(true))) {
        ps_value_free(settings); return NULL;
    }
    if (multiple->kind == PS_OBJECT) {
        const ps_value *minimum = member(multiple, "min");
        const ps_value *maximum = member(multiple, "max");
        if ((numeric(minimum) && !ps_set(settings, "min", ps_value_clone(minimum))) ||
            (numeric(maximum) && !ps_set(settings, "max", ps_value_clone(maximum))) ||
            !ps_set(settings, "copy",
                    ps_bool_value(member(multiple, "copy") &&
                                  member(multiple, "copy")->kind == PS_BOOL &&
                                  member(multiple, "copy")->data.boolean)) ||
            !ps_set(settings, "sortable",
                    ps_bool_value(member(multiple, "sortable") &&
                                  member(multiple, "sortable")->kind == PS_BOOL &&
                                  member(multiple, "sortable")->data.boolean))) {
            ps_value_free(settings); return NULL;
        }
    }
    return settings;
}

static bool checked_value(const ps_value *value)
{
    if (!value) return false;
    if (value->kind == PS_BOOL) return value->data.boolean;
    if (value->kind == PS_INT) return value->data.integer == 1;
    if (value->kind == PS_FLOAT) return value->data.number == 1;
    return ps_is_string(value, "1");
}

static ps_value *unsupported_widget(const char *type)
{
    ps_value *widget = ps_object_value();
    if (!widget || !ps_set(widget, "unsupported", ps_bool_value(true)) ||
        !set_string(widget, "type", type)) {
        ps_value_free(widget); return NULL;
    }
    return widget;
}

static ps_value *build_widget(const ps_value *spec, const ps_value *value,
                              bool present, const char *path, const ps_value *design,
                              const bind_context *context, const size_t *rows,
                              size_t row_count, ps_value **error)
{
    char *type = field_type(spec);
    if (!type) return NULL;
    if (!ps_widget_supported(type)) {
        if (context->unsupported_marker) {
            ps_value *widget = unsupported_widget(type);
            free(type);
            return widget;
        }
        size_t length = strlen(type) + strlen(path) + 34;
        char *message = malloc(length);
        if (message) snprintf(message, length, "Unsupported field type \"%s\" at \"%s\"", type, path);
        *error = message ? ps_error("form", "UNSUPPORTED_FIELD_TYPE", message, path, NULL) : NULL;
        free(message);
        free(type); return NULL;
    }
    free(type);
    return ps_widget(spec, value, present, path, design,
                     context->key_prefix, context->id_prefix,
                     context->language, rows, row_count);
}

static ps_value *build_field(const ps_value *field, const char *path,
                             const bind_context *context, const size_t *rows,
                             size_t row_count, ps_value **error);

static ps_value *build_children(const ps_value *field, const char *path,
                                const bind_context *context, const size_t *rows,
                                size_t row_count, ps_value **error)
{
    const ps_value *templates = member(field, "children");
    ps_value *children = ps_array_value();
    if (!children || !templates || templates->kind != PS_ARRAY) {
        ps_value_free(children); return NULL;
    }
    for (size_t i = 0; i < ps_size(templates); ++i) {
        const ps_value *child = ps_at(templates, i);
        const ps_value *name = member(child, "name");
        if (!name || name->kind != PS_STRING) { ps_value_free(children); return NULL; }
        char *child_path = ps_join_path(path, ps_string(name));
        ps_value *model = child_path
            ? build_field(child, child_path, context, rows, row_count, error) : NULL;
        free(child_path);
        if (!model || !append_owned(children, &model)) {
            ps_value_free(model);
            ps_value_free(children); return NULL;
        }
    }
    return children;
}

static ps_value *field_base(const ps_value *spec, const char *type, const char *path,
                            const bind_context *context, ps_value *design)
{
    char *wrapper = wrapper_name(path, context->key_prefix);
    char *uniqid = ps_element_id("", path);
    ps_value *model = ps_object_value();
    bool ok = wrapper && uniqid && model &&
        set_string(model, "shape", "leaf") &&
        set_string(model, "type", type) &&
        set_string(model, "path", path) &&
        set_string(model, "wrapperName", wrapper) &&
        set_string(model, "uniqid", uniqid) &&
        set_owned(model, "design", &design);
    const ps_value *label_value = member(spec, "label");
    if (ok && ps_truthy(label_value)) {
        char *label = ps_translate(label_value, context->language);
        ok = label && set_string(model, "label", label);
        free(label);
    }
    if (ok) ok = ps_set(model, "omitLabel", ps_bool_value(!strcmp(type, "hidden")));
    const ps_value *description_value = member(spec, "description");
    if (ok && ps_truthy(description_value)) {
        char *description = ps_translate(description_value, context->language);
        if (!description) ok = false;
        else if (*description) ok = set_string(model, "description", description);
        free(description);
    }
    free(wrapper); free(uniqid);
    if (!ok) { ps_value_free(design); ps_value_free(model); return NULL; }
    return model;
}

static bool replace_shape(ps_value *model, const char *shape)
{
    return ps_set(model, "shape", ps_string_value(shape));
}

/* Input failure for present group data, including a repeated group row, that is not an object. */
static ps_value *group_data_error(const char *path)
{
    char *message = ps_string_join("Group data must be an object: ", path, "");
    ps_value *error = message ? ps_error("form", "INVALID_FORM_INPUT", message, "", NULL) : NULL;
    free(message);
    return error;
}

static ps_value *build_multiple(const ps_value *field, const ps_value *spec,
                                const char *type, const char *path,
                                const bind_context *context, const size_t *rows,
                                size_t row_count, ps_value *design,
                                ps_value *settings, ps_value **error)
{
    ps_value *model = field_base(spec, type, path, context, design);
    if (!model) { ps_value_free(settings); return NULL; }
    bool group = !strcmp(type, "group");
    if (!replace_shape(model, group ? "multiple-group" : "multiple-leaf")) {
        ps_value_free(model); ps_value_free(settings); return NULL;
    }
    const ps_value *value = ps_path(context->data, path);
    size_t path_length = 0;
    char **parts = NULL;
    if (!ps_path_parts(path, &parts, &path_length)) {
        ps_value_free(model); ps_value_free(settings); return NULL;
    }
    size_t *next_rows = malloc((row_count + 1) * sizeof(*next_rows));
    if (!next_rows) {
        ps_path_parts_free(parts, path_length); ps_value_free(model);
        ps_value_free(settings); return NULL;
    }
    if (row_count) memcpy(next_rows, rows, row_count * sizeof(*next_rows));
    next_rows[row_count] = path_length;
    ps_path_parts_free(parts, path_length);

    if (value && value->kind != PS_OBJECT) {
        char *message = ps_string_join("Repeated data must be a keyed object: ", path, "");
        *error = message ? ps_error("form", "INVALID_FORM_INPUT", message, "", NULL) : NULL;
        free(message); free(next_rows); ps_value_free(model); ps_value_free(settings);
        return NULL;
    }
    ps_value *models = ps_array_value();
    size_t count = value ? ps_size(value) : 1;
    for (size_t i = 0; models && i < count; ++i) {
        const char *segment = value ? ps_key_at(value, i) : "__0000000000000__";
        const char *uniqid = segment;
        char *row_path = ps_join_path(path, segment);
        ps_value *row_design = row_path
            ? ps_design(member(spec, "design"), context->data, row_path) : NULL;
        ps_value *row = ps_object_value();
        char *wrapper = row_design ? ps_join_classes("input-group-wrapper",
            i ? "clone-element" : "",
            ps_string(member(member(row_design, "wrapper"), "class"))) : NULL;
        bool ok = row_path && row_design && row && wrapper &&
            set_string(row, "uniqid", uniqid) && set_string(row, "wrapperClass", wrapper);
        const ps_value *group_row = ok && group ? ps_path(context->data, row_path) : NULL;
        if (group_row && group_row->kind != PS_OBJECT) {
            *error = group_data_error(row_path);
            ok = false;
        }
        if (ok && group) {
            char *group_class = ps_join_classes("form-group",
                ps_string(member(member(row_design, "group"), "class")), NULL);
            ps_value *children = group_class
                ? build_children(field, row_path, context, next_rows, row_count + 1, error) : NULL;
            ok = group_class && children && set_string(row, "groupClass", group_class) &&
                set_owned(row, "children", &children);
            ps_value_free(children);
            free(group_class);
        } else if (ok) {
            const ps_value *row_value = ps_path(context->data, row_path);
            ps_value *widget = build_widget(spec, row_value, row_value != NULL, row_path,
                row_design, context, next_rows, row_count + 1, error);
            ok = widget && set_owned(row, "widget", &widget);
            ps_value_free(widget);
        }
        free(wrapper); free(row_path); ps_value_free(row_design);
        if (!ok) {
            ps_value_free(row); ps_value_free(models); models = NULL; break;
        }
        if (!append_owned(models, &row)) {
            ps_value_free(row); ps_value_free(models); models = NULL; break;
        }
    }
    free(next_rows);
    bool ok = models && set_owned(model, "rows", &models) &&
        set_owned(model, "multiple", &settings);
    ps_value_free(models); ps_value_free(settings);
    if (!ok) {
        ps_value_free(model); return NULL;
    }
    return model;
}

static ps_value *build_group(const ps_value *field, const ps_value *spec,
                             const char *type, const char *path,
                             const bind_context *context, const size_t *rows,
                             size_t row_count, ps_value *design, ps_value **error)
{
    ps_value *settings = multiple_settings(member(spec, "multiple"));
    if (settings) return build_multiple(field, spec, type, path, context, rows,
                                        row_count, design, settings, error);
    const ps_value *value = ps_path(context->data, path);
    if (value && value->kind != PS_OBJECT) {
        *error = group_data_error(path);
        ps_value_free(design);
        return NULL;
    }
    ps_value *model = field_base(spec, type, path, context, design);
    const ps_value *group_node = model ? member(member(model, "design"), "group") : NULL;
    char *group_class = model ? ps_join_classes("form-group",
        ps_string(member(group_node, "class")), NULL) : NULL;
    char *group_style = model ? ps_style_string(ps_string(member(group_node, "style"))) : NULL;
    ps_value *children = model
        ? build_children(field, path, context, rows, row_count, error) : NULL;
    bool ok = model && group_class && group_style && children &&
        replace_shape(model, "group") && set_string(model, "groupClass", group_class) &&
        (!*group_style || set_string(model, "groupStyle", group_style)) &&
        set_owned(model, "children", &children);
    free(group_class); free(group_style);
    if (!ok) { ps_value_free(children); ps_value_free(model); return NULL; }
    return model;
}

static ps_value *build_lang(const ps_value *spec, const char *type, const char *path,
                            const bind_context *context, const size_t *rows,
                            size_t row_count, ps_value *design, ps_value **error)
{
    const ps_value *lang = member(spec, "lang");
    ps_value *model = field_base(spec, type, path, context, design);
    ps_value *container = ps_object_value();
    const char *frame = lang && lang->kind == PS_OBJECT &&
        member(lang, "frame") && member(lang, "frame")->kind == PS_BOOL &&
        !member(lang, "frame")->data.boolean ? "lang-group p-0 border-0" : "lang-group";
    const char *extra_class = lang && lang->kind == PS_OBJECT &&
        member(lang, "group_class") && member(lang, "group_class")->kind == PS_STRING
        ? ps_string(member(lang, "group_class")) : "";
    char *group_class = ps_join_classes(frame, extra_class, NULL);
    ps_value *children = ps_array_value();
    bool ok = model && container && group_class && children &&
        replace_shape(model, "lang") && set_string(container, "groupClass", group_class);
    const ps_value *title = lang && lang->kind == PS_OBJECT ? member(lang, "title") : NULL;
    if (ok && ps_truthy(title)) {
        char *text = ps_translate(title, context->language);
        if (!text) ok = false;
        else if (*text) ok = set_string(container, "title", text);
        free(text);
    }
    const ps_value *only = lang && lang->kind == PS_OBJECT ? member(lang, "only") : NULL;
    const char *defaults[] = {"ko", "en", "ja", "zh"};
    size_t count = only && only->kind == PS_ARRAY && ps_size(only) ? ps_size(only) : 4;
    for (size_t i = 0; ok && i < count; ++i) {
        const ps_value *code_value = only && only->kind == PS_ARRAY && ps_size(only)
            ? ps_at(only, i) : NULL;
        const char *code = code_value && code_value->kind == PS_STRING
            ? ps_string(code_value) : defaults[i];
        char *lang_path = ps_join_path(path, code);
        ps_value *lang_design = lang_path
            ? ps_design(member(spec, "design"), context->data, lang_path) : NULL;
        const ps_value *value = lang_path ? ps_path(context->data, lang_path) : NULL;
        ps_value *widget = lang_design ? build_widget(spec, value, value != NULL, lang_path,
            lang_design, context, rows, row_count, error) : NULL;
        ps_value *child = ps_object_value();
        ok = lang_path && lang_design && widget && child &&
            set_string(child, "code", code) && set_owned(child, "widget", &widget) &&
            append_owned(children, &child);
        free(lang_path); ps_value_free(lang_design);
        ps_value_free(widget); ps_value_free(child);
    }
    if (ok) ok = set_owned(container, "children", &children);
    if (ok) ok = set_owned(model, "lang", &container);
    free(group_class); ps_value_free(children); ps_value_free(container);
    if (!ok) { ps_value_free(model); return NULL; }
    return model;
}

static ps_value *build_field(const ps_value *field, const char *path,
                             const bind_context *context, const size_t *rows,
                             size_t row_count, ps_value **error)
{
    const ps_value *spec = member(field, "spec");
    if (!spec || spec->kind != PS_OBJECT) return NULL;
    char *type = field_type(spec);
    ps_value *design = type ? ps_design(member(spec, "design"), context->data, path) : NULL;
    if (!type || !design) { free(type); ps_value_free(design); return NULL; }
    ps_value *model = NULL;
    if (!strcmp(type, "group")) {
        model = build_group(field, spec, type, path, context, rows, row_count, design, error);
        design = NULL;
    } else {
        ps_value *settings = multiple_settings(member(spec, "multiple"));
        if (settings) {
            model = build_multiple(field, spec, type, path, context, rows, row_count,
                                   design, settings, error);
            design = NULL;
        } else {
            const ps_value *lang = member(spec, "lang");
            bool lang_enabled = lang && ((lang->kind == PS_BOOL && lang->data.boolean) ||
                                         lang->kind == PS_OBJECT);
            if (lang_enabled) {
                model = build_lang(spec, type, path, context, rows, row_count, design, error);
                design = NULL;
            } else {
                model = field_base(spec, type, path, context, design); design = NULL;
                const ps_value *value = ps_path(context->data, path);
                if (model && (!strcmp(type, "checkbox") || !strcmp(type, "switcher"))) {
                    const ps_value *effective = value ? value : member(spec, "default");
                    char *id = ps_control_id(context->id_prefix, path);
                    char *name = ps_bracket_name(path, context->key_prefix);
                    const ps_value *main = member(member(model, "design"), "main");
                    char *class_name = ps_join_classes("valid-target",
                        ps_string(member(main, "class")), NULL);
                    bool ok = id && name && class_name &&
                        ps_set(model, "checkbox", ps_bool_value(true)) &&
                        set_string(model, "checkboxId", id) &&
                        set_string(model, "checkboxName", name) &&
                        set_string(model, "checkboxClass", class_name) &&
                        ps_set(model, "checkboxChecked", ps_bool_value(checked_value(effective)));
                    free(id); free(name); free(class_name);
                    if (!ok) { ps_value_free(model); model = NULL; }
                } else if (model) {
                    ps_value *widget = build_widget(spec, value, value != NULL, path,
                        member(model, "design"), context, rows, row_count, error);
                    if (!widget || !set_owned(model, "widget", &widget)) {
                        ps_value_free(widget);
                        ps_value_free(model); model = NULL;
                    }
                }
            }
        }
    }
    ps_value_free(design); free(type); return model;
}

static bool string_option(const ps_value *options, const char *name,
                          const char **output, ps_value **error)
{
    const ps_value *value = member(options, name);
    if (!value || value->kind == PS_NULL) { *output = NULL; return true; }
    if (value->kind == PS_STRING) { *output = ps_string(value); return true; }
    char message[128];
    snprintf(message, sizeof(message), "%s must be a string", name);
    *error = ps_error("form", "INVALID_FORM_INPUT", message, "", NULL);
    return false;
}

ps_result ps_bind_form(const ps_value *template, const ps_value *data,
                       const ps_value *options)
{
    if (!template || template->kind != PS_OBJECT ||
        !ps_is_string(member(template, "kind"), "crudui/form-template") ||
        !member(template, "fields") || member(template, "fields")->kind != PS_ARRAY)
        return ps_fail("form", "INVALID_FORM_INPUT", "Unsupported form template", "");
    if (!data || data->kind != PS_OBJECT)
        return ps_fail("form", "INVALID_FORM_INPUT", "Form data must be an object", "");
    if (!options || options->kind != PS_OBJECT)
        return ps_fail("form", "INVALID_FORM_INPUT", "Options must be an object", "");
    ps_value *error = NULL;
    const char *key_prefix = NULL, *id_prefix = NULL, *language = NULL, *unsupported = NULL;
    if (!string_option(options, "keyPrefix", &key_prefix, &error) ||
        !string_option(options, "idPrefix", &id_prefix, &error) ||
        !string_option(options, "language", &language, &error) ||
        !string_option(options, "unsupported", &unsupported, &error))
        return (ps_result){NULL, error};
    if (!key_prefix) {
        const ps_value *stored = member(template, "keyPrefix");
        if (stored && stored->kind == PS_STRING) key_prefix = ps_string(stored);
    }
    bind_context context = {
        data, key_prefix, id_prefix ? id_prefix : "crudui",
        language ? language : "ko", unsupported && !strcmp(unsupported, "marker")
    };
    ps_value *fields = ps_array_value();
    const ps_value *templates = member(template, "fields");
    for (size_t i = 0; fields && i < ps_size(templates); ++i) {
        const ps_value *field = ps_at(templates, i);
        const ps_value *name = member(field, "name");
        ps_value *model = name && name->kind == PS_STRING
            ? build_field(field, ps_string(name), &context, NULL, 0, &error) : NULL;
        if (!model || !append_owned(fields, &model)) {
            ps_value_free(model); ps_value_free(fields); fields = NULL; break;
        }
    }
    if (!fields) {
        if (error) return (ps_result){NULL, error};
        return ps_fail("internal", "INTERNAL_ERROR", "C form binding failed", "");
    }
    return ps_ok(fields);
}
