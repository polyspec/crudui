#include "engine_internal.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    const ps_value *data;
    const char *key_prefix;
    const char *id_prefix;
    const char *language;
    const ps_form_messages *messages;
    bool unsupported_marker;
} bind_context;

/* Enclosing repeated rows: path segment positions, one-based numbers and sticky headers. */
typedef struct {
    const size_t *segments;
    const size_t *numbers;
    size_t count;
    size_t sticky_depth;
} row_scope;

/* Evaluated controls and limits for a repeated field. */
typedef struct {
    bool has_min, has_max;
    double min, max;
    bool copy, sortable, sticky;
    const char *title;
    const char *controls;
} multiple_settings;

static const ps_value *member(const ps_value *object, const char *key)
{
    return object && object->kind == PS_OBJECT ? ps_get(object, key) : NULL;
}

static const char *string_member(const ps_value *object, const char *key)
{
    const ps_value *value = member(object, key);
    return value && value->kind == PS_STRING ? ps_string(value) : "";
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

static bool enabled_bool(const ps_value *object, const char *key)
{
    const ps_value *value = member(object, key);
    return value && value->kind == PS_BOOL && value->data.boolean;
}

static bool number_value(const ps_value *value, double *output)
{
    if (value && value->kind == PS_INT) { *output = (double)value->data.integer; return true; }
    if (value && value->kind == PS_FLOAT) { *output = value->data.number; return true; }
    return false;
}

/* Settings of a repeated field; false when the field does not repeat. */
static bool resolve_multiple(const ps_value *multiple, multiple_settings *settings)
{
    *settings = (multiple_settings){0};
    settings->controls = "header";
    if (multiple && multiple->kind == PS_BOOL && multiple->data.boolean) return true;
    if (!multiple || multiple->kind != PS_OBJECT) return false;
    settings->has_min = number_value(member(multiple, "min"), &settings->min);
    settings->has_max = number_value(member(multiple, "max"), &settings->max);
    settings->copy = enabled_bool(multiple, "copy");
    settings->sortable = enabled_bool(multiple, "sortable");
    const ps_value *title = member(multiple, "title");
    if (title && title->kind == PS_STRING) settings->title = ps_string(title);
    const ps_value *controls = member(multiple, "controls");
    if (ps_is_string(controls, "footer") || ps_is_string(controls, "outline"))
        settings->controls = ps_string(controls);
    settings->sticky = ps_is_string(member(multiple, "header"), "sticky");
    return true;
}

static bool checked_value(const ps_value *value)
{
    if (!value) return false;
    if (value->kind == PS_BOOL) return value->data.boolean;
    if (value->kind == PS_INT) return value->data.integer == 1;
    if (value->kind == PS_FLOAT) return value->data.number == 1;
    return ps_is_string(value, "1");
}

/* Translated text of a truthy declaration; an empty translation is absent (NULL). */
static bool translated(const ps_value *value, const char *language, char **text)
{
    *text = NULL;
    if (!ps_truthy(value)) return true;
    *text = ps_translate(value, language);
    if (!*text) return false;
    if (!**text) { free(*text); *text = NULL; }
    return true;
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
                              const char *path, const ps_value *design,
                              const bind_context *context, const row_scope *scope,
                              ps_value **error)
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
    return ps_widget(spec, value, value != NULL, path, design,
                     context->key_prefix, context->id_prefix,
                     context->language, scope->segments, scope->count);
}

/* Input failure for present group data, including a repeated group row, that is not an object. */
static ps_value *group_data_error(const char *path)
{
    char *message = ps_string_join("Group data must be an object: ", path, "");
    ps_value *error = message ? ps_error("form", "INVALID_FORM_INPUT", message, "", NULL) : NULL;
    free(message);
    return error;
}

/* Node parts. */

/* kind, path, className, style and hidden from the node's design.wrapper and design.show. */
static ps_value *node_root(const char *kind, const char *path, const ps_value *design)
{
    const ps_value *wrapper = member(design, "wrapper");
    char *style = ps_style_string(string_member(wrapper, "style"));
    ps_value *node = ps_object_value();
    bool ok = style && node && set_string(node, "kind", kind) &&
        set_string(node, "path", path) &&
        set_string(node, "className", string_member(wrapper, "class")) &&
        (!*style || set_string(node, "style", style)) &&
        ps_set(node, "hidden", ps_bool_value(!enabled_bool(design, "show")));
    free(style);
    if (!ok) { ps_value_free(node); return NULL; }
    return node;
}

