#include "engine_internal.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    char *data;
    size_t length;
    size_t capacity;
    bool failed;
} render_buffer;

typedef struct {
    char *property;
    char *value;
} style_declaration;

static const ps_value *member(const ps_value *object, const char *key)
{
    return object && object->kind == PS_OBJECT ? ps_get(object, key) : NULL;
}

static const char *string_member(const ps_value *object, const char *key)
{
    const ps_value *value = member(object, key);
    return value && value->kind == PS_STRING ? ps_string(value) : "";
}

static bool bool_member(const ps_value *object, const char *key)
{
    const ps_value *value = member(object, key);
    return value && value->kind == PS_BOOL && value->data.boolean;
}

static bool reserve(render_buffer *out, size_t extra)
{
    if (out->failed) return false;
    if (extra > SIZE_MAX - out->length - 1) { out->failed = true; return false; }
    size_t needed = out->length + extra + 1;
    if (needed <= out->capacity) return true;
    size_t capacity = out->capacity ? out->capacity : 256;
    while (capacity < needed) {
        if (capacity > SIZE_MAX / 2) { capacity = needed; break; }
        capacity *= 2;
    }
    char *data = realloc(out->data, capacity);
    if (!data) { out->failed = true; return false; }
    out->data = data;
    out->capacity = capacity;
    return true;
}

static bool bytes(render_buffer *out, const char *value, size_t length)
{
    if (!reserve(out, length)) return false;
    if (length) memcpy(out->data + out->length, value, length);
    out->length += length;
    out->data[out->length] = '\0';
    return true;
}

static bool text(render_buffer *out, const char *value)
{
    return bytes(out, value ? value : "", strlen(value ? value : ""));
}

static bool character(render_buffer *out, char value)
{
    return bytes(out, &value, 1);
}

static char *take(render_buffer *out)
{
    if (out->failed) { free(out->data); out->data = NULL; return NULL; }
    if (!out->data) {
        out->data = calloc(1, 1);
        if (!out->data) return NULL;
    }
    char *result = out->data;
    out->data = NULL;
    out->length = out->capacity = 0;
    return result;
}

static char *copy_range(const char *start, const char *end)
{
    while (start < end && isspace((unsigned char)*start)) start++;
    while (end > start && isspace((unsigned char)end[-1])) end--;
    size_t length = (size_t)(end - start);
    char *copy = malloc(length + 1);
    if (!copy) return NULL;
    if (length) memcpy(copy, start, length);
    copy[length] = '\0';
    return copy;
}

static bool escaped(render_buffer *out, const char *value, bool raw)
{
    for (const unsigned char *cursor = (const unsigned char *)value; *cursor; ++cursor) {
        switch (*cursor) {
            case '&': if (!text(out, "&amp;")) return false; break;
            case '<': if (!text(out, "&lt;")) return false; break;
            case '>':
                if (raw) { if (!character(out, '>')) return false; }
                else if (!text(out, "&gt;")) return false;
                break;
            case '"':
                if (raw) { if (!text(out, "&quot;")) return false; }
                else if (!text(out, "&quot;")) return false;
                break;
            case '\'':
                if (!raw && !text(out, "&#x27;")) return false;
                if (raw && !character(out, '\'')) return false;
                break;
            default: if (!character(out, (char)*cursor)) return false;
        }
    }
    return true;
}

static bool raw_text(render_buffer *out, const char *value)
{
    for (const unsigned char *cursor = (const unsigned char *)value; *cursor; ++cursor) {
        if (*cursor == '&') { if (!text(out, "&amp;")) return false; }
        else if (*cursor == '<') { if (!text(out, "&lt;")) return false; }
        else if (*cursor == '>') { if (!text(out, "&gt;")) return false; }
        else if (!character(out, (char)*cursor)) return false;
    }
    return true;
}

