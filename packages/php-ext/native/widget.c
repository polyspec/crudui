#include "engine_internal.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    const ps_value *spec;
    const ps_value *value;
    bool value_present;
    const char *path;
    const ps_value *design;
    const char *key_prefix;
    const char *id;
    const char *language;
    const size_t *rows;
    size_t row_count;
} widget_context;

static bool set_string(ps_value *object, const char *key, const char *value)
{
    return ps_set(object, key, ps_string_value(value ? value : ""));
}

static bool set_text(ps_value *object, const char *key, char *value)
{
    bool result = value && set_string(object, key, value);
    free(value); return result;
}

static bool set_nonempty(ps_value *object, const char *key, char *value)
{
    if (!value) return false;
    bool result = !*value || set_string(object, key, value);
    free(value); return result;
}

static const ps_value *member(const ps_value *object, const char *key)
{
    return object && object->kind == PS_OBJECT ? ps_get(object, key) : NULL;
}

static const char *string_member(const ps_value *object, const char *key)
{
    const ps_value *value = member(object, key);
    return value && value->kind == PS_STRING ? ps_string(value) : "";
}

static const ps_value *design_node(const widget_context *context, const char *name)
{
    const ps_value *node = *name ? member(context->design, name) : context->design;
    return node && node->kind == PS_OBJECT ? node : NULL;
}

static char *context_class(const widget_context *context, const char *base)
{
    return ps_join_classes(base, string_member(design_node(context, "main"), "class"), NULL);
}

static char *context_style(const widget_context *context)
{
    return ps_style_string(string_member(design_node(context, "main"), "style"));
}

static char *context_name(const widget_context *context)
{
    return ps_bracket_name(context->path, context->key_prefix);
}

static char *context_text(const widget_context *context, const char *key)
{
    return ps_translate(member(context->spec, key), context->language);
}

static char *context_option(const widget_context *context, const char *key,
                            const char *default_value)
{
    const ps_value *options = member(context->spec, "options");
    const ps_value *value = member(options, key);
    return value && value->kind != PS_NULL ? ps_scalar_string(value)
        : ps_string_join(default_value ? default_value : "", "", "");
}

static char *context_value(const widget_context *context)
{
    const ps_value *value = context->value_present ? context->value
        : member(context->spec, "default");
    return ps_scalar_string(value);
}

static char *behavior_script(const widget_context *context, const char *action)
{
    const ps_value *entry = member(member(context->spec, "behavior"), action);
    if (entry && entry->kind == PS_STRING) return ps_string_join(ps_string(entry), "", "");
    const ps_value *script = member(entry, "script");
    return script && script->kind == PS_STRING
        ? ps_string_join(ps_string(script), "", "")
        : ps_string_join("", "", "");
}

static bool add_behavior(const widget_context *context, ps_value *attrs)
{
    const ps_value *behavior = member(context->spec, "behavior");
    if (!behavior || behavior->kind != PS_OBJECT) return true;
    for (size_t i = 0; i < ps_size(behavior); ++i) {
        char *script = behavior_script(context, ps_key_at(behavior, i));
        if (!script) return false;
        if (*script && !set_string(attrs, ps_key_at(behavior, i), script)) { free(script); return false; }
        free(script);
    }
    return true;
}

static bool add_data(const widget_context *context, ps_value *attrs)
{
    char *leaf = ps_leaf_name(context->path, context->rows, context->row_count);
    char *rule = ps_rule_name(context->path, context->rows, context->row_count);
    char *default_value = ps_scalar_string(member(context->spec, "default"));
    if (!leaf || !rule || !default_value) { free(leaf); free(rule); free(default_value); return false; }
    bool result = set_string(attrs, "data-name", leaf) &&
        set_string(attrs, "data-rule-name", rule) &&
        set_string(attrs, "data-default", default_value);
    free(leaf); free(rule); free(default_value); return result;
}

static bool set_affix(const widget_context *context, ps_value *model,
                      const char *kind, bool enabled)
{
    if (!enabled) return true;
    char *text = context_text(context, kind);
    if (!text) return false;
    if (!*text) { free(text); return true; }
    ps_value *affix = ps_object_value();
    char *class_name = !strcmp(kind, "prepend")
        ? ps_join_classes("input-group-text",
            string_member(design_node(context, "prepend"), "class"), NULL)
        : ps_string_join("input-group-text", "", "");
    char *style = !strcmp(kind, "prepend")
        ? ps_style_string(string_member(design_node(context, "prepend"), "style")) : NULL;
    bool result = affix && class_name && set_string(affix, "text", text) &&
        set_string(affix, "class", class_name) &&
        (!style || !*style || set_string(affix, "style", style)) &&
        ps_set(model, kind, affix);
    if (!result) ps_value_free(affix);
    free(text); free(class_name); free(style); return result;
}

