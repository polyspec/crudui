#include "engine_internal.h"

#include <stdlib.h>
#include <string.h>

static char *empty_string(void)
{
    return ps_string_join("", "", "");
}

static char **expression_path(const char *path, size_t *length)
{
    char **parts = NULL;
    if (!ps_path_parts(path, &parts, length)) return NULL;
    for (size_t i = 0; i < *length; ++i) {
        const char *position = ps_position(parts[i]);
        if (position != parts[i]) {
            char *copy = ps_string_join(position, "", "");
            if (!copy) { ps_path_parts_free(parts, *length); return NULL; }
            free(parts[i]); parts[i] = copy;
        }
    }
    return parts;
}

static bool show_value(const ps_value *value, const ps_value *data,
                       const char *const *path, size_t path_length)
{
    if (!value || value->kind == PS_NULL) return true;
    if (value->kind == PS_OBJECT) {
        ps_value *selected = ps_condition_value(value, data, path, path_length);
        bool result = ps_truthy(selected);
        ps_value_free(selected); return result;
    }
    if (value->kind == PS_STRING) {
        bool parsed = false;
        bool result = ps_expression_truth(ps_string(value), data, path, path_length, &parsed);
        return parsed && result;
    }
    return ps_truthy(value);
}

static bool ternary_text(const char *value)
{
    const char *question = strchr(value, '?');
    return question && strchr(question + 1, ':');
}

static char *appearance(const ps_value *value, const ps_value *data,
                        const char *const *path, size_t path_length)
{
    if (!value || value->kind == PS_NULL) return empty_string();
    if (value->kind == PS_OBJECT) {
        ps_value *selected = ps_condition_value(value, data, path, path_length);
        if (!selected) return NULL;
        char *result = selected->kind == PS_NULL ? empty_string() : ps_js_string(selected);
        ps_value_free(selected); return result;
    }
    if (value->kind == PS_STRING) {
        const char *text = ps_string(value);
        if (ternary_text(text)) {
            bool parsed = false;
            ps_value *selected = ps_expression_value(text, data, path, path_length, &parsed);
            if (parsed) {
                char *result = !selected || selected->kind == PS_NULL
                    ? empty_string() : ps_js_string(selected);
                ps_value_free(selected); return result;
            }
            ps_value_free(selected);
        }
        if (ps_condition_expression(text) && !ternary_text(text)) {
            bool parsed = false;
            ps_value *selected = ps_expression_value(text, data, path, path_length, &parsed);
            if (!parsed || !selected || selected->kind == PS_NULL ||
                (selected->kind == PS_BOOL && !selected->data.boolean)) {
                ps_value_free(selected); return empty_string();
            }
            char *result = ps_js_string(selected);
            ps_value_free(selected); return result;
        }
        return ps_string_join(text, "", "");
    }
    return ps_js_string(value);
}

static ps_value *design_node(const ps_value *value, const ps_value *data,
                             const char *const *path, size_t path_length)
{
    const ps_value *object = value && value->kind == PS_OBJECT ? value : NULL;
    char *class_name = appearance(object ? ps_get(object, "class") : NULL,
                                  data, path, path_length);
    char *style = appearance(object ? ps_get(object, "style") : NULL,
                             data, path, path_length);
    ps_value *node = ps_object_value();
    if (!class_name || !style || !node ||
        !ps_set(node, "class", ps_string_value(class_name ? class_name : "")) ||
        !ps_set(node, "style", ps_string_value(style ? style : ""))) {
        ps_value_free(node); node = NULL;
    }
    free(class_name); free(style); return node;
}

static bool set_owned(ps_value *object, const char *key, ps_value **value)
{
    ps_value *owned = *value;
    *value = NULL;
    return ps_set(object, key, owned);
}

ps_value *ps_design(const ps_value *design, const ps_value *data, const char *path)
{
    const ps_value *object = design && design->kind == PS_OBJECT ? design : NULL;
    size_t path_length = 0;
    char **path_parts = expression_path(path, &path_length);
    if (!path_parts && path_length) return NULL;
    ps_value *result = ps_object_value();
    ps_value *main = design_node(object, data, (const char *const *)path_parts, path_length);
    ps_value *label = design_node(object ? ps_get(object, "label") : NULL, data,
                                  (const char *const *)path_parts, path_length);
    ps_value *wrapper = design_node(object ? ps_get(object, "wrapper") : NULL, data,
                                    (const char *const *)path_parts, path_length);
    ps_value *group = design_node(object ? ps_get(object, "group") : NULL, data,
                                  (const char *const *)path_parts, path_length);
    ps_value *prepend = design_node(object ? ps_get(object, "prepend") : NULL, data,
                                    (const char *const *)path_parts, path_length);
    ps_value *show = ps_bool_value(show_value(object ? ps_get(object, "show") : NULL,
                                              data, (const char *const *)path_parts, path_length));
    bool ok = result && main && label && wrapper && group && prepend && show;
    if (ok) ok = set_owned(result, "show", &show);
    if (ok) ok = set_owned(result, "main", &main);
    if (ok) ok = set_owned(result, "label", &label);
    if (ok) ok = set_owned(result, "wrapper", &wrapper);
    if (ok) ok = set_owned(result, "group", &group);
    if (ok) ok = set_owned(result, "prepend", &prepend);
    if (!ok) {
        ps_value_free(result);
        ps_value_free(show); ps_value_free(main); ps_value_free(label);
        ps_value_free(wrapper); ps_value_free(group); ps_value_free(prepend);
        result = NULL;
    }
    ps_path_parts_free(path_parts, path_length); return result;
}