static char *style_property(const char *start, const char *end)
{
    render_buffer cleaned = {0};
    for (const char *cursor = start; cursor < end;) {
        if (cursor + 1 < end && cursor[0] == '/' && cursor[1] == '*') {
            if (cleaned.length && cleaned.data[cleaned.length - 1] != ' ' &&
                !character(&cleaned, ' ')) return take(&cleaned);
            cursor += 2;
            while (cursor < end && !(cursor + 1 < end && cursor[0] == '*' && cursor[1] == '/'))
                cursor++;
            if (cursor < end) cursor += 2;
        } else if (!character(&cleaned, *cursor++)) return take(&cleaned);
    }
    char *raw = take(&cleaned);
    if (!raw) return NULL;
    char *trimmed = copy_range(raw, raw + strlen(raw));
    free(raw);
    if (!trimmed || !strncmp(trimmed, "--", 2)) return trimmed;

    render_buffer camel = {0};
    for (size_t i = 0; trimmed[i]; ++i) {
        if (trimmed[i] == '-' && trimmed[i + 1] >= 'a' && trimmed[i + 1] <= 'z') {
            if (!character(&camel, (char)toupper((unsigned char)trimmed[++i]))) break;
        } else if (!character(&camel, trimmed[i])) break;
    }
    free(trimmed);
    char *key = take(&camel);
    if (!key) return NULL;
    render_buffer css = {0};
    for (const char *cursor = key; *cursor; ++cursor) {
        if (*cursor >= 'A' && *cursor <= 'Z') {
            if (!character(&css, '-') ||
                !character(&css, (char)tolower((unsigned char)*cursor))) break;
        } else if (!character(&css, *cursor)) break;
    }
    free(key);
    char *property = take(&css);
    if (!property) return NULL;
    if (!strncmp(property, "ms-", 3)) {
        size_t length = strlen(property);
        char *prefixed = malloc(length + 2);
        if (!prefixed) { free(property); return NULL; }
        prefixed[0] = '-';
        memcpy(prefixed + 1, property, length + 1);
        free(property);
        property = prefixed;
    }
    return property;
}

static bool style_finish(const char *end, const char *start,
                         const char *colon, style_declaration **items,
                         size_t *length, size_t *capacity)
{
    if (!colon) return true;
    char *property = style_property(start, colon);
    char *value = copy_range(colon + 1, end);
    if (!property || !value) { free(property); free(value); return false; }
    if (!*property || !*value) { free(property); free(value); return true; }
    for (size_t i = 0; i < *length; ++i) {
        if (!strcmp((*items)[i].property, property)) {
            free((*items)[i].value);
            (*items)[i].value = value;
            free(property);
            return true;
        }
    }
    if (*length == *capacity) {
        size_t next = *capacity ? *capacity * 2 : 4;
        if (next > SIZE_MAX / sizeof(**items)) { free(property); free(value); return false; }
        style_declaration *resized = realloc(*items, next * sizeof(**items));
        if (!resized) { free(property); free(value); return false; }
        *items = resized;
        *capacity = next;
    }
    (*items)[(*length)++] = (style_declaration){property, value};
    return true;
}

static char *render_style(const char *source)
{
    style_declaration *items = NULL;
    size_t length = 0, capacity = 0;
    const char *start = source, *colon = NULL;
    char quote = 0, blocks[128];
    size_t depth = 0;
    bool backslash = false, comment = false;
    for (const char *cursor = source;; ++cursor) {
        char current = *cursor, next = current ? cursor[1] : 0;
        if (comment) {
            if (current == '*' && next == '/') { comment = false; cursor++; }
            if (!current) break;
            continue;
        }
        if (backslash) { backslash = false; if (!current) break; continue; }
        if (current == '\\') { backslash = true; continue; }
        if (quote) { if (current == quote) quote = 0; if (!current) break; continue; }
        if (current == '/' && next == '*') { comment = true; cursor++; continue; }
        if (current == '"' || current == '\'') { quote = current; continue; }
        if (current == '(' || current == '[' || current == '{') {
            if (depth < sizeof(blocks)) blocks[depth++] = current;
            continue;
        }
        if (current == ')' || current == ']' || current == '}') {
            char open = current == ')' ? '(' : current == ']' ? '[' : '{';
            if (depth && blocks[depth - 1] == open) depth--;
            continue;
        }
        if (!depth && current == ':' && !colon) { colon = cursor; continue; }
        if ((!depth && current == ';') || !current) {
            if (!style_finish(cursor, start, colon, &items, &length, &capacity))
                goto fail;
            start = cursor + 1;
            colon = NULL;
        }
        if (!current) break;
    }
    render_buffer out = {0};
    for (size_t i = 0; i < length; ++i) {
        if ((i && !character(&out, ';')) || !text(&out, items[i].property) ||
            !character(&out, ':') || !text(&out, items[i].value)) out.failed = true;
        free(items[i].property);
        free(items[i].value);
    }
    free(items);
    return take(&out);
fail:
    for (size_t i = 0; i < length; ++i) {
        free(items[i].property);
        free(items[i].value);
    }
    free(items);
    return NULL;
}