static const char *canonical_kind(const char *name)
{
    if (!strcmp(name, "text") || !strcmp(name, "string")) return "text";
    if (!strcmp(name, "integer") || !strcmp(name, "float") ||
        !strcmp(name, "decimal") || !strcmp(name, "number")) return "number";
    if (!strcmp(name, "select") || !strcmp(name, "dropdown") ||
        !strcmp(name, "selectbox")) return "select";
    if (!strcmp(name, "choice") || !strcmp(name, "radio")) return "choice";
    if (!strcmp(name, "multichoice") || !strcmp(name, "checkboxes") ||
        !strcmp(name, "checkcontainer")) return "multichoice";
    if (!strcmp(name, "datetime-local") || !strcmp(name, "datetime")) return "datetime";
    if (!strcmp(name, "html") || !strcmp(name, "static") || !strcmp(name, "dummy")) return "dummy";
    if (!strcmp(name, "cover-simple") || !strcmp(name, "cover")) return "cover";
    if (!strcmp(name, "search") || !strcmp(name, "autocomplete")) return "search";
    if (!strcmp(name, "tinymce") || !strcmp(name, "wysiwyg")) return "tinymce";
    if (!strcmp(name, "button") || !strcmp(name, "action")) return "button";
    const char *direct[] = {"email","password","textarea","hidden","date",
        "dummy-input","image","file","image-viewer","summernote",
        "editorjs","tui","tagify","tagify2"};
    for (size_t i = 0; i < sizeof(direct) / sizeof(direct[0]); ++i)
        if (!strcmp(name, direct[i])) return direct[i];
    return NULL;
}

static ps_value *source_model(const ps_value *items)
{
    if (!items || items->kind != PS_OBJECT || !ps_has(items, "model")) return NULL;
    ps_value *source = ps_object_value();
    char *model = ps_scalar_string(member(items, "model"));
    char *method = ps_scalar_string(member(items, "method"));
    char *table = ps_scalar_string(member(items, "table"));
    const ps_value *relations_value = member(items, "relations");
    char *relations = relations_value && relations_value->kind != PS_NULL
        ? ps_json_string(relations_value) : ps_string_join("[]", "", "");
    if (!source || !model || !method || !table || !relations ||
        !set_string(source, "data-source-model", model) ||
        !set_string(source, "data-source-method", method) ||
        !set_string(source, "data-source-table", table) ||
        !set_string(source, "data-source-relations", relations)) {
        ps_value_free(source); source = NULL;
    }
    free(model); free(method); free(table); free(relations); return source;
}

static bool extend_object(ps_value *target, const ps_value *source)
{
    if (!source) return true;
    for (size_t i = 0; i < ps_size(source); ++i)
        if (!ps_set(target, ps_key_at(source, i), ps_value_clone(ps_at(source, i)))) return false;
    return true;
}

static bool selected_value(const widget_context *context, const char *key, bool multiple)
{
    const ps_value *value = context->value_present ? context->value : member(context->spec, "default");
    if (multiple && value && value->kind == PS_ARRAY) {
        for (size_t i = 0; i < ps_size(value); ++i) {
            char *candidate = context->value_present ? ps_js_string(ps_at(value, i))
                                                     : ps_scalar_string(ps_at(value, i));
            bool match = candidate && !strcmp(candidate, key);
            free(candidate); if (match) return true;
        }
        return false;
    }
    if (multiple && !ps_truthy(value)) return false;
    char *candidate = multiple ? ps_js_string(value) : context_value(context);
    bool result = candidate && !strcmp(candidate, key);
    free(candidate); return result;
}

static ps_value *option_models(const widget_context *context, bool multiple, bool choice)
{
    const ps_value *items = member(context->spec, "items");
    ps_value *options = ps_array_value();
    if (!options) return NULL;
    if (!items || (items->kind != PS_ARRAY && items->kind != PS_OBJECT) ||
        (items->kind == PS_OBJECT && ps_has(items, "model"))) return options;
    const ps_value *default_value = member(context->spec, "default");
    char *default_text = default_value && default_value->kind != PS_ARRAY &&
        default_value->kind != PS_NULL ? ps_scalar_string(default_value) : NULL;
    for (size_t i = 0; i < ps_size(items); ++i) {
        char index[32];
        const char *key = items->kind == PS_OBJECT ? ps_key_at(items, i)
            : (snprintf(index, sizeof(index), "%zu", i), index);
        const ps_value *entry = ps_at(items, i);
        char *label = ps_translate(entry, context->language);
        if (label && !*label) { free(label); label = ps_scalar_string(entry); }
        ps_value *option = ps_object_value();
        bool ok = label && option && set_string(option, "value", key) &&
            set_string(option, "label", label) &&
            ps_set(option, "selected", ps_bool_value(selected_value(context, key, multiple))) &&
            ps_set(option, "isDefault", ps_bool_value(choice && default_text && !strcmp(default_text, key))) &&
            ps_append(options, option);
        free(label);
        if (!ok) { ps_value_free(option); ps_value_free(options); free(default_text); return NULL; }
    }
    free(default_text); return options;
}

