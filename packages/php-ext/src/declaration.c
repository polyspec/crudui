#include "engine_internal.h"

#include <stdarg.h>
#include <stdlib.h>
#include <string.h>

/* Set an INVALID_FORM_INPUT error whose message joins the NULL-terminated parts; returns false. */
static bool invalid(ps_value **error, ...)
{
    va_list parts;
    size_t length = 0;
    va_start(parts, error);
    for (const char *part = va_arg(parts, const char *); part; part = va_arg(parts, const char *))
        length += strlen(part);
    va_end(parts);
    char *message = malloc(length + 1);
    *error = NULL;
    if (!message) return false;
    size_t offset = 0;
    va_start(parts, error);
    for (const char *part = va_arg(parts, const char *); part; part = va_arg(parts, const char *)) {
        size_t size = strlen(part);
        memcpy(message + offset, part, size);
        offset += size;
    }
    va_end(parts);
    message[offset] = '\0';
    *error = ps_error("form", "INVALID_FORM_INPUT", message, "", NULL);
    free(message);
    return false;
}

bool ps_declaration_error(const char *key, const char *path, const char *expected, ps_value **error)
{
    return invalid(error, "Invalid ", key, " at ", path, ": expected ", expected, (const char *)NULL);
}

bool ps_known_keys(const ps_value *bucket, const char *name, const char *const *allowed,
                   size_t count, const char *path, ps_value **error)
{
    for (size_t i = 0; i < ps_size(bucket); ++i) {
        const char *key = ps_key_at(bucket, i);
        bool known = false;
        for (size_t j = 0; !known && j < count; ++j) known = !strcmp(key, allowed[j]);
        if (!known)
            return invalid(error, "Invalid ", name, ".", key, " at ", path, ": unknown key", (const char *)NULL);
    }
    return true;
}

/* A string, or a condition map: a non-empty object. */
static bool condition_value(const ps_value *value)
{
    return value->kind == PS_STRING || (value->kind == PS_OBJECT && ps_size(value) > 0);
}

bool ps_design_declaration_valid(const ps_value *design, const char *path, ps_value **error)
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
        return ps_declaration_error("design", path, "a boolean or an object", error);
    if (design->kind != PS_OBJECT) return true;
    if (!ps_known_keys(design, "design", design_keys, 7, path, error)) return false;
    const ps_value *show = ps_get(design, "show");
    if (show && show->kind != PS_BOOL && !condition_value(show))
        return ps_declaration_error("design.show", path, "an expression, a boolean or a condition map", error);
    for (size_t i = 0; i < 2; ++i) {
        const ps_value *value = ps_get(design, styles[i][0]);
        if (value && !condition_value(value))
            return ps_declaration_error(styles[i][1], path, "a string or a condition map", error);
    }
    for (size_t i = 0; i < 4; ++i) {
        const ps_value *node = ps_get(design, nodes[i][0]);
        if (!node) continue;
        if (node->kind != PS_OBJECT)
            return ps_declaration_error(nodes[i][1], path, "an object", error);
        if (!ps_known_keys(node, nodes[i][1], node_keys, 2, path, error)) return false;
        for (size_t j = 0; j < 2; ++j) {
            const ps_value *value = ps_get(node, styles[j][0]);
            if (value && !condition_value(value))
                return ps_declaration_error(nodes[i][2 + j], path, "a string or a condition map", error);
        }
    }
    return true;
}