static bool dangerous_url(const char *value)
{
    while (*value && ((unsigned char)*value <= 0x20)) value++;
    const char *scheme = "javascript";
    for (size_t i = 0; scheme[i]; ++i) {
        if (i) while (*value == '\r' || *value == '\n' || *value == '\t') value++;
        if (tolower((unsigned char)*value) != scheme[i]) return false;
        value++;
    }
    while (*value == '\r' || *value == '\n' || *value == '\t') value++;
    return *value == ':';
}

static const char *attribute_name(const char *name)
{
    if (!strcmp(name, "autocomplete")) return "autoComplete";
    if (!strcmp(name, "readonly")) return "readOnly";
    if (!strcmp(name, "maxlength")) return "maxLength";
    if (!strcmp(name, "minlength")) return "minLength";
    if (!strcmp(name, "colspan")) return "colSpan";
    if (!strcmp(name, "rowspan")) return "rowSpan";
    return name;
}

static bool boolean_attribute(const char *name)
{
    return !strcmp(name, "readonly") || !strcmp(name, "disabled") ||
        !strcmp(name, "required") || !strcmp(name, "multiple") ||
        !strcmp(name, "autofocus");
}

static bool moved_input_attribute(const char *name)
{
    return !strcmp(name, "name") || !strcmp(name, "checked") || !strcmp(name, "value");
}

static bool append_attribute(render_buffer *out, const char *name,
                             const ps_value *value, bool raw)
{
    if (!value || value->kind == PS_NULL) return true;
    char *scalar = ps_scalar_string(value);
    if (!scalar) return false;
    char *style = NULL;
    const char *rendered = scalar;
    if (!raw && !strcmp(name, "style")) {
        style = render_style(scalar);
        if (!style) { free(scalar); return false; }
        rendered = style;
        if (!*rendered) { free(style); free(scalar); return true; }
    } else if (!raw && boolean_attribute(name)) {
        rendered = "";
    } else if (!raw && (!strcmp(name, "href") || !strcmp(name, "src"))) {
        if (!strcmp(name, "src") && !*rendered) { free(scalar); return true; }
        if (dangerous_url(rendered))
            rendered = "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')";
    }
    bool ok = character(out, ' ') && text(out, raw ? name : attribute_name(name)) &&
        text(out, "=\"") && escaped(out, rendered, raw) && character(out, '"');
    free(style);
    free(scalar);
    return ok;
}

static bool append_attributes(render_buffer *out, const char *tag,
                              const ps_value *attrs, bool raw, bool style_last)
{
    if (!attrs || attrs->kind != PS_OBJECT) return true;
    bool input = !raw && !strcmp(tag, "input");
    bool value_control = !raw && (!strcmp(tag, "select") || !strcmp(tag, "textarea"));
    for (size_t i = 0; i < ps_size(attrs); ++i) {
        const char *name = ps_key_at(attrs, i);
        if ((input && moved_input_attribute(name)) || (value_control && !strcmp(name, "value")) ||
            (style_last && !strcmp(name, "style"))) continue;
        if (!append_attribute(out, name, ps_at(attrs, i), raw)) return false;
    }
    if (style_last && ps_has(attrs, "style") &&
        !append_attribute(out, "style", ps_get(attrs, "style"), raw)) return false;
    if (input) {
        const char *names[] = {"name", "checked", "value"};
        for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); ++i)
            if (ps_has(attrs, names[i]) &&
                !append_attribute(out, names[i], ps_get(attrs, names[i]), false)) return false;
    }
    return true;
}

static bool void_tag(const char *tag)
{
    return !strcmp(tag, "input") || !strcmp(tag, "img") || !strcmp(tag, "br") ||
        !strcmp(tag, "hr") || !strcmp(tag, "link");
}

static bool start_element(render_buffer *out, const char *tag, const ps_value *attrs,
                          bool raw, bool style_last)
{
    return character(out, '<') && text(out, tag) &&
        append_attributes(out, tag, attrs, raw, style_last) &&
        text(out, !raw && void_tag(tag) ? "/>" : ">");
}

static bool end_element(render_buffer *out, const char *tag, bool raw)
{
    (void)raw;
    return void_tag(tag) ? true : text(out, "</") && text(out, tag) && character(out, '>');
}

static bool attr_string(ps_value *attrs, const char *name, const char *value)
{
    return ps_set(attrs, name, ps_string_value(value ? value : ""));
}

static bool attr_clone(ps_value *attrs, const char *name, const ps_value *value)
{
    return value && ps_set(attrs, name, ps_value_clone(value));
}