static ps_value *empty_option(void)
{
    ps_value *option = ps_object_value();
    if (!option || !set_string(option, "value", "") ||
        !set_string(option, "label", "select") ||
        !ps_set(option, "selected", ps_bool_value(false)) ||
        !ps_set(option, "isDefault", ps_bool_value(false))) {
        ps_value_free(option); return NULL;
    }
    return option;
}

static char *script_quote(const char *value)
{
    char *quoted = ps_json_quote(value);
    if (!quoted) return NULL;
    size_t extra = 0;
    for (const char *cursor = quoted; *cursor; ++cursor) if (*cursor == '<') extra += 5;
    if (!extra) return quoted;
    size_t length = strlen(quoted);
    char *escaped = malloc(length + extra + 1);
    if (!escaped) { free(quoted); return NULL; }
    char *out = escaped;
    for (const char *cursor = quoted; *cursor; ++cursor) {
        if (*cursor == '<') { memcpy(out, "\\u003c", 6); out += 6; }
        else *out++ = *cursor;
    }
    *out = '\0'; free(quoted); return escaped;
}

static ps_value *text_control(const char *kind, const widget_context *context)
{
    bool textarea = !strcmp(kind, "textarea"), hidden = !strcmp(kind, "hidden");
    bool password = !strcmp(kind, "password"), dummy = !strcmp(kind, "dummy-input");
    bool date = !strcmp(kind, "date") || !strcmp(kind, "datetime");
    ps_value *attrs = ps_object_value();
    char *name = context_name(context);
    char *value = password ? ps_scalar_string(context->value_present ? context->value : NULL)
                           : context_value(context);
    if (date && value) { char *formatted = ps_format_date(value, !strcmp(kind, "datetime")); free(value); value = formatted; }
    char *class_name = context_class(context, hidden ? "valid-target" :
        dummy ? "form-control" : "valid-target form-control");
    bool ok = attrs && name && value && class_name;
    if (ok && !textarea) ok = set_string(attrs, "type", dummy ? "text" :
        !strcmp(kind, "datetime") ? "datetime-local" : kind);
    if (ok) ok = set_string(attrs, "name", name);
    if (ok && !textarea) ok = set_string(attrs, "value", value);
    if (ok && dummy) ok = set_string(attrs, "readonly", "");
    if (ok) ok = set_string(attrs, "class", class_name);
    if (ok && textarea) ok = set_string(attrs, "rows", "5");
    if (ok && !textarea && !hidden && !password && !date)
        ok = set_nonempty(attrs, "placeholder", context_text(context, "placeholder"));
    if (ok && !hidden) ok = set_nonempty(attrs, "style", context_style(context));
    if (ok && !password && !hidden && !dummy) ok = add_behavior(context, attrs);
    if (ok && dummy) ok = set_text(attrs, "data-default", ps_scalar_string(member(context->spec, "default")));
    else if (ok) ok = add_data(context, attrs);
    ps_value *model = ps_object_value();
    const char *layout = hidden || password || !strcmp(kind, "datetime") ? "bare" : "input-group";
    if (ok) ok = model && set_string(model, "kind", kind) && set_string(model, "layout", layout) &&
        set_string(model, "tag", textarea ? "textarea" : "input") &&
        (!textarea || set_string(model, "text", value)) && ps_set(model, "attrs", attrs);
    if (ok) attrs = NULL;
    if (ok && !strcmp(layout, "input-group"))
        ok = set_affix(context, model, "prepend", true) && set_affix(context, model, "append", true);
    free(name); free(value); free(class_name);
    if (!ok) { ps_value_free(attrs); ps_value_free(model); return NULL; }
    return model;
}

static ps_value *select_control(const widget_context *context)
{
    ps_value *source = source_model(member(context->spec, "items"));
    ps_value *attrs = ps_object_value();
    char *name = context_name(context);
    char *class_name = context_class(context, source ? "valid-target form-select valid-target-async" : "valid-target form-select");
    bool ok = attrs && name && class_name && set_string(attrs, "name", name) &&
        set_string(attrs, "class", class_name) && extend_object(attrs, source) &&
        set_nonempty(attrs, "style", context_style(context)) && add_behavior(context, attrs) &&
        add_data(context, attrs);
    ps_value *options = ok ? option_models(context, false, false) : NULL;
    if (options && !ps_size(options) && !ps_append(options, empty_option())) ok = false;
    ps_value *model = ps_object_value();
    if (ok) ok = options && model && set_string(model, "kind", "select") &&
        set_string(model, "layout", "input-group") && set_string(model, "tag", "select") &&
        ps_set(model, "attrs", attrs);
    if (ok) attrs = NULL;
    if (ok) ok = ps_set(model, "source", source ? source : ps_null_value());
    if (ok) source = NULL;
    if (ok) ok = ps_set(model, "options", options);
    if (ok) options = NULL;
    if (ok) ok = set_affix(context, model, "prepend", true) && set_affix(context, model, "append", true);
    free(name); free(class_name);
    if (!ok) { ps_value_free(attrs); ps_value_free(source); ps_value_free(options); ps_value_free(model); return NULL; }
    return model;
}

