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
    ps_value_free(bad); ps_value_free(options); ps_value_free(spec);
    return 0;
}
