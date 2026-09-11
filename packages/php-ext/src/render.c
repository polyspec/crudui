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