static ps_value *choices(const char *kind, const widget_context *context)
{
    bool multiple = !strcmp(kind, "multichoice");
    ps_value *source = source_model(member(context->spec, "items"));
    ps_value *attrs = ps_object_value();
    bool ok = attrs && set_string(attrs, "class", multiple ?
        "btn-group flex-wrap btn-group-toggle" : "btn-group btn-group-toggle");
    if (ok && !multiple) ok = set_string(attrs, "data-toggle", "buttons");
    if (ok) ok = extend_object(attrs, source);
    ps_value *options = ok ? option_models(context, multiple, !multiple) : NULL;
    char *label_class = context_class(context, multiple ? "btn btn-switch btn-mswitch" : "btn btn-switch");
    ps_value *model = ps_object_value();
    if (ok) ok = options && label_class && model && set_string(model, "kind", kind) &&
        set_string(model, "layout", "btn-group") && ps_set(model, "attrs", attrs);
    if (ok) attrs = NULL;
    if (ok) ok = ps_set(model, "source", source ? source : ps_null_value());
    if (ok) source = NULL;
    if (ok) ok = ps_set(model, "options", options);
    if (ok) options = NULL;
    if (ok) ok = set_string(model, "itemLabelClass", label_class);
    if (ok && !member(model, "source")) ok = false;
    if (ok && ps_get(model, "source")->kind == PS_NULL) {
        ps_value *extra = ps_object_value(), *input = ps_object_value();
        char *name = context_name(context);
        char *full_name = multiple && name ? ps_string_join(name, "[]", "") : name ? ps_string_join(name, "", "") : NULL;
        char *leaf = ps_leaf_name(context->path, context->rows, context->row_count);
        char *rule = ps_rule_name(context->path, context->rows, context->row_count);
        ok = extra && input && full_name && leaf && rule && set_string(input, "name", full_name) &&
            set_string(input, "data-name", leaf) && set_string(input, "data-rule-name", rule);
        char *onchange = behavior_script(context, "onchange");
        char *onclick = behavior_script(context, "onclick");
        if (ok && onchange && *onchange) ok = set_string(input, "onchange", onchange);
        if (ok && !multiple && onclick && *onclick) ok = set_string(input, "onclick", onclick);
        if (ok) ok = ps_set(extra, "input", input);
        if (ok) input = NULL;
        if (ok) ok = ps_set(model, "extra", extra);
        if (ok) extra = NULL;
        free(name); free(full_name); free(leaf); free(rule); free(onchange); free(onclick);
        ps_value_free(input); ps_value_free(extra);
    }
    free(label_class);
    if (!ok) { ps_value_free(attrs); ps_value_free(source); ps_value_free(options); ps_value_free(model); return NULL; }
    return model;
}

static ps_value *file_control(const char *kind, const widget_context *context)
{
    bool cover = !strcmp(kind, "cover");
    const char *base = cover ? "valid-target form-control-file form-control-filetext form-control-image"
        : !strcmp(kind, "image") ? "valid-target form-control-file form-control-image"
        : "valid-target form-control-file";
    ps_value *file = ps_object_value();
    char *class_name = context_class(context, base);
    bool ok = file && class_name && set_string(file, "type", "file") &&
        set_string(file, "class", class_name);
    const char *sizes[] = {"max_width","min_width","max_height","min_height","preview_max_width","preview_max_height"};
    for (size_t i = 0; ok && i < sizeof(sizes) / sizeof(sizes[0]); ++i) {
        char output[64]; snprintf(output, sizeof(output), "data-%s", sizes[i]);
        for (char *cursor = output; *cursor; ++cursor) if (*cursor == '_') *cursor = '-';
        ok = set_text(file, output, context_option(context, sizes[i], "0"));
    }
    char *name = context_name(context);
    char *field_name = cover && name ? ps_string_join(name, "[name]", "") : name ? ps_string_join(name, "", "") : NULL;
    char *leaf = ps_leaf_name(context->path, context->rows, context->row_count);
    char *rule = ps_rule_name(context->path, context->rows, context->row_count);
    if (ok) ok = field_name && leaf && rule && set_string(file, "name", field_name) &&
        set_string(file, "data-name", leaf) && set_string(file, "data-rule-name", rule) &&
        add_behavior(context, file);
    if (ok && !cover) ok = set_string(file, "value", "");
    const ps_value *accept_value = member(member(context->spec, "validate"), "accept");
    if (!accept_value || accept_value->kind != PS_STRING || !*ps_string(accept_value))
        accept_value = member(member(context->spec, "options"), "accept");
    char *accept = accept_value ? ps_scalar_string(accept_value)
        : ps_string_join(!strcmp(kind, "file") ? "*/*" : "image/*", "", "");
    if (ok) ok = accept && set_string(file, "accept", accept);
    ps_value *extra = ps_object_value();
    if (ok && !cover) {
        ps_value *display = ps_object_value();
        ok = display && set_string(display, "type", "text") &&
            set_string(display, "class", "form-control form-control-file") &&
            set_string(display, "value", "") && set_string(display, "readonly", "") &&
            ps_set(extra, "display", display);
        if (!ok) ps_value_free(display);
    }
    if (ok) ok = ps_set(extra, "file", file);
    if (ok) file = NULL;
    ps_value *model = ps_object_value(), *empty_attrs = ps_object_value();
    if (ok) ok = model && empty_attrs && set_string(model, "kind", kind) &&
        set_string(model, "layout", "file") && ps_set(model, "attrs", empty_attrs);
    if (ok) empty_attrs = NULL;
    if (ok) ok = set_affix(context, model, "prepend", true);
    if (ok) ok = ps_set(model, "extra", extra);
    if (ok) extra = NULL;
    free(class_name); free(name); free(field_name); free(leaf); free(rule); free(accept);
    if (!ok) { ps_value_free(file); ps_value_free(extra); ps_value_free(empty_attrs); ps_value_free(model); return NULL; }
    return model;
}

