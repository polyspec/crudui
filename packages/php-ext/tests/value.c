#include "engine_internal.h"

#include <assert.h>
#include <string.h>

typedef struct {
    size_t count;
    const char *keys[4];
    int64_t integers[4];
} visit_state;

static bool record(void *context, const uint8_t *key, size_t length,
                   const ps_value *value)
{
    visit_state *state = context;
    int64_t integer = 0;
    double number = 0;
    const uint8_t *text = NULL;
    size_t text_length = 0;
    assert(state->count < 4);
    if (key) {
        assert(length > 0);
        state->keys[state->count] = (const char *)key;
    }
    assert(ps_value_read(value, &integer, &number, &text, &text_length) == PS_INT);
    state->integers[state->count++] = integer;
    return true;
}

static ps_value *integer(int64_t input)
{
    ps_value *value = ps_value_new(PS_NULL);
    assert(value);
    ps_value_int(value, input);
    return value;
}

int main(void)
{
    assert(!ps_value_string(NULL, (const uint8_t *)"", 0));
    ps_value_bool(NULL, true);
    ps_value_int(NULL, 1);
    assert(!ps_value_float(NULL, 1.0));
    assert(ps_value_read(NULL, NULL, NULL, NULL, NULL) == UINT8_MAX);

    ps_value *object = ps_value_new(PS_OBJECT);
    assert(object);
    assert(ps_set(object, "first", integer(1)));
    assert(ps_set(object, "second", integer(2)));
    assert(ps_set(object, "first", integer(3)));
    assert(ps_size(object) == 2);

    visit_state state = {0};
    assert(ps_value_visit(object, &state, record));
    assert(state.count == 2);
    assert(!strncmp(state.keys[0], "first", 5));
    assert(!strncmp(state.keys[1], "second", 6));
    assert(state.integers[0] == 3 && state.integers[1] == 2);

    ps_value *copy = ps_value_clone(object);
    assert(copy && ps_equal(copy, object));
    assert(ps_delete(copy, "first"));
    assert(!ps_equal(copy, object));
    assert(ps_has(object, "first"));
    assert(!ps_get(object, NULL));
    assert(!ps_delete(object, NULL));
    ps_value_free(copy);

    ps_value *array = ps_value_new(PS_ARRAY);
    assert(array && ps_append(array, integer(4)) && ps_append(array, integer(5)));
    state = (visit_state){0};
    assert(ps_value_visit(array, &state, record));
    assert(state.count == 2 && !state.keys[0] && !state.keys[1]);
    assert(state.integers[0] == 4 && state.integers[1] == 5);
    ps_value_free(array);

    ps_value *text = ps_value_new(PS_NULL);
    const uint8_t valid[] = {0xed, 0x95, 0x9c, 0xea, 0xb8, 0x80};
    const uint8_t invalid[] = {0xc0, 0xaf};
    assert(ps_value_string(text, valid, sizeof(valid)));
    assert(!ps_value_string(text, invalid, sizeof(invalid)));
    assert(!ps_value_string(text, NULL, 1));
    assert(text->kind == PS_STRING && text->data.string.length == sizeof(valid));
    ps_value_free(text);

    ps_value *number = ps_value_new(PS_NULL);
    assert(number);
    ps_value_int(number, 1);
    ps_value *fraction = ps_value_new(PS_NULL);
    assert(fraction && ps_value_float(fraction, 1.0));
    assert(ps_equal(number, fraction));
    ps_value_free(number);
    ps_value_free(fraction);
    ps_value_free(object);
    return 0;
}