typedef struct {
    const char *key;
    const char *text;
} header_part;

/* Attach a header with design.label appearance when any part has text. */
static bool attach_header(ps_value *node, const ps_value *design,
                          const header_part *parts, size_t count)
{
    bool present = false;
    for (size_t i = 0; i < count; ++i) if (parts[i].text && *parts[i].text) present = true;
    if (!present) return true;
    const ps_value *label = member(design, "label");
    char *style = ps_style_string(string_member(label, "style"));
    ps_value *header = ps_object_value();
    bool ok = style && header && set_string(header, "className", string_member(label, "class")) &&
        (!*style || set_string(header, "style", style));
    for (size_t i = 0; ok && i < count; ++i)
        if (parts[i].text && *parts[i].text) ok = set_string(header, parts[i].key, parts[i].text);
    if (ok) ok = set_owned(node, "header", &header);
    free(style); ps_value_free(header);
    return ok;
}

static bool attach_body(ps_value *node, const char *class_name, const char *style_source,
                        const char *id)
{
    char *style = ps_style_string(style_source);
    ps_value *body = ps_object_value();
    bool ok = style && body && set_string(body, "className", class_name) &&
        (!*style || set_string(body, "style", style)) &&
        (!id || !*id || set_string(body, "id", id)) && set_owned(node, "body", &body);
    free(style); ps_value_free(body);
    return ok;
}

static bool append_action(ps_value *actions, const char *name, const char *label, bool disabled)
{
    ps_value *action = ps_object_value();
    bool ok = action && set_string(action, "name", name) && set_string(action, "label", label) &&
        ps_set(action, "disabled", ps_bool_value(disabled)) && append_owned(actions, &action);
    ps_value_free(action);
    return ok;
}

static bool attach_controls(ps_value *node, const char *placement, const char *label,
                            ps_value **actions)
{
    ps_value *controls = ps_object_value();
    bool ok = controls && set_string(controls, "placement", placement) &&
        set_string(controls, "label", label) && set_owned(controls, "actions", actions) &&
        set_owned(node, "controls", &controls);
    ps_value_free(controls); ps_value_free(*actions); *actions = NULL;
    return ok;
}

/* Control the label targets: the file input, else the widget control; NULL for none. */
static const char *label_target(const ps_value *widget)
{
    if (enabled_bool(widget, "unsupported")) return NULL;
    const ps_value *id = member(member(member(widget, "extra"), "file"), "id");
    if (!id || id->kind == PS_NULL) id = member(member(widget, "attrs"), "id");
    return id && id->kind == PS_STRING && id->data.string.length ? ps_string(id) : NULL;
}

/* Node tree builder. */

static ps_value *build_field(const ps_value *field, const char *path,
                             const bind_context *context, const row_scope *scope,
                             ps_value **error);

static ps_value *build_children(const ps_value *field, const char *path,
                                const bind_context *context, const row_scope *scope,
                                ps_value **error)
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
            ? build_field(child, child_path, context, scope, error) : NULL;
        free(child_path);
        if (!model || !append_owned(children, &model)) {
            ps_value_free(model);
            ps_value_free(children); return NULL;
        }
    }
    return children;
}