static char *display_html(const widget_context *context, const char *kind)
{
    if (!strcmp(kind, "image-viewer")) {
        if (!context->value_present || !context->value || context->value->kind != PS_ARRAY || !ps_size(context->value))
            return ps_string_join("이미지가 없습니다.", "", "");
        char *height = context_option(context, "height", "");
        char *out = ps_string_join("", "", "");
        if (!height || !out) { free(height); free(out); return NULL; }
        for (size_t i = 0; i < ps_size(context->value); ++i) {
            char *source = ps_scalar_string(ps_at(context->value, i));
            char *tag = source ? ps_string_join("<img src=\"", source, "\"") : NULL;
            char *with_height = tag && *height ? ps_string_join(tag, " height=\"", height) : tag ? ps_string_join(tag, "", "") : NULL;
            char *closed = with_height ? ps_string_join(with_height, *height ? "\">" : ">", "") : NULL;
            char *next = closed ? ps_string_join(out, closed, "") : NULL;
            free(source); free(tag); free(with_height); free(closed); free(out); out = next;
            if (!out) break;
        }
        free(height); return out;
    }
    const ps_value *value = context->value_present ? context->value : member(context->spec, "default");
    const ps_value *items = member(context->spec, "items");
    if (items && items->kind == PS_OBJECT && !ps_has(items, "model")) {
        char *key = ps_scalar_string(value);
        const ps_value *found = key ? ps_get(items, key) : NULL;
        free(key); if (found) value = found;
    }
    char *text = ps_scalar_string(value);
    if (!text) return NULL;
    size_t extra = 0;
    for (size_t i = 0; text[i]; ++i) if (text[i] == '\r' || text[i] == '\n') extra += 6;
    if (!extra) return text;
    char *out = malloc(strlen(text) + extra + 1), *target = out;
    if (!out) { free(text); return NULL; }
    for (size_t i = 0; text[i]; ++i) {
        if (text[i] == '\r' || text[i] == '\n') { memcpy(target, "<br />", 6); target += 6; }
        *target++ = text[i];
    }
    *target = '\0'; free(text); return out;
}

static ps_value *display_control(const char *kind, const widget_context *context)
{
    ps_value *attrs = ps_object_value();
    bool ok = attrs != NULL;
    const char *main_class = string_member(design_node(context, "main"), "class");
    if (ok && *main_class) ok = set_string(attrs, "class", main_class);
    if (ok && strcmp(kind, "image-viewer")) ok = set_nonempty(attrs, "style", context_style(context));
    char *raw = ok ? display_html(context, kind) : NULL;
    ps_value *model = ps_object_value();
    if (ok) ok = raw && model && set_string(model, "kind", kind) &&
        set_string(model, "layout", "display") && set_string(model, "tag", "div") &&
        set_string(model, "rawHtml", raw) && ps_set(model, "attrs", attrs);
    if (ok) attrs = NULL;
    free(raw);
    if (!ok) { ps_value_free(attrs); ps_value_free(model); return NULL; }
    return model;
}

