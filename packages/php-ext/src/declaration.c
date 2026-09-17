#include "engine_internal.h"

#include <stdlib.h>
#include <string.h>

/* Set an INVALID_FORM_INPUT error with the message; returns false. */
static bool invalid(ps_value **error, ps_chars message)
{
    *error = message.bytes
        ? ps_error_text("form", "INVALID_FORM_INPUT", ps_view(message), PS_TEXT(""), NULL) : NULL;
    free(message.bytes);
    return false;
}

bool ps_declaration_error(ps_text key, ps_text path, const char *expected, ps_value **error)
{
    return invalid(error, PS_CONCAT(PS_TEXT("Invalid "), key, PS_TEXT(" at "), path,
                                    PS_TEXT(": expected "), ps_fixed(expected)));
}

bool ps_known_keys(const ps_value *bucket, const char *name, const char *const *allowed,
                   size_t count, ps_text path, ps_value **error)
{
    for (size_t i = 0; i < ps_size(bucket); ++i) {
        ps_text key = ps_key(bucket, i);
        bool known = false;
        for (size_t j = 0; !known && j < count; ++j) known = ps_text_is(key, allowed[j]);
        if (!known)
            return invalid(error, PS_CONCAT(PS_TEXT("Invalid "), ps_fixed(name), PS_TEXT("."), key,
                                            PS_TEXT(" at "), path, PS_TEXT(": unknown key")));
    }
    return true;
}

/* A string, or a condition map: a non-empty object. */
static bool condition_value(const ps_value *value)
{
    return value->kind == PS_STRING || (value->kind == PS_OBJECT && ps_size(value) > 0);
}

bool ps_design_declaration_valid(const ps_value *design, ps_text path, ps_value **error)
{
    static const char *const design_keys[] = {"show", "class", "style", "label", "wrapper", "group", "prepend"};
    static const char *const node_keys[] = {"class", "style"};
    static const char *const styles[][2] = {{"class", "design.class"}, {"style", "design.style"}};
    static const char *const nodes[][4] = {
        {"label", "design.label", "design.label.class", "design.label.style"},
        {"wrapper", "design.wrapper", "design.wrapper.class", "design.wrapper.style"},
        {"group", "design.group", "design.group.class", "design.group.style"},
        {"prepend", "design.prepend", "design.prepend.class", "design.prepend.style"},
    };
    if (design->kind != PS_BOOL && design->kind != PS_OBJECT)
        return ps_declaration_error(PS_TEXT("design"), path, "a boolean or an object", error);
    if (design->kind != PS_OBJECT) return true;
    if (!ps_known_keys(design, "design", design_keys, 7, path, error)) return false;
    const ps_value *show = ps_get(design, "show");
    if (show && show->kind != PS_BOOL && !condition_value(show))
        return ps_declaration_error(PS_TEXT("design.show"), path, "an expression, a boolean or a condition map", error);
    for (size_t i = 0; i < 2; ++i) {
        const ps_value *value = ps_get(design, styles[i][0]);
        if (value && !condition_value(value))
            return ps_declaration_error(ps_fixed(styles[i][1]), path, "a string or a condition map", error);
    }
    for (size_t i = 0; i < 4; ++i) {
        const ps_value *node = ps_get(design, nodes[i][0]);
        if (!node) continue;
        if (node->kind != PS_OBJECT)
            return ps_declaration_error(ps_fixed(nodes[i][1]), path, "an object", error);
        if (!ps_known_keys(node, nodes[i][1], node_keys, 2, path, error)) return false;
        for (size_t j = 0; j < 2; ++j) {
            const ps_value *value = ps_get(node, styles[j][0]);
            if (value && !condition_value(value))
                return ps_declaration_error(ps_fixed(nodes[i][2 + j]), path, "a string or a condition map", error);
        }
    }
    return true;
}