static ps_value *build_leaf(const ps_value *spec, const char *type, const char *path,
                            const ps_value *design, const char *label,
                            const char *description, const bind_context *context,
                            const row_scope *scope, ps_value **error)
{
    const ps_value *value = ps_path(context->data, path);
    ps_value *node = node_root("field", path, design);
    if (!node) return NULL;
    if (!strcmp(type, "checkbox") || !strcmp(type, "switcher")) {
        char *id = ps_control_id(context->id_prefix, path);
        char *name = ps_bracket_name(path, context->key_prefix);
        char *class_name = ps_join_classes("valid-target",
            string_member(member(design, "main"), "class"), NULL);
        ps_value *checkbox = ps_object_value();
        header_part parts[] = {{"description", description}};
        bool ok = id && name && class_name && checkbox &&
            attach_header(node, design, parts, 1) && attach_body(node, "", "", NULL) &&
            set_string(checkbox, "id", id) && set_string(checkbox, "name", name) &&
            set_string(checkbox, "className", class_name) &&
            ps_set(checkbox, "checked", ps_bool_value(checked_value(value) ||
                (!value && checked_value(member(spec, "default"))))) &&
            set_string(checkbox, "caption", label) &&
            set_owned(node, "checkbox", &checkbox);
        free(id); free(name); free(class_name); ps_value_free(checkbox);
        if (!ok) { ps_value_free(node); return NULL; }
        return node;
    }
    ps_value *widget = build_widget(spec, value, path, design, context, scope, error);
    bool ok = widget != NULL;
    if (ok && strcmp(type, "hidden")) {
        const char *label_for = label ? label_target(widget) : NULL;
        header_part parts[] = {{"label", label}, {"labelFor", label_for}, {"description", description}};
        ok = attach_header(node, design, parts, 3);
    }
    ok = ok && attach_body(node, "", "", NULL) && set_owned(node, "widget", &widget);
    ps_value_free(widget);
    if (!ok) { ps_value_free(node); return NULL; }
    return node;
}

static ps_value *build_group(const ps_value *field, const char *path, const ps_value *design,
                             const char *label, const char *description,
                             const bind_context *context, const row_scope *scope,
                             ps_value **error)
{
    const ps_value *value = ps_path(context->data, path);
    if (value && value->kind != PS_OBJECT) {
        *error = group_data_error(path);
        return NULL;
    }
    const ps_value *group = member(design, "group");
    ps_value *node = node_root("group", path, design);
    header_part parts[] = {{"label", label}, {"description", description}};
    bool ok = node && attach_header(node, design, parts, 2) &&
        attach_body(node, string_member(group, "class"), string_member(group, "style"), NULL);
    ps_value *children = ok ? build_children(field, path, context, scope, error) : NULL;
    ok = children && set_owned(node, "children", &children);
    ps_value_free(children);
    if (!ok) { ps_value_free(node); return NULL; }
    return node;
}

/* "1.2.3" from the one-based row numbers. */
static char *row_number(const size_t *numbers, size_t count)
{
    size_t length = count * 21 + 1;
    char *out = malloc(length);
    if (!out) return NULL;
    size_t cursor = 0;
    for (size_t i = 0; i < count; ++i)
        cursor += (size_t)snprintf(out + cursor, length - cursor, i ? ".%zu" : "%zu", numbers[i]);
    out[cursor] = '\0';
    return out;
}

/* Title of a group row: the title child's value, or the untitled message when empty. */
static char *row_title(const char *row_path, const char *title, const bind_context *context)
{
    char *title_path = ps_join_path(row_path, title);
    if (!title_path) return NULL;
    const ps_value *value = ps_path(context->data, title_path);
    free(title_path);
    if (!value || value->kind == PS_NULL || (value->kind == PS_STRING && !value->data.string.length))
        return ps_string_join(context->messages->untitled, "", "");
    return ps_js_string(value);
}

