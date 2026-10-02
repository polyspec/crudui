#include "engine_internal.h"

#include <math.h>
#include <stdlib.h>

/*
 * Choice lists (docs/spec/schema.md, "Choice lists"): an items array of value and label pairs
 * whose choices keep the list order for any values.
 */

bool ps_is_choice_list(const ps_value *items)
{
    if (!items || items->kind != PS_ARRAY) return false;
    for (size_t i = 0; i < ps_size(items); ++i) {
        const ps_value *item = ps_at(items, i);
        if (item->kind == PS_OBJECT && ps_has(item, "value")) return true;
    }
    return false;
}

ps_chars ps_choice_value_text(const ps_value *items, size_t index)
{
    ps_chars text = {NULL, 0};
    if (ps_canonical_text(ps_get(ps_at(items, index), "value"), &text) <= 0) return (ps_chars){NULL, 0};
    return text;
}

int ps_choice_list_valid(const ps_value *items)
{
    size_t count = ps_size(items);
    for (size_t i = 0; i < count; ++i) {
        const ps_value *item = ps_at(items, i);
        if (item->kind != PS_OBJECT || ps_size(item) != 2 || !ps_has(item, "value") || !ps_has(item, "label"))
            return 0;
        const ps_value *value = ps_get(item, "value");
        if (value->kind != PS_STRING && value->kind != PS_INT &&
            !(value->kind == PS_FLOAT && isfinite(value->data.number)))
            return 0;
    }
    for (size_t i = 0; i < count; ++i) {
        ps_chars left = ps_choice_value_text(items, i);
        if (!left.bytes) return -1;
        for (size_t j = 0; j < i; ++j) {
            ps_chars right = ps_choice_value_text(items, j);
            if (!right.bytes) { free(left.bytes); return -1; }
            bool same = ps_text_equal(ps_view(left), ps_view(right));
            free(right.bytes);
            if (same) { free(left.bytes); return 0; }
        }
        free(left.bytes);
    }
    return 1;
}

const ps_value *ps_choice_label(const ps_value *items, ps_text key, bool *failed)
{
    *failed = false;
    for (size_t i = 0; i < ps_size(items); ++i) {
        ps_chars text = ps_choice_value_text(items, i);
        if (!text.bytes) { *failed = true; return NULL; }
        bool same = ps_text_equal(ps_view(text), key);
        free(text.bytes);
        if (same) return ps_get(ps_at(items, i), "label");
    }
    return NULL;
}
