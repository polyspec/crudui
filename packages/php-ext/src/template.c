#include "engine_internal.h"

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

static ps_value *compile_fields(const ps_value *properties)
{
    ps_value *fields = ps_array_value();
    if (!fields) return NULL;
    for (size_t i = 0; i < ps_size(properties); ++i) {
        const ps_value *raw = ps_at(properties, i);
        if (!raw || raw->kind != PS_OBJECT) continue;
        ps_value *field = ps_object_value();
        ps_value *spec = ps_object_value();
        if (!field || !spec) { ps_value_free(field); ps_value_free(spec); goto fail; }
        for (size_t j = 0; j < ps_size(raw); ++j) {
            const char *key = ps_key_at(raw, j);
            if (strcmp(key, "properties") &&
                !ps_set(spec, key, ps_value_clone(ps_at(raw, j)))) {
                ps_value_free(field); ps_value_free(spec); goto fail;
            }
        }
        const ps_value *children_input = ps_get(raw, "properties");
        ps_value *children = children_input && children_input->kind == PS_OBJECT
            ? compile_fields(children_input) : ps_array_value();
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
    ps_value *template = ps_object_value();
    ps_value *fields = compile_fields(properties);
    ps_value_free(properties);
    if (!template || !fields ||
        !ps_set(template, "kind", ps_string_value("crudui/form-template")) ||
        (key_prefix && !ps_set(template, "keyPrefix", ps_string_value(key_prefix))) ||
        !ps_set(template, "fields", fields)) {
        ps_value_free(template); ps_value_free(fields);
        return ps_fail("internal", "INTERNAL_ERROR", "C form compilation failed", "");
    }
    return ps_ok(template);
}