static ps_value *build_row(const ps_value *field, const ps_value *spec,
                           const char *collection_path, const char *key, size_t index,
                           size_t count, bool group, const char *label,
                           const multiple_settings *settings, const bind_context *context,
                           const row_scope *scope, size_t *numbers, const size_t *segments,
                           ps_value **error)
{
    const ps_form_messages *messages = context->messages;
    char *row_path = ps_join_path(collection_path, key);
    ps_value *row_design = row_path
        ? ps_design(member(spec, "design"), context->data, row_path) : NULL;
    numbers[scope->count] = index + 1;
    row_scope inner = {segments, numbers, scope->count + 1,
                       scope->sticky_depth + (settings->sticky ? 1 : 0)};
    bool full = settings->has_max && (double)count >= settings->max;
    char *number = row_number(numbers, scope->count + 1);
    ps_value *actions = ps_array_value();
    ps_value *row = ps_object_value();
    bool ok = row_path && row_design && number && actions && row;
    if (ok && settings->sortable)
        ok = append_action(actions, "move-up", messages->move_up, index == 0) &&
            append_action(actions, "move-down", messages->move_down, index + 1 == count);
    if (ok) ok = append_action(actions, "add-row", messages->add_row, full);
    if (ok && settings->copy) ok = append_action(actions, "copy-row", messages->copy_row, full);
    if (ok) ok = append_action(actions, "remove-row", messages->remove_row,
                               settings->has_min && (double)count <= settings->min);
    ok = ok && set_string(row, "kind", "row") && set_string(row, "key", key) &&
        set_string(row, "className", "") && ps_set(row, "hidden", ps_bool_value(false)) &&
        attach_controls(row, settings->controls, messages->row_controls, &actions);
    if (ok && settings->sticky)
        ok = ps_set(row, "sticky", ps_bool_value(true)) &&
            ps_set(row, "stickyDepth", ps_int_value((int64_t)scope->sticky_depth));
    ps_value *header = ok ? ps_object_value() : NULL;
    ok = header && set_string(header, "className", "") &&
        (!label || set_string(header, "label", label)) && set_string(header, "number", number);
    if (ok && !group) {
        const ps_value *value = ps_path(context->data, row_path);
        ps_value *widget = build_widget(spec, value, row_path, row_design, context, &inner, error);
        ok = widget && set_owned(row, "header", &header) && attach_body(row, "", "", NULL) &&
            set_owned(row, "widget", &widget);
        ps_value_free(widget);
    } else if (ok) {
        const ps_value *value = ps_path(context->data, row_path);
        if (value && value->kind != PS_OBJECT) {
            *error = group_data_error(row_path);
            ok = false;
        }
        ps_value *children = ok ? build_children(field, row_path, context, &inner, error) : NULL;
        size_t nested = 0, nested_rows = 0;
        for (size_t i = 0; children && i < ps_size(children); ++i) {
            const ps_value *child = ps_at(children, i);
            if (!ps_is_string(member(child, "kind"), "collection")) continue;
            nested++;
            nested_rows += ps_size(member(child, "children"));
        }
        char *summary = !children ? NULL : nested
            ? ps_format_count(messages->children, nested_rows)
            : ps_string_join(messages->collapsed, "", "");
        char *title = children && settings->title ? row_title(row_path, settings->title, context) : NULL;
        char *control = children ? ps_control_id(context->id_prefix, row_path) : NULL;
        char *body_id = control ? ps_string_join(control, ":body", "") : NULL;
        const ps_value *design_group = member(row_design, "group");
        ok = children && summary && (!settings->title || title) && body_id &&
            (!settings->title || set_string(header, "title", title)) &&
            set_string(header, "summary", summary) && set_owned(row, "header", &header) &&
            attach_body(row, string_member(design_group, "class"),
                        string_member(design_group, "style"), body_id) &&
            ps_set(row, "collapsible", ps_bool_value(true)) &&
            ps_set(row, "expanded", ps_bool_value(true)) &&
            set_string(row, "toggleLabel", messages->toggle_row) &&
            set_owned(row, "children", &children);
        ps_value_free(children); free(summary); free(title); free(control); free(body_id);
    }
    ps_value_free(header); ps_value_free(actions);
    free(number); free(row_path); ps_value_free(row_design);
    if (!ok) { ps_value_free(row); return NULL; }
    return row;
}