static ps_value *search_control(const widget_context *context)
{
    ps_value *source = source_model(member(context->spec, "items"));
    ps_value *attrs = ps_object_value();
    char *class_name = context_class(context, source ? "valid-target form-control valid-target-async" : "valid-target form-control");
    char *name = context_name(context), *minimum = context_option(context, "keyword_min_length", "2");
    char *delay = context_option(context, "delay", "250"), *server = context_option(context, "api_server", "");
    bool ok = attrs && class_name && name && minimum && delay && server &&
        set_string(attrs, "class", class_name) && set_nonempty(attrs, "style", context_style(context)) &&
        set_string(attrs, "name", name) && set_string(attrs, "data-keyword-min-length", minimum) &&
        set_string(attrs, "data-delay", delay) && set_string(attrs, "data-api-server", server) &&
        extend_object(attrs, source);
    char *leaf = ps_leaf_name(context->path, context->rows, context->row_count);
    char *rule = ps_rule_name(context->path, context->rows, context->row_count);
    if (ok) ok = leaf && rule && set_string(attrs, "data-name", leaf) &&
        set_string(attrs, "data-rule-name", rule) && set_string(attrs, "id", context->id);
    char *onchange = behavior_script(context, "onchange");
    if (ok && onchange && *onchange) ok = set_string(attrs, "onchange", onchange);
    if (ok) ok = set_text(attrs, "data-default", ps_scalar_string(member(context->spec, "default")));
    char *callback = context_option(context, "callback", "");
    char *quoted_id = script_quote(context->id), *quoted_min = script_quote(minimum ? minimum : "");
    char *quoted_delay = script_quote(delay ? delay : "");
    char *container = ps_string_join(context->id, "_select2", "");
    char *quoted_container = container ? script_quote(container) : NULL;
    char *callback_script = callback && *callback && quoted_id
        ? ps_string_join("$(document.getElementById(", quoted_id, "))") : ps_string_join("", "", "");
    if (callback_script && callback && *callback) {
        char *next = ps_string_join(callback_script, ".on('select2:select', ", callback); free(callback_script);
        callback_script = next ? ps_string_join(next, ");", "") : NULL; free(next);
    }
    char *script = quoted_id && quoted_min && quoted_delay && quoted_container && callback_script
        ? ps_string_join("$(function() {select2(CSS.escape(", quoted_id, "), ") : NULL;
    if (script) { char *next = ps_string_join(script, quoted_min, ", "); free(script); script = next; }
    if (script) { char *next = ps_string_join(script, quoted_delay, ", "); free(script); script = next; }
    if (script) { char *next = ps_string_join(script, quoted_container, " );"); free(script); script = next; }
    if (script) {
        size_t len = strlen(script); if (len >= 3 && !strcmp(script + len - 3, " );")) memmove(script + len - 3, " );", 4);
        char *next = ps_string_join(script, callback_script, "});"); free(script); script = next;
    }
    /* Remove the only formatting space inserted while composing the exact script. */
    if (script) { char *space = strstr(script, " );"); if (space) memmove(space, space + 1, strlen(space)); }
    const ps_value *hide = member(member(context->spec, "options"), "hide_searching");
    char *style = (!hide || hide->kind == PS_NULL || (hide->kind == PS_STRING && *ps_string(hide))) && quoted_container
        ? ps_string_join("[class~=", quoted_container, "] .loading-results { display: none; }")
        : ps_string_join("", "", "");
    ps_value *options = ok ? option_models(context, false, false) : NULL;
    if (options && !ps_size(options) && !ps_append(options, empty_option())) ok = false;
    ps_value *model = ps_object_value();
    if (ok) ok = script && style && options && model && set_string(model, "kind", "search") &&
        set_string(model, "layout", "search") && set_string(model, "tag", "select") && ps_set(model, "attrs", attrs);
    if (ok) attrs = NULL;
    if (ok) ok = ps_set(model, "source", source ? source : ps_null_value());
    if (ok) source = NULL;
    if (ok) ok = ps_set(model, "options", options);
    if (ok) options = NULL;
    if (ok) ok = set_string(model, "script", script) && set_string(model, "styleChrome", style) &&
        set_affix(context, model, "prepend", true) && set_affix(context, model, "append", true);
    free(class_name); free(name); free(minimum); free(delay); free(server); free(leaf); free(rule);
    free(onchange); free(callback); free(quoted_id); free(quoted_min); free(quoted_delay); free(container);
    free(quoted_container); free(callback_script); free(script); free(style);
    if (!ok) { ps_value_free(attrs); ps_value_free(source); ps_value_free(options); ps_value_free(model); return NULL; }
    return model;
}

