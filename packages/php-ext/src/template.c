#include "engine_internal.h"

#include <stdlib.h>
#include <string.h>

static ps_result input_error(const char *message)
{
    return ps_fail("form", "INVALID_FORM_INPUT", message, "");
}

static const ps_value *option(const ps_value *options, const char *name)
{
    return options && options->kind == PS_OBJECT ? ps_get(options, name) : NULL;
}

static bool option_string(const ps_value *options, const char *name,
                          const char **value, ps_result *error)
{
    const ps_value *item = option(options, name);
    if (!item) { *value = NULL; return true; }
    if (item->kind != PS_STRING) {
        char message[160];
        size_t prefix = strlen(name);
        if (prefix > sizeof(message) - 19) prefix = sizeof(message) - 19;
        memcpy(message, name, prefix);
        memcpy(message + prefix, " must be a string", 18);
        message[prefix + 18] = '\0';
        *error = input_error(message); return false;
    }
    *value = ps_string(item); return true;
}

/* A string, or a condition map: a non-empty object. */
static bool condition_value(const ps_value *value)
{
    return value->kind == PS_STRING || (value->kind == PS_OBJECT && ps_size(value) > 0);
}

/* Concatenate three strings into new memory; NULL on allocation failure. */
static char *concat3(const char *first, const char *second, const char *third)
{
    size_t a = strlen(first), b = strlen(second), c = strlen(third);
    char *out = malloc(a + b + c + 1);
    if (!out) return NULL;
    memcpy(out, first, a);
    memcpy(out + a, second, b);
    memcpy(out + a + b, third, c + 1);
    return out;
}

/* Set "Invalid <key> at <path>: expected <expected>"; always returns false. */
static bool declaration_error(const char *key, const char *path, const char *expected,
                              ps_value **error)
{
    char *head = concat3("Invalid ", key, " at ");
    char *middle = head ? concat3(head, path, ": expected ") : NULL;
    char *message = middle ? concat3(middle, expected, "") : NULL;
    *error = message ? ps_error("form", "INVALID_FORM_INPUT", message, "", NULL) : NULL;
    free(head); free(middle); free(message);
    return false;
}

/* A multiple or lang declaration that enables the feature: true or an object. */
static bool enabled_declaration(const ps_value *value)
{
    return value && ((value->kind == PS_BOOL && value->data.boolean) || value->kind == PS_OBJECT);
}

/* A child that renders one scalar value: not repeated, not a group and not a language field. */
static bool scalar_child(const ps_value *child)
{
    return child && child->kind == PS_OBJECT && !ps_is_string(ps_get(child, "type"), "group") &&
        !ps_has(child, "properties") && !enabled_declaration(ps_get(child, "multiple")) &&
        !enabled_declaration(ps_get(child, "lang"));
}

/* A string equal to one of the allowed values. */
static bool one_of(const ps_value *value, const char *const *allowed, size_t count)
{
    for (size_t i = 0; i < count; ++i)
        if (ps_is_string(value, allowed[i])) return true;
    return false;
}