static ps_value *appearance_attrs(const char *class_name, const char *style)
{
    ps_value *attrs = ps_object_value();
    if (!attrs || (*class_name && !attr_string(attrs, "class", class_name)) ||
        (*style && !attr_string(attrs, "style", style))) {
        ps_value_free(attrs);
        return NULL;
    }
    return attrs;
}

static bool has_events(const ps_value *attrs)
{
    if (!attrs || attrs->kind != PS_OBJECT) return false;
    for (size_t i = 0; i < ps_size(attrs); ++i) {
        const char *name = ps_key_at(attrs, i);
        if (name[0] == 'o' && name[1] == 'n' && name[2] >= 'a' && name[2] <= 'z') return true;
    }
    return false;
}

static bool write_escaped(render_buffer *out, const char *value, bool raw)
{
    return raw ? raw_text(out, value) : escaped(out, value, false);
}

static bool write_affix(render_buffer *out, const ps_value *affix, bool raw)
{
    if (!affix || affix->kind != PS_OBJECT) return true;
    ps_value *attrs = appearance_attrs(string_member(affix, "class"),
                                       string_member(affix, "style"));
    if (!attrs) return false;
    bool ok = start_element(out, "span", attrs, raw, false) &&
        write_escaped(out, string_member(affix, "text"), raw) &&
        end_element(out, "span", raw);
    ps_value_free(attrs);
    return ok;
}

static bool write_control(render_buffer *out, const ps_value *widget, bool search)
{
    const char *tag = string_member(widget, "tag");
    if (!*tag) tag = "input";
    const ps_value *attrs = member(widget, "attrs");
    bool raw = search || has_events(attrs);
    if (!start_element(out, tag, attrs, raw, !raw)) return false;
    if (void_tag(tag)) return true;
    if (!strcmp(tag, "select")) {
        const ps_value *options = member(widget, "options");
        for (size_t i = 0; options && options->kind == PS_ARRAY && i < ps_size(options); ++i) {
            const ps_value *option = ps_at(options, i);
            ps_value *option_attrs = ps_object_value();
            if (!option_attrs || !attr_clone(option_attrs, "value", member(option, "value")) ||
                (bool_member(option, "selected") &&
                 !attr_string(option_attrs, "selected", search ? "selected" : ""))) {
                ps_value_free(option_attrs);
                return false;
            }
            bool ok = start_element(out, "option", option_attrs, raw, false) &&
                write_escaped(out, string_member(option, "label"), raw) &&
                end_element(out, "option", raw);
            ps_value_free(option_attrs);
            if (!ok) return false;
        }
    } else {
        const char *content = string_member(widget, "text");
        if (!raw && !strcmp(tag, "textarea") && *content == '\n' && !character(out, '\n')) return false;
        if (!write_escaped(out, content, raw)) return false;
    }
    return end_element(out, tag, raw);
}

static bool write_script(render_buffer *out, const char *script)
{
    ps_value *attrs = ps_object_value();
    if (!attrs || !attr_string(attrs, "nonce", "")) { ps_value_free(attrs); return false; }
    bool ok = start_element(out, "script", attrs, false, false) && text(out, script) &&
        end_element(out, "script", false);
    ps_value_free(attrs);
    return ok;
}

static bool write_widget(render_buffer *out, const ps_value *model);
static bool write_fields_value(render_buffer *out, const ps_value *fields);

static bool write_choice_group(render_buffer *out, const ps_value *model)
{
    const ps_value *extra = member(model, "extra");
    const ps_value *shared = member(extra, "input");
    bool raw = has_events(shared);
    bool radio = ps_is_string(member(model, "kind"), "choice");
    if (!start_element(out, "div", member(model, "attrs"), false, false)) return false;
    const ps_value *options = member(model, "options");
    for (size_t i = 0; options && options->kind == PS_ARRAY && i < ps_size(options); ++i) {
        const ps_value *option = ps_at(options, i);
        ps_value *attrs = shared && shared->kind == PS_OBJECT
            ? ps_value_clone(shared) : ps_object_value();
        if (!attrs || !attr_string(attrs, "type", radio ? "radio" : "checkbox") ||
            !attr_clone(attrs, "value", member(option, "value")) ||
            !attr_string(attrs, "autocomplete", "off") ||
            !attr_string(attrs, "class", "valid-target btn-check") ||
            (member(option, "id") && !attr_clone(attrs, "id", member(option, "id"))) ||
            (radio && !attr_string(attrs, "data-is-default",
                                   bool_member(option, "isDefault") ? "1" : "")) ||
            (bool_member(option, "selected") && !attr_string(attrs, "checked", ""))) {
            ps_value_free(attrs);
            return false;
        }
        bool ok = start_element(out, "input", attrs, raw, false);
        ps_value_free(attrs);
        if (!ok) return false;
        ps_value *label_attrs = ps_object_value();
        if (!label_attrs || !attr_clone(label_attrs, "for", member(option, "id")) ||
            !attr_string(label_attrs, "class", string_member(model, "itemLabelClass"))) {
            ps_value_free(label_attrs);
            return false;
        }
        ok = start_element(out, "label", label_attrs, raw, false) &&
            start_element(out, "span", NULL, raw, false) &&
            write_escaped(out, string_member(option, "label"), raw) &&
            end_element(out, "span", raw) && end_element(out, "label", raw);
        ps_value_free(label_attrs);
        if (!ok) return false;
    }
    return end_element(out, "div", false);
}