static ps_value *build_collection(const ps_value *field, const ps_value *spec,
                                  const char *type, const char *path,
                                  const ps_value *design, const char *label,
                                  const char *description, const multiple_settings *settings,
                                  const bind_context *context, const row_scope *scope,
                                  ps_value **error)
{
    const ps_value *value = ps_path(context->data, path);
    if (value && value->kind != PS_OBJECT) {
        char *message = ps_string_join("Repeated data must be a keyed object: ", path, "");
        *error = message ? ps_error("form", "INVALID_FORM_INPUT", message, "", NULL) : NULL;
        free(message);
        return NULL;
    }
    size_t path_length = 0;
    char **parts = NULL;
    if (!ps_path_parts(path, &parts, &path_length)) return NULL;
    ps_path_parts_free(parts, path_length);
    size_t *segments = malloc((scope->count + 1) * sizeof(*segments));
    size_t *numbers = malloc((scope->count + 1) * sizeof(*numbers));
    ps_value *rows = ps_array_value();
    bool ok = segments && numbers && rows;
    if (ok) {
        if (scope->count) {
            memcpy(segments, scope->segments, scope->count * sizeof(*segments));
            memcpy(numbers, scope->numbers, scope->count * sizeof(*numbers));
        }
        segments[scope->count] = path_length;
    }
    bool group = !strcmp(type, "group");
    size_t count = value ? ps_size(value) : 1;
    for (size_t i = 0; ok && i < count; ++i) {
        const char *key = value ? ps_key_at(value, i) : "__0000000000000__";
        ps_value *row = build_row(field, spec, path, key, i, count, group, label, settings,
                                  context, scope, numbers, segments, error);
        ok = row && append_owned(rows, &row);
        ps_value_free(row);
    }
    free(segments); free(numbers);
    char *count_text = ok ? ps_format_count(context->messages->count, count) : NULL;
    ps_value *node = count_text ? node_root("collection", path, design) : NULL;
    header_part header[] = {{"label", label}, {"description", description}, {"count", count_text}};
    ok = node && attach_header(node, design, header, 3) && attach_body(node, "", "", NULL) &&
        set_string(node, "item", group ? "group" : "field");
    if (ok && !count) {
        ps_value *actions = ps_array_value();
        bool full = settings->has_max && 0 >= settings->max;
        ok = actions && append_action(actions, "add-row", context->messages->add_row, full) &&
            attach_controls(node, "footer",
                            context->messages->collection_controls, &actions);
        ps_value_free(actions);
    }
    ok = ok && set_owned(node, "children", &rows);
    free(count_text); ps_value_free(rows);
    if (!ok) { ps_value_free(node); return NULL; }
    return node;
}

static ps_value *build_lang(const ps_value *spec, const char *path, const ps_value *design,
                            const char *label, const char *description,
                            const bind_context *context, const row_scope *scope,
                            ps_value **error)
{
    const ps_value *lang = member(spec, "lang");
    const ps_value *settings = lang && lang->kind == PS_OBJECT ? lang : NULL;
    const ps_value *frame = member(settings, "frame");
    const char *frame_class = frame && frame->kind == PS_BOOL && !frame->data.boolean
        ? "lang-group p-0 border-0" : "lang-group";
    char *title = NULL;
    bool ok = translated(member(settings, "title"), context->language, &title);
    char *group_class = ok ? ps_join_classes(frame_class, string_member(settings, "group_class"), NULL) : NULL;
    ps_value *node = group_class ? node_root("lang", path, design) : NULL;
    header_part header[] = {{"label", label}, {"description", description}, {"title", title}};
    ok = node && attach_header(node, design, header, 3) &&
        attach_body(node, group_class, "", NULL);
    free(title); free(group_class);
    ps_value *children = ok ? ps_array_value() : NULL;
    ok = children != NULL;
    const ps_value *only = member(settings, "only");
    const char *defaults[] = {"ko", "en", "ja", "zh"};
    bool listed = only && only->kind == PS_ARRAY && ps_size(only);
    size_t count = listed ? ps_size(only) : 4;
    for (size_t i = 0; ok && i < count; ++i) {
        /* Compilation admits only string codes; a listed non-string is an invalid template. */
        const ps_value *code_value = listed ? ps_at(only, i) : NULL;
        if (listed && code_value->kind != PS_STRING) { ok = false; break; }
        const char *code = listed ? ps_string(code_value) : defaults[i];
        char *lang_path = ps_join_path(path, code);
        ps_value *lang_design = lang_path
            ? ps_design(member(spec, "design"), context->data, lang_path) : NULL;
        const ps_value *value = lang_path ? ps_path(context->data, lang_path) : NULL;
        ps_value *widget = lang_design
            ? build_widget(spec, value, lang_path, lang_design, context, scope, error) : NULL;
        ps_value *child = ps_object_value();
        ps_value *child_header = ps_object_value();
        ok = widget && child && child_header &&
            set_string(child, "kind", "lang-item") && set_string(child, "lang", code) &&
            set_string(child, "className", "") && ps_set(child, "hidden", ps_bool_value(false)) &&
            set_string(child_header, "className", "") && set_string(child_header, "label", code) &&
            set_owned(child, "header", &child_header) && attach_body(child, "", "", NULL) &&
            set_owned(child, "widget", &widget) && append_owned(children, &child);
        free(lang_path); ps_value_free(lang_design);
        ps_value_free(widget); ps_value_free(child); ps_value_free(child_header);
    }
    ok = ok && set_owned(node, "children", &children);
    ps_value_free(children);
    if (!ok) { ps_value_free(node); return NULL; }
    return node;
}