/* Reject a wrong value type in one field's multiple and design declarations. */
static bool declarations_valid(const ps_value *spec, const char *path, ps_value **error)
{
    static const char *const placements[] = {"header", "footer", "outline"};
    static const char *const headers[] = {"static", "sticky"};
    static const char *const numbers[][2] = {{"min", "multiple.min"}, {"max", "multiple.max"}};
    static const char *const booleans[][2] = {{"copy", "multiple.copy"}, {"sortable", "multiple.sortable"}};
    static const char *const styles[][2] = {{"class", "design.class"}, {"style", "design.style"}};
    static const char *const nodes[][4] = {
        {"label", "design.label", "design.label.class", "design.label.style"},
        {"wrapper", "design.wrapper", "design.wrapper.class", "design.wrapper.style"},
        {"group", "design.group", "design.group.class", "design.group.style"},
        {"prepend", "design.prepend", "design.prepend.class", "design.prepend.style"},
    };
    const ps_value *multiple = ps_get(spec, "multiple");
    if (multiple) {
        if (multiple->kind != PS_BOOL && multiple->kind != PS_OBJECT)
            return declaration_error("multiple", path, "a boolean or an object", error);
        for (size_t i = 0; multiple->kind == PS_OBJECT && i < 2; ++i) {
            const ps_value *value = ps_get(multiple, numbers[i][0]);
            if (value && value->kind != PS_INT && value->kind != PS_FLOAT)
                return declaration_error(numbers[i][1], path, "a number", error);
        }
        for (size_t i = 0; multiple->kind == PS_OBJECT && i < 2; ++i) {
            const ps_value *value = ps_get(multiple, booleans[i][0]);
            if (value && value->kind != PS_BOOL)
                return declaration_error(booleans[i][1], path, "a boolean", error);
        }
        if (multiple->kind == PS_OBJECT && ps_has(multiple, "title")) {
            if (!ps_is_string(ps_get(spec, "type"), "group"))
                return declaration_error("multiple.title", path, "a repeated group", error);
            const ps_value *title = ps_get(multiple, "title");
            const ps_value *properties = ps_get(spec, "properties");
            const ps_value *child = title->kind == PS_STRING && properties &&
                properties->kind == PS_OBJECT ? ps_get(properties, ps_string(title)) : NULL;
            if (!scalar_child(child))
                return declaration_error("multiple.title", path,
                    "the name of a direct child field without multiple, properties or lang", error);
        }
        if (multiple->kind == PS_OBJECT && ps_has(multiple, "controls") &&
            !one_of(ps_get(multiple, "controls"), placements, 3))
            return declaration_error("multiple.controls", path, "header, footer or outline", error);
        if (multiple->kind == PS_OBJECT && ps_has(multiple, "header") &&
            !one_of(ps_get(multiple, "header"), headers, 2))
            return declaration_error("multiple.header", path, "static or sticky", error);
    }
    const ps_value *lang = ps_get(spec, "lang");
    if (lang && lang->kind != PS_BOOL && lang->kind != PS_OBJECT)
        return declaration_error("lang", path, "a boolean or an object", error);
    const ps_value *only = lang && lang->kind == PS_OBJECT ? ps_get(lang, "only") : NULL;
    if (only && only->kind != PS_OBJECT) {
        bool codes = only->kind == PS_ARRAY;
        for (size_t i = 0; codes && i < ps_size(only); ++i)
            codes = ps_at(only, i)->kind == PS_STRING;
        if (!codes)
            return declaration_error("lang.only", path, "a list of language codes or an object", error);
    }
    const ps_value *design = ps_get(spec, "design");
    if (!design) return true;
    if (design->kind != PS_BOOL && design->kind != PS_OBJECT)
        return declaration_error("design", path, "a boolean or an object", error);
    if (design->kind == PS_BOOL) return true;
    const ps_value *show = ps_get(design, "show");
    if (show && show->kind != PS_BOOL && !condition_value(show))
        return declaration_error("design.show", path, "an expression, a boolean or a condition map", error);
    for (size_t i = 0; i < 2; ++i) {
        const ps_value *value = ps_get(design, styles[i][0]);
        if (value && !condition_value(value))
            return declaration_error(styles[i][1], path, "a string or a condition map", error);
    }
    for (size_t i = 0; i < 4; ++i) {
        const ps_value *node = ps_get(design, nodes[i][0]);
        if (!node) continue;
        if (node->kind != PS_OBJECT)
            return declaration_error(nodes[i][1], path, "an object", error);
        for (size_t j = 0; j < 2; ++j) {
            const ps_value *value = ps_get(node, styles[j][0]);
            if (value && !condition_value(value))
                return declaration_error(nodes[i][2 + j], path, "a string or a condition map", error);
        }
    }
    return true;
}