static bool write_file_group(render_buffer *out, const ps_value *model)
{
    const ps_value *extra = member(model, "extra");
    const ps_value *file = member(extra, "file");
    const ps_value *display = member(extra, "display");
    bool raw = has_events(file);
    ps_value *group = ps_object_value();
    if (!group || !attr_string(group, "class", "input-group")) { ps_value_free(group); return false; }
    bool ok = start_element(out, "div", group, false, false) &&
        write_affix(out, member(model, "prepend"), raw);
    ps_value_free(group);
    if (!ok) return false;
    if (display && display->kind == PS_OBJECT) {
        ps_value *attrs = raw ? ps_object_value() : ps_value_clone(display);
        if (!attrs || (raw && (!attr_string(attrs, "class", string_member(display, "class")) ||
                              !attr_string(attrs, "readonly", "") ||
                              !attr_string(attrs, "type", "text") ||
                              !attr_string(attrs, "value", "")))) {
            ps_value_free(attrs);
            return false;
        }
        ok = start_element(out, "input", attrs, raw, false);
        ps_value_free(attrs);
        if (!ok) return false;
    }
    if (!start_element(out, "input", file, raw, false)) return false;
    if (display && display->kind == PS_OBJECT) {
        ps_value *attrs = ps_object_value();
        if (!attrs || !attr_string(attrs, "class", "btn btn-search btn-file-search") ||
            !attr_string(attrs, "type", "button")) { ps_value_free(attrs); return false; }
        ok = start_element(out, "button", attrs, false, false) && text(out, "&nbsp;") &&
            end_element(out, "button", false);
        ps_value_free(attrs);
        if (!ok) return false;
    }
    return end_element(out, "div", false);
}

static bool write_search(render_buffer *out, const ps_value *model)
{
    const char *chrome = string_member(model, "styleChrome");
    if (*chrome) {
        ps_value *attrs = ps_object_value();
        if (!attrs || !attr_string(attrs, "nonce", "")) { ps_value_free(attrs); return false; }
        bool ok = start_element(out, "style", attrs, false, false) && text(out, chrome) &&
            end_element(out, "style", false);
        ps_value_free(attrs);
        if (!ok) return false;
    }
    if (!write_script(out, string_member(model, "script"))) return false;
    ps_value *attrs = ps_object_value();
    if (!attrs || !attr_string(attrs, "class", "input-group field-search")) {
        ps_value_free(attrs);
        return false;
    }
    bool ok = start_element(out, "div", attrs, false, false) &&
        write_affix(out, member(model, "prepend"), true) &&
        write_control(out, model, true) &&
        write_affix(out, member(model, "append"), true) &&
        end_element(out, "div", false);
    ps_value_free(attrs);
    return ok;
}