static ps_value *build_field(const ps_value *field, const char *path,
                             const bind_context *context, const row_scope *scope,
                             ps_value **error)
{
    const ps_value *spec = member(field, "spec");
    if (!spec || spec->kind != PS_OBJECT) return NULL;
    char *type = field_type(spec);
    ps_value *design = type ? ps_design(member(spec, "design"), context->data, path) : NULL;
    char *label = NULL, *description = NULL;
    ps_value *model = NULL;
    if (type && design && translated(member(spec, "label"), context->language, &label) &&
        translated(member(spec, "description"), context->language, &description)) {
        multiple_settings settings;
        const ps_value *lang = member(spec, "lang");
        if (resolve_multiple(member(spec, "multiple"), &settings))
            model = build_collection(field, spec, type, path, design, label, description,
                                     &settings, context, scope, error);
        else if (!strcmp(type, "group"))
            model = build_group(field, path, design, label, description, context, scope, error);
        else if (lang && ((lang->kind == PS_BOOL && lang->data.boolean) || lang->kind == PS_OBJECT))
            model = build_lang(spec, path, design, label, description, context, scope, error);
        else
            model = build_leaf(spec, type, path, design, label, description, context, scope, error);
    }
    free(label); free(description);
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
    /* An absent or null language is Korean; any other non-string is rejected before text conversion. */
    const ps_value *language_value = member(options, "language");
    if (language_value && language_value->kind != PS_NULL && language_value->kind != PS_STRING)
        return ps_fail("form", "INVALID_FORM_INPUT", "Language must be a string", "");
    const char *language = language_value && language_value->kind == PS_STRING
        ? ps_string(language_value) : "ko";
    ps_value *error = NULL;
    const char *key_prefix = NULL, *id_prefix = NULL;
    if (!string_option(options, "keyPrefix", &key_prefix, &error) ||
        !string_option(options, "idPrefix", &id_prefix, &error))
        return (ps_result){NULL, error};
    /* An absent or null mode throws; any other value must name a mode exactly. */
    const ps_value *unsupported = member(options, "unsupported");
    if (unsupported && unsupported->kind != PS_NULL &&
        !ps_is_string(unsupported, "throw") && !ps_is_string(unsupported, "marker"))
        return ps_fail("form", "INVALID_FORM_INPUT", "unsupported must be throw or marker", "");
    const ps_form_messages *messages = ps_form_messages_for(language);
    if (!messages) {
        char *message = ps_string_join("Unsupported language: ", language, "");
        if (!message) return ps_fail("internal", "INTERNAL_ERROR", "C form binding failed", "");
        ps_result failure = ps_fail("form", "INVALID_FORM_INPUT", message, "");
        free(message);
        return failure;
    }
    if (!key_prefix) {
        const ps_value *stored = member(template, "keyPrefix");
        if (stored && stored->kind == PS_STRING) key_prefix = ps_string(stored);
    }
    bind_context context = {
        data, key_prefix, id_prefix ? id_prefix : "crudui", language, messages,
        ps_is_string(unsupported, "marker")
    };
    row_scope root = {NULL, NULL, 0, 0};
    ps_value *fields = ps_array_value();
    const ps_value *templates = member(template, "fields");
    for (size_t i = 0; fields && i < ps_size(templates); ++i) {
        const ps_value *field = ps_at(templates, i);
        const ps_value *name = member(field, "name");
        ps_value *model = name && name->kind == PS_STRING
            ? build_field(field, ps_string(name), &context, &root, &error) : NULL;
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