static ps_value *compile_fields(const ps_value *properties, const char *parent,
                                ps_value **error)
{
    ps_value *fields = ps_array_value();
    if (!fields) return NULL;
    for (size_t i = 0; i < ps_size(properties); ++i) {
        const ps_value *raw = ps_at(properties, i);
        if (!raw || raw->kind != PS_OBJECT) continue;
        const char *name = ps_key_at(properties, i);
        char *path = *parent ? concat3(parent, ".", name) : concat3(name, "", "");
        if (!path || !declarations_valid(raw, path, error)) { free(path); goto fail; }
        ps_value *field = ps_object_value();
        ps_value *spec = ps_object_value();
        if (!field || !spec) { free(path); ps_value_free(field); ps_value_free(spec); goto fail; }
        for (size_t j = 0; j < ps_size(raw); ++j) {
            const char *key = ps_key_at(raw, j);
            if (strcmp(key, "properties") &&
                !ps_set(spec, key, ps_value_clone(ps_at(raw, j)))) {
                free(path); ps_value_free(field); ps_value_free(spec); goto fail;
            }
        }
        const ps_value *children_input = ps_get(raw, "properties");
        ps_value *children = children_input && children_input->kind == PS_OBJECT
            ? compile_fields(children_input, path, error) : ps_array_value();
        free(path);
        if (!children ||
            !ps_set(field, "name", ps_string_value(ps_key_at(properties, i))) ||
            !ps_set(field, "spec", spec) ||
            !ps_set(field, "children", children) || !ps_append(fields, field)) {
            ps_value_free(field); goto fail;
        }
    }
    return fields;
fail:
    ps_value_free(fields); return NULL;
}

ps_result ps_compile_form(const ps_value *spec, const ps_value *options)
{
    if (!spec || spec->kind != PS_OBJECT || !ps_is_string(ps_get(spec, "type"), "group") ||
        !ps_get(spec, "properties") || ps_get(spec, "properties")->kind != PS_OBJECT)
        return input_error("A form spec must be a group with properties");
    if (!options || options->kind != PS_OBJECT) return input_error("Expected an object");

    const ps_value *files = option(options, "files");
    ps_value *empty_files = NULL;
    if (!files || (files->kind == PS_ARRAY && ps_size(files) == 0))
        files = empty_files = ps_object_value();
    if (!files || files->kind != PS_OBJECT) {
        ps_value_free(empty_files); return input_error("files must be an object");
    }
    const char *basepath = NULL;
    const char *key_prefix = NULL;
    ps_result error = {0};
    if (!option_string(options, "basepath", &basepath, &error) ||
        !option_string(options, "keyPrefix", &key_prefix, &error)) {
        ps_value_free(empty_files); return error;
    }

    ps_value *composition_error_value = NULL;
    ps_value *properties = ps_compose_properties(ps_get(spec, "properties"), files,
        basepath ? basepath : "", &composition_error_value);
    ps_value_free(empty_files);
    if (!properties) {
        if (composition_error_value) return (ps_result){NULL, composition_error_value};
        return ps_fail("internal", "INTERNAL_ERROR", "C form compilation failed", "");
    }
    ps_value *declaration_failure = NULL;
    ps_value *fields = compile_fields(properties, "", &declaration_failure);
    ps_value_free(properties);
    if (!fields && declaration_failure) return (ps_result){NULL, declaration_failure};
    ps_value *template = ps_object_value();
    if (!template || !fields ||
        !ps_set(template, "kind", ps_string_value("crudui/form-template")) ||
        (key_prefix && !ps_set(template, "keyPrefix", ps_string_value(key_prefix))) ||
        !ps_set(template, "fields", fields)) {
        ps_value_free(template); ps_value_free(fields);
        return ps_fail("internal", "INTERNAL_ERROR", "C form compilation failed", "");
    }
    return ps_ok(template);
}