static bool write_widget(render_buffer *out, const ps_value *model)
{
    if (!model || model->kind != PS_OBJECT) return false;
    if (bool_member(model, "unsupported")) {
        ps_value *attrs = ps_object_value();
        if (!attrs || !attr_string(attrs, "class", "form-element-unsupported") ||
            !attr_string(attrs, "data-unsupported-type", string_member(model, "type"))) {
            ps_value_free(attrs);
            return false;
        }
        bool ok = start_element(out, "div", attrs, false, false) &&
            end_element(out, "div", false);
        ps_value_free(attrs);
        return ok;
    }
    const char *layout = string_member(model, "layout");
    if (!strcmp(layout, "input-group")) {
        ps_value *attrs = ps_object_value();
        if (!attrs || !attr_string(attrs, "class", "input-group")) { ps_value_free(attrs); return false; }
        bool raw = has_events(member(model, "attrs"));
        bool ok = start_element(out, "div", attrs, false, false) &&
            write_affix(out, member(model, "prepend"), raw) &&
            write_control(out, model, false) &&
            write_affix(out, member(model, "append"), raw) &&
            end_element(out, "div", false);
        ps_value_free(attrs);
        return ok;
    }
    if (!strcmp(layout, "bare")) return write_control(out, model, false);
    if (!strcmp(layout, "host-script"))
        return write_control(out, model, false) && write_script(out, string_member(model, "script"));
    if (!strcmp(layout, "btn-group")) return write_choice_group(out, model);
    if (!strcmp(layout, "file")) return write_file_group(out, model);
    if (!strcmp(layout, "display"))
        return start_element(out, "div", member(model, "attrs"), false, false) &&
            text(out, string_member(model, "rawHtml")) && end_element(out, "div", false);
    if (!strcmp(layout, "search")) return write_search(out, model);
    if (!strcmp(layout, "button"))
        return write_script(out, string_member(model, "script")) &&
            start_element(out, "input", member(member(model, "extra"), "hidden"), false, false) &&
            start_element(out, "input", member(model, "attrs"), false, false);
    return false;
}

static bool write_button(render_buffer *out, const char *class_name,
                         const ps_value *maximum, bool label)
{
    ps_value *attrs = ps_object_value();
    if (!attrs || !attr_string(attrs, "type", "button") ||
        !attr_string(attrs, "class", class_name) ||
        (maximum && !attr_clone(attrs, "data-multiple-max", maximum)) ||
        (label && !attr_string(attrs, "aria-label", "+"))) {
        ps_value_free(attrs);
        return false;
    }
    bool ok = start_element(out, "button", attrs, false, false) && character(out, ' ') &&
        end_element(out, "button", false);
    ps_value_free(attrs);
    return ok;
}

static bool write_buttons(render_buffer *out, const ps_value *model)
{
    const ps_value *settings = member(model, "multiple");
    if (!settings || settings->kind != PS_OBJECT) return false;
    if (bool_member(settings, "sortable") &&
        (!write_button(out, "btn btn-move-up", NULL, false) ||
         !write_button(out, "btn btn-move-down", NULL, false))) return false;
    if (!write_button(out, "btn btn-plus", member(settings, "max"), false)) return false;
    if (bool_member(settings, "copy") && !write_button(out, "btn btn-copy", NULL, false)) return false;
    return write_button(out, bool_member(settings, "copy")
                        ? "btn btn-minus btn-delete" : "btn btn-minus", NULL, false);
}

static bool write_description(render_buffer *out, const ps_value *model)
{
    const char *description = string_member(model, "description");
    if (!*description) return true;
    ps_value *attrs = ps_object_value();
    if (!attrs || !attr_string(attrs, "class", "description")) { ps_value_free(attrs); return false; }
    bool ok = start_element(out, "p", attrs, false, false) && escaped(out, description, false) &&
        end_element(out, "p", false);
    ps_value_free(attrs);
    return ok;
}

static bool write_group_wrapper_start(render_buffer *out, const char *class_name,
                                      const char *uniqid)
{
    ps_value *attrs = ps_object_value();
    if (!attrs || !attr_string(attrs, "class", class_name) ||
        !attr_string(attrs, "data-uniqid", uniqid)) { ps_value_free(attrs); return false; }
    bool ok = start_element(out, "div", attrs, false, false);
    ps_value_free(attrs);
    return ok;
}

