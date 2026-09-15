#include "engine_internal.h"

#include <stdio.h>
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

/* Reject the first member of a closed bucket object that is not an allowed key:
   "Invalid <bucket>.<key> at <path>: unknown key". Returns true when every key is allowed. */
static bool known_keys(const ps_value *bucket, const char *name, const char *const *allowed,
                       size_t count, const char *path, ps_value **error)
{
    for (size_t i = 0; i < ps_size(bucket); ++i) {
        const char *key = ps_key_at(bucket, i);
        bool known = false;
        for (size_t j = 0; !known && j < count; ++j) known = !strcmp(key, allowed[j]);
        if (known) continue;
        char *head = concat3("Invalid ", name, ".");
        char *middle = head ? concat3(head, key, " at ") : NULL;
        char *message = middle ? concat3(middle, path, ": unknown key") : NULL;
        *error = message ? ps_error("form", "INVALID_FORM_INPUT", message, "", NULL) : NULL;
        free(head); free(middle); free(message);
        return false;
    }
    return true;
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

/* Reject a wrong value type or an unknown key in one field's multiple, lang, design and behavior declarations. */
static bool declarations_valid(const ps_value *spec, const char *path, ps_value **error)
{
    /* Buttons and the submission target belong to the form, not to a field. */
    static const char *const form_keys[] = {"buttons", "action"};
    for (size_t i = 0; i < 2; ++i)
        if (ps_has(spec, form_keys[i]))
            return declaration_error(form_keys[i], path, "the form root", error);
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
    static const char *const multiple_keys[] = {"min", "max", "copy", "sortable", "title", "controls", "header", "onclick"};
    static const char *const lang_keys[] = {"mode", "only", "name", "key", "frame", "title", "group_class"};
    static const char *const design_keys[] = {"show", "class", "style", "label", "wrapper", "group", "prepend"};
    static const char *const node_keys[] = {"class", "style"};
    static const char *const behavior_keys[] = {"onchange", "onclick", "onload"};
    const ps_value *multiple = ps_get(spec, "multiple");
    if (multiple) {
        if (multiple->kind != PS_BOOL && multiple->kind != PS_OBJECT)
            return declaration_error("multiple", path, "a boolean or an object", error);
        if (multiple->kind == PS_OBJECT && !known_keys(multiple, "multiple", multiple_keys, 8, path, error))
            return false;
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
    if (lang && lang->kind == PS_OBJECT && !known_keys(lang, "lang", lang_keys, 7, path, error))
        return false;
    const ps_value *only = lang && lang->kind == PS_OBJECT ? ps_get(lang, "only") : NULL;
    if (only && only->kind != PS_OBJECT) {
        bool codes = only->kind == PS_ARRAY;
        for (size_t i = 0; codes && i < ps_size(only); ++i)
            codes = ps_at(only, i)->kind == PS_STRING;
        if (!codes)
            return declaration_error("lang.only", path, "a list of language codes or an object", error);
    }
    const ps_value *design = ps_get(spec, "design");
    if (design && design->kind != PS_BOOL && design->kind != PS_OBJECT)
        return declaration_error("design", path, "a boolean or an object", error);
    if (design && design->kind == PS_OBJECT) {
        if (!known_keys(design, "design", design_keys, 7, path, error)) return false;
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
            if (!known_keys(node, nodes[i][1], node_keys, 2, path, error)) return false;
            for (size_t j = 0; j < 2; ++j) {
                const ps_value *value = ps_get(node, styles[j][0]);
                if (value && !condition_value(value))
                    return declaration_error(nodes[i][2 + j], path, "a string or a condition map", error);
            }
        }
    }
    const ps_value *behavior = ps_get(spec, "behavior");
    return !behavior || behavior->kind != PS_OBJECT ||
        known_keys(behavior, "behavior", behavior_keys, 3, path, error);
}

/* Reject a wrong root action or buttons declaration. */
static bool form_declarations_valid(const ps_value *spec, ps_value **error)
{
    static const char *const types[] = {"submit", "reset", "button", "link"};
    /* Button types with interface text (the submit and reset messages); template.c
       links only value, engine_error and compose, so it cannot read the messages table. */
    static const char *const texts[] = {"submit", "reset"};
    static const char *const action_keys[][2] = {
        {"method", "action.method"}, {"url", "action.url"}, {"enctype", "action.enctype"},
    };
    static const char *const strings[] = {"name", "value", "href"};
    const ps_value *action = ps_get(spec, "action");
    if (action) {
        if (action->kind != PS_OBJECT) return declaration_error("action", "form", "an object", error);
        for (size_t i = 0; i < 3; ++i) {
            const ps_value *value = ps_get(action, action_keys[i][0]);
            if (value && value->kind != PS_STRING)
                return declaration_error(action_keys[i][1], "form", "a string", error);
        }
    }
    const ps_value *buttons = ps_get(spec, "buttons");
    if (!buttons) return true;
    if (buttons->kind != PS_ARRAY) return declaration_error("buttons", "form", "a list of buttons", error);
    for (size_t i = 0; i < ps_size(buttons); ++i) {
        const ps_value *button = ps_at(buttons, i);
        char key[64], path[64];
        snprintf(key, sizeof(key), "buttons.%zu", i);
        if (!button || button->kind != PS_OBJECT) return declaration_error(key, "form", "an object", error);
        const ps_value *type = ps_get(button, "type");
        snprintf(key, sizeof(key), "buttons.%zu.type", i);
        if (!one_of(type, types, 4))
            return declaration_error(key, "form", "submit, reset, button or link", error);
        for (size_t j = 0; j < 3; ++j) {
            const ps_value *value = ps_get(button, strings[j]);
            snprintf(key, sizeof(key), "buttons.%zu.%s", i, strings[j]);
            if (value && value->kind != PS_STRING) return declaration_error(key, "form", "a string", error);
        }
        snprintf(key, sizeof(key), "buttons.%zu.text", i);
        if (!one_of(type, texts, 2) && !ps_has(button, "text"))
            return declaration_error(key, "form", "content for this button type", error);
        snprintf(key, sizeof(key), "buttons.%zu.href", i);
        if (ps_is_string(type, "link") && !ps_has(button, "href"))
            return declaration_error(key, "form", "a link target", error);
        snprintf(path, sizeof(path), "form.buttons.%zu", i);
        if (!declarations_valid(button, path, error)) return false;
    }
    return true;
}

/* The buttons of a form whose spec declares none: one submit button. */
static ps_value *default_buttons(void)
{
    ps_value *buttons = ps_array_value();
    ps_value *submit = ps_object_value();
    if (!buttons || !submit || !ps_set(submit, "type", ps_string_value("submit")) || !ps_append(buttons, submit)) {
        ps_value_free(buttons); ps_value_free(submit); return NULL;
    }
    return buttons;
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
    ps_value *form_failure = NULL;
    if (!form_declarations_valid(spec, &form_failure))
        return form_failure ? (ps_result){NULL, form_failure}
                            : ps_fail("internal", "INTERNAL_ERROR", "C form compilation failed", "");
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
    const ps_value *declared_buttons = ps_get(spec, "buttons");
    const ps_value *action = ps_get(spec, "action");
    ps_value *buttons = declared_buttons ? ps_value_clone(declared_buttons) : default_buttons();
    if (!template || !fields || !buttons ||
        !ps_set(template, "kind", ps_string_value("crudui/form-template")) ||
        (key_prefix && !ps_set(template, "keyPrefix", ps_string_value(key_prefix))) ||
        !ps_set(template, "fields", fields) ||
        !ps_set(template, "buttons", buttons) ||
        (action && action->kind == PS_OBJECT && !ps_set(template, "action", ps_value_clone(action)))) {
        ps_value_free(template);
        return ps_fail("internal", "INTERNAL_ERROR", "C form compilation failed", "");
    }
    return ps_ok(template);
}
