#include "engine_internal.h"

#include <stdlib.h>
#include <string.h>

typedef ps_html_buffer render_buffer;

#define text ps_html_text
#define character ps_html_character
#define take ps_html_take
#define start_element ps_html_start_element
#define attr_string ps_html_attr_string
#define attr_clone ps_html_attr_clone
#define appearance_attrs ps_html_appearance_attrs

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

static bool escaped(render_buffer *out, const char *value, bool raw)
{
    return ps_html_escaped(out, value, strlen(value), raw);
}

static bool raw_text(render_buffer *out, const char *value)
{
    return ps_html_raw_text(out, value, strlen(value));
}

static bool end_element(render_buffer *out, const char *tag, bool raw)
{
    (void)raw;
    return ps_html_end_element(out, tag);
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
    if (ps_html_void_tag(tag)) return true;
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
            !attr_string(attrs, "class", "valid-target crudui-choices__input") ||
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
    if (!group || !attr_string(group, "class", "crudui-widget")) { ps_value_free(group); return false; }
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
        if (!attrs || !attr_string(attrs, "class", "crudui-widget__button") ||
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
    if (!attrs || !attr_string(attrs, "class", "crudui-widget crudui-widget--search")) {
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
        if (!attrs || !attr_string(attrs, "class", "crudui-widget crudui-widget--unsupported") ||
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
    if (!strcmp(layout, "widget")) {
        ps_value *attrs = ps_object_value();
        if (!attrs || !attr_string(attrs, "class", "crudui-widget")) { ps_value_free(attrs); return false; }
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
    if (!strcmp(layout, "choices")) return write_choice_group(out, model);
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

static bool write_node(render_buffer *out, const ps_value *node);

/* Append a class list part; empty parts are skipped and parts are joined by one space. */
static bool class_part(render_buffer *classes, const char *part)
{
    if (!part || !*part) return true;
    return (!classes->length || character(classes, ' ')) && text(classes, part);
}

static bool write_empty_element(render_buffer *out, const char *tag, const ps_value *attrs)
{
    return start_element(out, tag, attrs, false, false) && end_element(out, tag, false);
}

static bool write_text_element(render_buffer *out, const char *tag, const ps_value *attrs,
                               const char *content)
{
    return start_element(out, tag, attrs, false, false) && escaped(out, content, false) &&
        end_element(out, tag, false);
}

static bool write_controls(render_buffer *out, const ps_value *controls)
{
    ps_value *attrs = ps_object_value();
    bool ok = attrs && attr_string(attrs, "class", "crudui-controls") &&
        attr_string(attrs, "role", "group") &&
        attr_string(attrs, "aria-label", string_member(controls, "label")) &&
        start_element(out, "div", attrs, false, false);
    ps_value_free(attrs);
    const ps_value *actions = member(controls, "actions");
    for (size_t i = 0; ok && actions && actions->kind == PS_ARRAY && i < ps_size(actions); ++i) {
        const ps_value *action = ps_at(actions, i);
        ps_value *button = ps_object_value();
        ok = button && attr_string(button, "type", "button") &&
            attr_string(button, "class", "crudui-action") &&
            attr_string(button, "data-crudui-action", string_member(action, "name")) &&
            attr_string(button, "aria-label", string_member(action, "label")) &&
            (!bool_member(action, "disabled") || attr_string(button, "aria-disabled", "true")) &&
            write_empty_element(out, "button", button);
        ps_value_free(button);
    }
    return ok && end_element(out, "div", false);
}

static bool write_class_text(render_buffer *out, const char *tag, const char *class_name,
                             const char *content)
{
    ps_value *attrs = ps_object_value();
    bool ok = attrs && attr_string(attrs, "class", class_name) &&
        write_text_element(out, tag, attrs, content);
    ps_value_free(attrs);
    return ok;
}

/* Header parts in slot order; the header is omitted when it has no parts. */
static bool write_header(render_buffer *out, const ps_value *node)
{
    const ps_value *header = member(node, "header");
    const ps_value *controls = member(node, "controls");
    bool collapsible = bool_member(node, "collapsible");
    bool expanded = bool_member(node, "expanded");
    bool header_controls = ps_is_string(member(controls, "placement"), "header");
    render_buffer parts = {0};
    bool ok = true;
    if (collapsible) {
        ps_value *toggle = ps_object_value();
        const ps_value *body_id = member(member(node, "body"), "id");
        ok = toggle && attr_string(toggle, "type", "button") &&
            attr_string(toggle, "class", "crudui-action") &&
            attr_string(toggle, "data-crudui-action", "toggle-row") &&
            attr_string(toggle, "aria-expanded", expanded ? "true" : "false") &&
            (!body_id || attr_clone(toggle, "aria-controls", body_id)) &&
            (!member(node, "toggleLabel") ||
             attr_clone(toggle, "aria-label", member(node, "toggleLabel"))) &&
            write_empty_element(&parts, "button", toggle);
        ps_value_free(toggle);
    }
    if (ok && member(header, "label")) {
        const ps_value *target = member(header, "labelFor");
        ps_value *attrs = ps_object_value();
        ok = attrs && attr_string(attrs, "class", "crudui-node__label") &&
            (!target || !*string_member(header, "labelFor") || attr_clone(attrs, "for", target)) &&
            write_text_element(&parts, target && *string_member(header, "labelFor") ? "label" : "span",
                               attrs, string_member(header, "label"));
        ps_value_free(attrs);
    }
    if (ok && member(header, "description"))
        ok = write_class_text(&parts, "p", "crudui-node__description", string_member(header, "description"));
    if (ok && member(header, "number"))
        ok = write_class_text(&parts, "span", "crudui-node__number", string_member(header, "number"));
    if (ok && member(header, "title"))
        ok = write_class_text(&parts, "span", "crudui-node__title", string_member(header, "title"));
    if (ok && member(header, "summary")) {
        ps_value *attrs = ps_object_value();
        ok = attrs && attr_string(attrs, "class", "crudui-node__summary") &&
            (!expanded || attr_string(attrs, "hidden", "")) &&
            write_text_element(&parts, "span", attrs, string_member(header, "summary"));
        ps_value_free(attrs);
    }
    if (ok && member(header, "count"))
        ok = write_class_text(&parts, "span", "crudui-node__count", string_member(header, "count"));
    if (ok && header_controls) ok = write_controls(&parts, controls);
    char *content = take(&parts);
    if (!ok || !content) { free(content); return false; }
    if (!*content) { free(content); return true; }

    render_buffer classes = {0}, style = {0};
    const char *header_style = string_member(header, "style");
    if (!class_part(&classes, "crudui-node__header") ||
        !class_part(&classes, string_member(header, "className"))) classes.failed = true;
    if (*header_style && !text(&style, header_style)) style.failed = true;
    char *class_name = take(&classes), *style_text = take(&style);
    ps_value *attrs = ps_object_value();
    ok = class_name && style_text && attrs && attr_string(attrs, "class", class_name) &&
        (!*style_text || attr_string(attrs, "style", style_text)) &&
        start_element(out, "div", attrs, false, false) && text(out, content) &&
        end_element(out, "div", false);
    free(class_name); free(style_text); free(content); ps_value_free(attrs);
    return ok;
}

static bool write_body(render_buffer *out, const ps_value *node)
{
    const ps_value *body = member(node, "body");
    render_buffer classes = {0};
    if (!class_part(&classes, "crudui-node__body") ||
        !class_part(&classes, string_member(body, "className"))) classes.failed = true;
    char *class_name = take(&classes);
    ps_value *attrs = ps_object_value();
    bool ok = class_name && attrs && attr_string(attrs, "class", class_name) &&
        (!*string_member(body, "style") || attr_clone(attrs, "style", member(body, "style"))) &&
        (!*string_member(body, "id") || attr_clone(attrs, "id", member(body, "id"))) &&
        (!bool_member(node, "collapsible") || bool_member(node, "expanded") ||
         attr_string(attrs, "hidden", "")) &&
        start_element(out, "div", attrs, false, false);
    free(class_name); ps_value_free(attrs);
    if (!ok) return false;
    const ps_value *checkbox = member(node, "checkbox");
    if (checkbox) {
        ps_value *input = ps_object_value();
        ps_value *label = ps_object_value();
        ok = input && label &&
            attr_string(input, "class", string_member(checkbox, "className")) &&
            attr_string(input, "id", string_member(checkbox, "id")) &&
            attr_string(input, "name", string_member(checkbox, "name")) &&
            attr_string(input, "type", "checkbox") && attr_string(input, "value", "1") &&
            (!bool_member(checkbox, "checked") || attr_string(input, "checked", "")) &&
            start_element(out, "input", input, false, false) &&
            attr_string(label, "for", string_member(checkbox, "id")) &&
            write_text_element(out, "label", label, string_member(checkbox, "caption"));
        ps_value_free(input); ps_value_free(label);
    } else if (member(node, "widget")) {
        ok = write_widget(out, member(node, "widget"));
    } else {
        const ps_value *children = member(node, "children");
        for (size_t i = 0; ok && children && children->kind == PS_ARRAY && i < ps_size(children); ++i)
            ok = write_node(out, ps_at(children, i));
    }
    return ok && end_element(out, "div", false);
}

/* One node of the recursive form grammar: root, header, body and footer slots. */
static bool write_node(render_buffer *out, const ps_value *node)
{
    if (!node || node->kind != PS_OBJECT) return false;
    const char *kind = string_member(node, "kind");
    char *modifier = ps_string_join("crudui-node--", kind, "");
    render_buffer classes = {0};
    if (!modifier || !class_part(&classes, "crudui-node") || !class_part(&classes, modifier) ||
        (bool_member(node, "sticky") && !class_part(&classes, "crudui-node--sticky")) ||
        !class_part(&classes, string_member(node, "className"))) classes.failed = true;
    free(modifier);
    char *class_name = take(&classes);
    /* A sticky row carries its depth on the root; the stylesheet derives its sticky line from it. */
    render_buffer style = {0};
    const char *node_style = string_member(node, "style");
    if (*node_style && !text(&style, node_style)) style.failed = true;
    if (bool_member(node, "sticky")) {
        char *depth = member(node, "stickyDepth") ? ps_scalar_string(member(node, "stickyDepth"))
                                                  : ps_string_join("0", "", "");
        if (!depth || (style.length && !text(&style, "; ")) ||
            !text(&style, "--crudui-sticky-depth: ") || !text(&style, depth)) style.failed = true;
        free(depth);
    }
    char *style_text = take(&style);
    bool path = strcmp(kind, "row") && strcmp(kind, "lang-item") && member(node, "path");
    ps_value *attrs = ps_object_value();
    render_buffer header = {0};
    bool ok = class_name && style_text && attrs && attr_string(attrs, "class", class_name) &&
        (!*style_text || attr_string(attrs, "style", style_text)) &&
        (!path || attr_clone(attrs, "data-field-path", member(node, "path"))) &&
        (!member(node, "key") || attr_clone(attrs, "data-crudui-row-key", member(node, "key"))) &&
        (!member(node, "lang") || attr_clone(attrs, "data-lang", member(node, "lang"))) &&
        (!bool_member(node, "hidden") || attr_string(attrs, "hidden", "")) &&
        write_header(&header, node) && start_element(out, "div", attrs, false, false);
    char *header_html = ok ? take(&header) : NULL;
    if (ok && header_html && *header_html && bool_member(node, "sticky")) {
        ps_value *wrapper = ps_object_value();
        ok = wrapper && attr_string(wrapper, "class", "crudui-node__header-container") &&
            start_element(out, "div", wrapper, false, false) && text(out, header_html) &&
            end_element(out, "div", false);
        ps_value_free(wrapper);
    } else if (ok && header_html) {
        ok = text(out, header_html);
    }
    free(header_html);
    ok = ok && write_body(out, node);
    free(class_name); free(style_text); ps_value_free(attrs);
    const ps_value *controls = member(node, "controls");
    if (ok && ps_is_string(member(controls, "placement"), "footer")) {
        ps_value *footer = ps_object_value();
        ok = footer && attr_string(footer, "class", "crudui-node__footer") &&
            start_element(out, "div", footer, false, false) && write_controls(out, controls) &&
            end_element(out, "div", false);
        ps_value_free(footer);
    }
    return ok && end_element(out, "div", false);
}

/* Button escaping: attribute values escape & " <, text escapes & < >. */
static bool button_escaped(render_buffer *out, const char *value, bool attribute)
{
    for (const char *c = value; *c; ++c) {
        const char *entity = *c == '&' ? "&amp;" : *c == '<' ? "&lt;"
            : attribute && *c == '"' ? "&quot;" : !attribute && *c == '>' ? "&gt;" : NULL;
        if (entity ? !text(out, entity) : !character(out, *c)) return false;
    }
    return true;
}

static bool write_buttons(render_buffer *out, const ps_value *buttons, const char *label)
{
    ps_value *footer = ps_object_value();
    ps_value *controls = ps_object_value();
    bool ok = footer && controls && attr_string(footer, "class", "crudui-form__footer") &&
        attr_string(controls, "class", "crudui-controls") && attr_string(controls, "role", "group") &&
        attr_string(controls, "aria-label", label) &&
        start_element(out, "div", footer, false, false) && start_element(out, "div", controls, false, false);
    ps_value_free(footer); ps_value_free(controls);
    for (size_t i = 0; ok && i < ps_size(buttons); ++i) {
        const ps_value *button = ps_at(buttons, i);
        const char *tag = string_member(button, "tag");
        const ps_value *attrs = member(button, "attrs");
        ok = character(out, '<') && text(out, tag);
        for (size_t j = 0; ok && attrs && j < ps_size(attrs); ++j) {
            const ps_value *value = ps_at(attrs, j);
            ok = character(out, ' ') && text(out, ps_key_at(attrs, j)) && text(out, "=\"") &&
                button_escaped(out, value && value->kind == PS_STRING ? ps_string(value) : "", true) &&
                character(out, '"');
        }
        ok = ok && character(out, '>') && button_escaped(out, string_member(button, "text"), false) &&
            text(out, "</") && text(out, tag) && character(out, '>');
    }
    return ok && end_element(out, "div", false) && end_element(out, "div", false);
}

static char *render_form(const ps_value *fields, const ps_value *buttons, const char *label)
{
    if (!fields || fields->kind != PS_ARRAY) return NULL;
    render_buffer out = {0};
    ps_value *form = ps_object_value();
    ps_value *body = ps_object_value();
    bool ok = form && body && attr_string(form, "class", "crudui-form") &&
        attr_string(body, "class", "crudui-form__body") &&
        start_element(&out, "div", form, false, false) &&
        start_element(&out, "div", body, false, false);
    for (size_t i = 0; ok && i < ps_size(fields); ++i) ok = write_node(&out, ps_at(fields, i));
    ok = ok && end_element(&out, "div", false) &&
        (!buttons || write_buttons(&out, buttons, label));
    if (!ok || !end_element(&out, "div", false)) out.failed = true;
    ps_value_free(form); ps_value_free(body);
    return take(&out);
}

char *ps_render_fields(const ps_value *fields)
{
    return render_form(fields, NULL, NULL);
}

char *ps_render_form(const ps_value *fields, const ps_value *buttons, const char *actions_label)
{
    if (!buttons || buttons->kind != PS_ARRAY || !actions_label) return NULL;
    return render_form(fields, buttons, actions_label);
}