static bool write_field(render_buffer *out, const ps_value *model)
{
    if (!model || model->kind != PS_OBJECT) return false;
    const ps_value *design = member(model, "design");
    const ps_value *wrapper = member(design, "wrapper");
    char *wrapper_class = ps_join_classes("form-element-wrapper",
                                          string_member(wrapper, "class"), NULL);
    char *group_class = ps_join_classes("input-group-wrapper",
                                        string_member(wrapper, "class"), NULL);
    const char *wrapper_style = string_member(wrapper, "style");
    char *combined_style = NULL;
    if (!bool_member(design, "show"))
        combined_style = ps_string_join("display: none", *wrapper_style ? "; " : "", wrapper_style);
    else combined_style = ps_string_join(wrapper_style, "", "");
    ps_value *attrs = ps_object_value();
    bool prepared = wrapper_class && group_class && combined_style && attrs &&
        attr_string(attrs, "class", wrapper_class) &&
        attr_string(attrs, "data-field-path", string_member(model, "path")) &&
        (!*combined_style || attr_string(attrs, "style", combined_style));
    free(wrapper_class);
    free(combined_style);
    if (!prepared || !start_element(out, "div", attrs, false, false)) {
        free(group_class);
        ps_value_free(attrs);
        return false;
    }
    ps_value_free(attrs);
    if (bool_member(model, "checkbox")) {
        ps_value *input_attrs = ps_object_value();
        if (!input_attrs || !attr_string(input_attrs, "class", string_member(model, "checkboxClass")) ||
            !attr_string(input_attrs, "id", string_member(model, "checkboxId")) ||
            !attr_string(input_attrs, "name", string_member(model, "checkboxName")) ||
            !attr_string(input_attrs, "type", "checkbox") || !attr_string(input_attrs, "value", "1") ||
            (bool_member(model, "checkboxChecked") && !attr_string(input_attrs, "checked", ""))) {
            ps_value_free(input_attrs);
            free(group_class);
            return false;
        }
        ps_value *checkbox_attrs = ps_object_value();
        if (!checkbox_attrs || !attr_string(checkbox_attrs, "class", "checkbox") ||
            !start_element(out, "div", checkbox_attrs, false, false) ||
            !start_element(out, "h6", NULL, false, false) ||
            !write_group_wrapper_start(out, group_class, string_member(model, "uniqid")) ||
            !start_element(out, "div", NULL, false, false) ||
            !start_element(out, "input", input_attrs, false, false)) {
            ps_value_free(checkbox_attrs);
            ps_value_free(input_attrs);
            free(group_class);
            return false;
        }
        ps_value_free(checkbox_attrs);
        ps_value_free(input_attrs);
        ps_value *label_attrs = ps_object_value();
        if (!label_attrs || !attr_string(label_attrs, "for", string_member(model, "checkboxId")) ||
            !start_element(out, "label", label_attrs, false, false) ||
            !escaped(out, string_member(model, "label"), false) ||
            !end_element(out, "label", false) || !end_element(out, "div", false) ||
            !end_element(out, "div", false) || !end_element(out, "h6", false) ||
            !write_description(out, model) || !end_element(out, "div", false) ||
            !end_element(out, "div", false)) {
            ps_value_free(label_attrs);
            free(group_class);
            return false;
        }
        ps_value_free(label_attrs);
        free(group_class);
        return true;
    }

    const char *label = string_member(model, "label");
    if (*label && !bool_member(model, "omitLabel")) {
        const ps_value *label_design = member(design, "label");
        ps_value *label_attrs = appearance_attrs(string_member(label_design, "class"),
                                                 string_member(label_design, "style"));
        if (!label_attrs || !start_element(out, "h6", label_attrs, false, false)) {
            ps_value_free(label_attrs);
            free(group_class);
            return false;
        }
        ps_value_free(label_attrs);
        const ps_value *widget = member(model, "widget");
        const ps_value *id = member(member(member(widget, "extra"), "file"), "id");
        if (!id) id = member(member(widget, "attrs"), "id");
        if (id && id->kind == PS_STRING) {
            ps_value *for_attrs = ps_object_value();
            if (!for_attrs || !attr_clone(for_attrs, "for", id) ||
                !start_element(out, "label", for_attrs, false, false) ||
                !escaped(out, label, false) || !end_element(out, "label", false)) {
                ps_value_free(for_attrs);
                free(group_class);
                return false;
            }
            ps_value_free(for_attrs);
        } else if (!escaped(out, label, false)) { free(group_class); return false; }
        if (!end_element(out, "h6", false)) { free(group_class); return false; }
    }
    if (!write_description(out, model)) { free(group_class); return false; }
    ps_value *form_element = ps_object_value();
    if (!form_element || !attr_string(form_element, "class", "form-element") ||
        !start_element(out, "div", form_element, false, false)) {
        ps_value_free(form_element);
        free(group_class);
        return false;
    }
    ps_value_free(form_element);
    const char *shape = string_member(model, "shape");
    bool ok = true;
    if (!strcmp(shape, "leaf")) {
        ok = write_group_wrapper_start(out, group_class, string_member(model, "uniqid")) &&
            write_widget(out, member(model, "widget")) && end_element(out, "div", false);
    } else if (!strcmp(shape, "group")) {
        const ps_value *group_design = member(design, "group");
        ps_value *inner = appearance_attrs(string_member(model, "groupClass"),
                                           string_member(model, "groupStyle"));
        ok = inner && write_group_wrapper_start(out, group_class, string_member(model, "uniqid")) &&
            start_element(out, "div", inner, false, false) &&
            write_fields_value(out, member(model, "children")) &&
            end_element(out, "div", false) && end_element(out, "div", false);
        (void)group_design;
        ps_value_free(inner);
    } else if (!strcmp(shape, "multiple-leaf") || !strcmp(shape, "multiple-group")) {
        const ps_value *rows = member(model, "rows");
        if (!rows || rows->kind != PS_ARRAY) ok = false;
        else if (!ps_size(rows)) ok = write_button(out, "btn btn-plus", NULL, true);
        else for (size_t i = 0; ok && i < ps_size(rows); ++i) {
            const ps_value *row = ps_at(rows, i);
            ps_value *row_attrs = ps_object_value();
            if (!row_attrs || !attr_string(row_attrs, "class", string_member(row, "wrapperClass")) ||
                !attr_string(row_attrs, "data-uniqid", string_member(row, "uniqid")) ||
                !start_element(out, "div", row_attrs, false, false)) ok = false;
            ps_value_free(row_attrs);
            if (!ok) break;
            if (!strcmp(shape, "multiple-group")) {
                ps_value *row_group = ps_object_value();
                ps_value *buttons = ps_object_value();
                if (!row_group || !buttons ||
                    !attr_string(row_group, "class", string_member(row, "groupClass")) ||
                    !attr_string(buttons, "class", "btn-group input-group-btn") ||
                    !start_element(out, "div", row_group, false, false) ||
                    !write_fields_value(out, member(row, "children")) ||
                    !end_element(out, "div", false) ||
                    !start_element(out, "span", buttons, false, false) ||
                    !write_buttons(out, model) || !end_element(out, "span", false)) ok = false;
                ps_value_free(row_group);
                ps_value_free(buttons);
            } else if (!write_widget(out, member(row, "widget")) || !write_buttons(out, model)) ok = false;
            if (ok && !end_element(out, "div", false)) ok = false;
        }
    } else if (!strcmp(shape, "lang")) {
        const ps_value *language = member(model, "lang");
        ps_value *lang_group = ps_object_value();
        if (!lang_group || !attr_string(lang_group, "class", string_member(language, "groupClass")) ||
            !write_group_wrapper_start(out, group_class, string_member(model, "uniqid")) ||
            !start_element(out, "div", lang_group, false, false)) ok = false;
        ps_value_free(lang_group);
        const char *title = string_member(language, "title");
        if (ok && *title) {
            ps_value *title_attrs = ps_object_value();
            if (!title_attrs || !attr_string(title_attrs, "class", "lang-title") ||
                !start_element(out, "div", title_attrs, false, false) ||
                !escaped(out, title, false) || !end_element(out, "div", false)) ok = false;
            ps_value_free(title_attrs);
        }
        const ps_value *children = member(language, "children");
        for (size_t i = 0; ok && children && children->kind == PS_ARRAY && i < ps_size(children); ++i) {
            const ps_value *child = ps_at(children, i);
            ps_value *child_attrs = ps_object_value();
            ps_value *code_attrs = ps_object_value();
            if (!child_attrs || !code_attrs ||
                !attr_string(child_attrs, "class", "lang-child") ||
                !attr_string(child_attrs, "data-lang", string_member(child, "code")) ||
                !attr_string(code_attrs, "class", "input-group-text lang-code") ||
                !start_element(out, "div", child_attrs, false, false) ||
                !start_element(out, "span", code_attrs, false, false) ||
                !escaped(out, string_member(child, "code"), false) ||
                !end_element(out, "span", false) ||
                !write_widget(out, member(child, "widget")) ||
                !end_element(out, "div", false)) ok = false;
            ps_value_free(child_attrs);
            ps_value_free(code_attrs);
        }
        if (ok && (!end_element(out, "div", false) || !end_element(out, "div", false))) ok = false;
    } else ok = false;
    free(group_class);
    return ok && end_element(out, "div", false) && end_element(out, "div", false);
}

static bool write_fields_value(render_buffer *out, const ps_value *fields)
{
    if (!fields || fields->kind != PS_ARRAY) return false;
    for (size_t i = 0; i < ps_size(fields); ++i)
        if (!write_field(out, ps_at(fields, i))) return false;
    return true;
}

char *ps_render_fields(const ps_value *fields)
{
    if (!fields || fields->kind != PS_ARRAY) return NULL;
    render_buffer out = {0};
    ps_value *attrs = ps_object_value();
    if (!attrs || !attr_string(attrs, "class", "form-group") ||
        !start_element(&out, "div", attrs, false, false) ||
        !write_fields_value(&out, fields) || !end_element(&out, "div", false)) out.failed = true;
    ps_value_free(attrs);
    return take(&out);
}
