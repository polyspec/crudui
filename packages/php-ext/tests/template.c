#include "engine_internal.h"

#include <assert.h>
#include <string.h>

static ps_value *object(void) { ps_value *v = ps_object_value(); assert(v); return v; }
static ps_value *array(void) { ps_value *v = ps_array_value(); assert(v); return v; }
static void set(ps_value *v, const char *k, ps_value *x) { assert(x && ps_set(v, k, x)); }

static ps_value *field(const char *type)
{
    ps_value *value = object(); set(value, "type", ps_string_value(type)); return value;
}

int main(void)
{
    ps_value *files = object();
    ps_value *base_doc = object();
    ps_value *base_properties = object();
    ps_value *first = field("text");
    ps_value *validate = object(); set(validate, "required", ps_bool_value(false));
    set(first, "validate", validate);
    set(base_properties, "first", first);
    set(base_properties, "removed", field("email"));
    set(base_doc, "properties", base_properties);
    set(files, "base.yml", base_doc);

    ps_value *spec = object(); set(spec, "type", ps_string_value("group"));
    ps_value *properties = object();
    set(properties, "$ref", ps_string_value("base.yml"));
    ps_value *patch = object();
    set(patch, "first.validate.required", ps_bool_value(true));
    ps_value *remove = array(); assert(ps_append(remove, ps_string_value("removed")));
    set(patch, "remove", remove); set(properties, "$patch", patch);
    ps_value *group = field("group");
    ps_value *children = object(); set(children, "child", field("integer"));
    set(group, "properties", children); set(properties, "group", group);
    set(spec, "properties", properties);

    ps_value *options = object(); set(options, "files", files);
    set(options, "keyPrefix", ps_string_value("form"));
    ps_result result = ps_compile_form(spec, options);
    assert(result.value && !result.error);
    assert(ps_is_string(ps_get(result.value, "kind"), "crudui/form-template"));
    assert(ps_is_string(ps_get(result.value, "keyPrefix"), "form"));
    const ps_value *fields = ps_get(result.value, "fields");
    assert(fields && fields->kind == PS_ARRAY && ps_size(fields) == 2);
    assert(ps_is_string(ps_get(ps_at(fields, 0), "name"), "first"));
    assert(ps_get(ps_get(ps_at(fields, 0), "spec"), "validate"));
    assert(ps_truthy(ps_get(ps_get(ps_get(ps_at(fields, 0), "spec"), "validate"), "required")));
    assert(ps_is_string(ps_get(ps_at(fields, 1), "name"), "group"));
    assert(ps_size(ps_get(ps_at(fields, 1), "children")) == 1);
    assert(!ps_get(ps_get(ps_at(fields, 1), "spec"), "properties"));
    ps_value_free(result.value);

    ps_value *bad = object(); set(bad, "type", ps_string_value("group"));
    ps_value *bad_properties = object(); set(bad_properties, "$ref", ps_string_value("missing.yml"));
    set(bad, "properties", bad_properties);
    result = ps_compile_form(bad, options);
    assert(!result.value && result.error);
    assert(ps_is_string(ps_get(result.error, "kind"), "compose"));
    assert(ps_is_string(ps_get(result.error, "code"), "REF_FILE_NOT_FOUND"));
    assert(ps_is_string(ps_get(result.error, "at"), "missing.yml"));
    ps_value_free(result.error);
    ps_value_free(bad);

    /* multiple.title, multiple.controls and multiple.header declarations. */
    const struct { const char *type; const char *key; ps_value *value; const char *message; } rejected[] = {
        {"text", "title", ps_string_value("name"),
         "Invalid multiple.title at rows: expected a repeated group"},
        {"group", "title", ps_string_value("missing"),
         "Invalid multiple.title at rows: expected the name of a direct child field without multiple, properties or lang"},
        {"group", "title", ps_string_value("nested"),
         "Invalid multiple.title at rows: expected the name of a direct child field without multiple, properties or lang"},
        {"group", "controls", ps_string_value("side"),
         "Invalid multiple.controls at rows: expected header, footer or outline"},
        {"group", "header", ps_bool_value(true),
         "Invalid multiple.header at rows: expected static or sticky"},
    };
    for (size_t i = 0; i < sizeof(rejected) / sizeof(rejected[0]); ++i) {
        ps_value *rows = field(rejected[i].type);
        ps_value *multiple = object(); set(multiple, rejected[i].key, rejected[i].value);
        set(rows, "multiple", multiple);
        ps_value *row_properties = object(); set(row_properties, "name", field("text"));
        set(row_properties, "nested", field("group"));
        set(rows, "properties", row_properties);
        ps_value *declared = object(); set(declared, "type", ps_string_value("group"));
        ps_value *declared_properties = object(); set(declared_properties, "rows", rows);
        set(declared, "properties", declared_properties);
        result = ps_compile_form(declared, options);
        assert(!result.value && result.error);
        assert(ps_is_string(ps_get(result.error, "code"), "INVALID_FORM_INPUT"));
        assert(ps_is_string(ps_get(result.error, "message"), rejected[i].message));
        ps_value_free(result.error); ps_value_free(declared);
    }
    /* lang must be a boolean or an object, checked after multiple and before design. */
    const struct { ps_value *multiple; ps_value *lang; const char *message; } languages[] = {
        {NULL, ps_null_value(), "Invalid lang at rows: expected a boolean or an object"},
        {NULL, ps_string_value("ko"), "Invalid lang at rows: expected a boolean or an object"},
        {NULL, array(), "Invalid lang at rows: expected a boolean or an object"},
        {ps_string_value("yes"), ps_null_value(), "Invalid multiple at rows: expected a boolean or an object"},
    };
    for (size_t i = 0; i < sizeof(languages) / sizeof(languages[0]); ++i) {
        ps_value *rows = field("text");
        if (languages[i].multiple) set(rows, "multiple", languages[i].multiple);
        set(rows, "lang", languages[i].lang);
        ps_value *invalid_design = object(); set(invalid_design, "show", ps_int_value(1));
        set(rows, "design", invalid_design);
        ps_value *declared = object(); set(declared, "type", ps_string_value("group"));
        ps_value *declared_properties = object(); set(declared_properties, "rows", rows);
        set(declared, "properties", declared_properties);
        result = ps_compile_form(declared, options);
        assert(!result.value && result.error);
        assert(ps_is_string(ps_get(result.error, "message"), languages[i].message));
        ps_value_free(result.error); ps_value_free(declared);
    }
    /* lang.only must be a list of string codes (empty allowed) or an object. */
    ps_value *mixed = array(); assert(ps_append(mixed, ps_string_value("ko")) && ps_append(mixed, ps_int_value(3)));
    ps_value *many = array();
    for (size_t i = 0; i < 6; ++i) assert(ps_append(many, ps_string_value(i % 2 ? "en" : "ko")));
    const struct { ps_value *only; bool valid; } codes[] = {
        {mixed, false}, {ps_string_value("ko"), false}, {ps_null_value(), false},
        {array(), true}, {object(), true}, {many, true},
    };
    for (size_t i = 0; i < sizeof(codes) / sizeof(codes[0]); ++i) {
        ps_value *rows = field("text");
        ps_value *language = object(); set(language, "only", codes[i].only);
        set(rows, "lang", language);
        ps_value *declared = object(); set(declared, "type", ps_string_value("group"));
        ps_value *declared_properties = object(); set(declared_properties, "rows", rows);
        set(declared, "properties", declared_properties);
        result = ps_compile_form(declared, options);
        if (codes[i].valid) {
            assert(result.value && !result.error);
            ps_value_free(result.value);
        } else {
            assert(!result.value && result.error);
            assert(ps_is_string(ps_get(result.error, "message"),
                "Invalid lang.only at rows: expected a list of language codes or an object"));
            ps_value_free(result.error);
        }
        ps_value_free(declared);
    }
    ps_value_free(options); ps_value_free(spec);
    return 0;
}