static ps_value *editor_control(const char *kind, const widget_context *context)
{
    bool tagify = !strncmp(kind, "tagify", 6);
    const char *base = !strcmp(kind, "tinymce") ? "valid-target form-control tinymcearea"
        : !strcmp(kind, "summernote") ? "valid-target form-control summernote"
        : !strcmp(kind, "editorjs") ? "valid-target form-control contentjs"
        : !strcmp(kind, "tui") ? "valid-target form-control tuiarea" : "valid-target form-control";
    ps_value *attrs = ps_object_value();
    char *class_name = context_class(context, base), *name = context_name(context);
    bool ok = attrs && class_name && name;
    if (ok && tagify) ok = set_string(attrs, "type", "text");
    if (ok) ok = set_string(attrs, "id", context->id) && set_string(attrs, "class", class_name) &&
        set_string(attrs, "name", name);
    if (ok && tagify) ok = set_text(attrs, "value", context_value(context));
    else if (ok) ok = set_text(attrs, "rows", context_option(context, "rows", !strcmp(kind, "summernote") ? "5" : "3"));
    char *quoted_id = script_quote(context->id);
    char *selector = quoted_id ? ps_string_join("'#'+CSS.escape(", quoted_id, ")") : NULL;
    char *script = NULL;
    if (ok && !strcmp(kind, "tinymce")) {
        char *height = context_option(context, "height", "300"), *upload = context_option(context, "fileserver", "upload");
        char *quoted_upload = upload ? script_quote(upload) : NULL;
        ok = height && upload && quoted_upload && set_string(attrs, "data-type", string_member(context->spec, "type")) &&
            set_string(attrs, "data-height", height) && set_string(attrs, "data-upload-server", upload);
        if (ok) {
            script = ps_string_join("$(function() {editor_tinymce(", selector, ", ");
            char *next = script ? ps_string_join(script, height, ", ") : NULL; free(script); script = next;
            next = script ? ps_string_join(script, quoted_upload, ", false);});") : NULL; free(script); script = next;
        }
        free(height); free(upload); free(quoted_upload);
    } else if (ok && !strcmp(kind, "summernote")) {
        char *upload = context_option(context, "upload", "upload"), *quoted = upload ? script_quote(upload) : NULL;
        script = quoted ? ps_string_join("$(function() {editor_summernote(", selector, ", ") : NULL;
        char *next = script ? ps_string_join(script, quoted, ");});") : NULL; free(script); script = next;
        free(upload); free(quoted);
    } else if (ok && (!strcmp(kind, "editorjs") || !strcmp(kind, "tui"))) {
        char *server = context_option(context, "fileserver", ""), *quoted = server ? script_quote(server) : NULL;
        ok = server && quoted && set_string(attrs, "data-fileserver", server);
        if (ok) { char prefix[80]; snprintf(prefix, sizeof(prefix), "$(function() {editor_%s(", kind);
            script = ps_string_join(prefix, selector, ", ");
            char *next = script ? ps_string_join(script, quoted, ");});") : NULL; free(script); script = next;
        }
        free(server); free(quoted);
    } else if (ok) {
        char *maximum = context_option(context, "max_tags", "0");
        ok = maximum && set_string(attrs, "data-max-tags", maximum);
        char *server = NULL, *quoted_server = NULL;
        if (ok && !strcmp(kind, "tagify2")) {
            server = context_option(context, "server", ""); quoted_server = server ? script_quote(server) : NULL;
            ok = server && quoted_server && set_string(attrs, "data-server", server);
        }
        if (ok) ok = set_nonempty(attrs, "placeholder", context_text(context, "placeholder"));
        if (ok) { char prefix[80]; snprintf(prefix, sizeof(prefix), "$(function() {editor_%s(", kind);
            script = ps_string_join(prefix, selector, ", ");
            char *next = script ? ps_string_join(script, maximum,
                !strcmp(kind, "tagify2") ? ", " : ");});") : NULL;
            free(script); script = next;
            if (script && !strcmp(kind, "tagify2")) {
                next = ps_string_join(script, quoted_server, ");});");
                free(script); script = next;
            }
        }
        free(maximum); free(server); free(quoted_server);
    }
    if (ok) ok = script && add_behavior(context, attrs) && add_data(context, attrs);
    ps_value *model = ps_object_value();
    if (ok) ok = model && set_string(model, "kind", kind) && set_string(model, "layout", "host-script") &&
        set_string(model, "tag", tagify ? "input" : "textarea") &&
        (tagify || set_text(model, "text", context_value(context))) && ps_set(model, "attrs", attrs);
    if (ok) attrs = NULL;
    if (ok) ok = set_string(model, "script", script);
    free(class_name); free(name); free(quoted_id); free(selector); free(script);
    if (!ok) { ps_value_free(attrs); ps_value_free(model); return NULL; }
    return model;
}

