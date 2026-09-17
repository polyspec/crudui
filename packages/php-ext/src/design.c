#include "engine_internal.h"

#include <stdlib.h>
#include <string.h>

static ps_chars empty_string(void)
{
    return ps_copy(PS_TEXT(""));
}

static bool show_value(const ps_value *value, const ps_value *data,
                       const ps_text *path, size_t path_length)
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

static bool ternary_text(ps_text value)
{
    size_t question = ps_text_find_byte(value, '?', 0);
    return question != SIZE_MAX && ps_text_find_byte(value, ':', question + 1) != SIZE_MAX;
}

static ps_chars appearance(const ps_value *value, const ps_value *data,
                           const ps_text *path, size_t path_length)
{
    if (!value || value->kind == PS_NULL) return empty_string();
    if (value->kind == PS_OBJECT) {
        ps_value *selected = ps_condition_value(value, data, path, path_length);
        if (!selected) return (ps_chars){NULL, 0};
        ps_chars result = selected->kind == PS_NULL ? empty_string() : ps_js_string(selected);
        ps_value_free(selected); return result;
    }
    if (value->kind == PS_STRING) {
        ps_text text = ps_string(value);
        if (ternary_text(text)) {
            bool parsed = false;
            ps_value *selected = ps_expression_value(text, data, path, path_length, &parsed);
            if (parsed) {
                ps_chars result = !selected || selected->kind == PS_NULL
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
            ps_chars result = ps_js_string(selected);
            ps_value_free(selected); return result;
        }
        return ps_copy(text);
    }
    return ps_js_string(value);
}

static ps_value *design_node(const ps_value *value, const ps_value *data,
                             const ps_text *path, size_t path_length)
{
    const ps_value *object = value && value->kind == PS_OBJECT ? value : NULL;
    ps_chars class_name = appearance(object ? ps_get(object, "class") : NULL,
                                     data, path, path_length);
    ps_chars style = appearance(object ? ps_get(object, "style") : NULL,
                                data, path, path_length);
    ps_value *node = ps_object_value();
    if (!class_name.bytes || !style.bytes || !node ||
        !ps_set(node, "class", ps_text_value(ps_view(class_name))) ||
        !ps_set(node, "style", ps_text_value(ps_view(style)))) {
        ps_value_free(node); node = NULL;
    }
    free(class_name.bytes); free(style.bytes); return node;
}

static bool set_owned(ps_value *object, const char *key, ps_value **value)
{
    ps_value *owned = *value;
    *value = NULL;
    return ps_set(object, key, owned);
}

ps_value *ps_design(const ps_value *design, const ps_value *data, ps_text path)
{
    const ps_value *object = design && design->kind == PS_OBJECT ? design : NULL;
    size_t path_length = 0;
    ps_text *path_parts = NULL;
    if (!ps_path_parts(path, &path_parts, &path_length)) return NULL;
    ps_value *result = ps_object_value();
    ps_value *main = design_node(object, data, path_parts, path_length);
    ps_value *label = design_node(object ? ps_get(object, "label") : NULL, data,
                                  path_parts, path_length);
    ps_value *wrapper = design_node(object ? ps_get(object, "wrapper") : NULL, data,
                                    path_parts, path_length);
    ps_value *group = design_node(object ? ps_get(object, "group") : NULL, data,
                                  path_parts, path_length);
    ps_value *prepend = design_node(object ? ps_get(object, "prepend") : NULL, data,
                                    path_parts, path_length);
    ps_value *show = ps_bool_value(show_value(object ? ps_get(object, "show") : NULL,
                                              data, path_parts, path_length));
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
    free(path_parts); return result;
}