static ps_value *button_control(const widget_context *context)
{
    char *name = context_name(context), *init = context_option(context, "init_script", "");
    char *onclick = behavior_script(context, "onclick");
    char *text = context_text(context, ps_has(context->spec, "content") ? "content" : "text");
    char *quoted_id = script_quote(context->id);
    char *script = init && onclick && quoted_id ? ps_string_join("\n$(function() {\n    ", init, "\n    $(document.getElementById(") : NULL;
    if (script) { char *next = ps_string_join(script, quoted_id, "))"); free(script); script = next; }
    if (script) { char *next = ps_string_join(script, ".on('click', function() {\n        ", onclick); free(script); script = next; }
    if (script) { char *next = ps_string_join(script, "\n    });\n});\n", ""); free(script); script = next; }
    char *class_name = context_class(context, "btn");
    char *button_name = name ? ps_string_join("btn", name, "") : NULL;
    ps_value *attrs = ps_object_value();
    bool ok = name && init && onclick && text && script && class_name && button_name && attrs &&
        set_string(attrs, "type", "button") && set_string(attrs, "class", class_name) &&
        set_string(attrs, "name", button_name) && set_string(attrs, "id", context->id) &&
        set_string(attrs, "value", text);
    ps_value *hidden = ps_object_value(), *extra = ps_object_value();
    char *leaf = ps_leaf_name(context->path, context->rows, context->row_count);
    char *rule = ps_rule_name(context->path, context->rows, context->row_count);
    char *value = context_value(context), *default_value = ps_scalar_string(member(context->spec, "default"));
    if (ok) ok = hidden && extra && leaf && rule && value && default_value &&
        set_string(hidden, "type", "hidden") && set_string(hidden, "class", "valid-target form-control") &&
        set_string(hidden, "readonly", "") && set_string(hidden, "name", name) &&
        set_string(hidden, "data-name", leaf) && set_string(hidden, "data-rule-name", rule) &&
        set_string(hidden, "value", value) && set_string(hidden, "data-default", default_value) &&
        ps_set(extra, "hidden", hidden);
    if (ok) hidden = NULL;
    ps_value *model = ps_object_value();
    if (ok) ok = model && set_string(model, "kind", "button") && set_string(model, "layout", "button") &&
        set_string(model, "script", script) && set_string(model, "buttonText", text) &&
        ps_set(model, "attrs", attrs);
    if (ok) attrs = NULL;
    if (ok) ok = ps_set(model, "extra", extra);
    if (ok) extra = NULL;
    free(name); free(init); free(onclick); free(text); free(quoted_id); free(script); free(class_name);
    free(button_name); free(leaf); free(rule); free(value); free(default_value);
    if (!ok) { ps_value_free(attrs); ps_value_free(hidden); ps_value_free(extra); ps_value_free(model); return NULL; }
    return model;
}

ps_value *ps_widget(const ps_value *spec, const ps_value *value, bool value_present,
                    const char *path, const ps_value *design, const char *key_prefix,
                    const char *id_prefix, const char *language,
                    const size_t *row_segments, size_t row_count)
{
    const char *type = string_member(spec, "type");
    char *lower = ps_string_join(type, "", "");
    if (!lower) return NULL;
    for (char *cursor = lower; *cursor; ++cursor) *cursor = (char)tolower((unsigned char)*cursor);
    const char *kind = canonical_kind(lower);
    if (!kind) { free(lower); return NULL; }
    char *id = ps_control_id(id_prefix, path);
    if (!id) { free(lower); return NULL; }
    widget_context context = {spec, value, value_present, path, design, key_prefix, id,
                              language, row_segments, row_count};
    ps_value *model;
    if (!strcmp(kind, "select")) model = select_control(&context);
    else if (!strcmp(kind, "choice") || !strcmp(kind, "multichoice")) model = choices(kind, &context);
    else if (!strcmp(kind, "image") || !strcmp(kind, "file") || !strcmp(kind, "cover")) model = file_control(kind, &context);
    else if (!strcmp(kind, "dummy") || !strcmp(kind, "image-viewer")) model = display_control(kind, &context);
    else if (!strcmp(kind, "search")) model = search_control(&context);
    else if (!strcmp(kind, "tinymce") || !strcmp(kind, "summernote") ||
             !strcmp(kind, "editorjs") || !strcmp(kind, "tui") ||
             !strcmp(kind, "tagify") || !strcmp(kind, "tagify2")) model = editor_control(kind, &context);
    else if (!strcmp(kind, "button")) model = button_control(&context);
    else model = text_control(kind, &context);
    if (model) {
        const char *tag = string_member(model, "tag");
        if ((!strcmp(tag, "input") || !strcmp(tag, "select") || !strcmp(tag, "textarea")) &&
            !set_string(ps_get_mut(model, "attrs"), "id", id)) { ps_value_free(model); model = NULL; }
        ps_value *file = ps_get_mut(ps_get_mut(model, "extra"), "file");
        if (model && file && !set_string(file, "id", id)) { ps_value_free(model); model = NULL; }
        if (model && ps_is_string(member(model, "layout"), "btn-group")) {
            ps_value *options = ps_get_mut(model, "options");
            for (size_t i = 0; options && i < ps_size(options); ++i) {
                char index[32]; snprintf(index, sizeof(index), ":%zu", i);
                char *option_id = ps_string_join(id, index, "");
                if (!option_id || !set_string((ps_value *)ps_at(options, i), "id", option_id)) {
                    free(option_id); ps_value_free(model); model = NULL; break;
                }
                free(option_id);
            }
        }
    }
    free(id); free(lower); return model;
}
