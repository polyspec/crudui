#ifndef CRUDUI_ENGINE_H
#define CRUDUI_ENGINE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct ps_value ps_value;
typedef struct ps_form ps_form;
typedef struct { ps_value *value; ps_value *error; } ps_result;
typedef struct { ps_form *form; ps_value *error; } ps_form_result;
typedef bool (*ps_visitor)(void *, const uint8_t *, size_t, const ps_value *);

ps_value *ps_value_new(uint8_t kind);
void ps_value_free(ps_value *value);
void ps_value_bool(ps_value *value, bool input);
void ps_value_int(ps_value *value, int64_t input);
bool ps_value_float(ps_value *value, double input);
bool ps_value_string(ps_value *value, const uint8_t *input, size_t length);
/* insert consumes child on both success and failure; all other inputs are borrowed. */
bool ps_value_insert(ps_value *parent, const uint8_t *key, size_t length, ps_value *child);
uint8_t ps_value_read(const ps_value *, int64_t *, double *, const uint8_t **, size_t *);
bool ps_value_visit(const ps_value *, void *, ps_visitor);

ps_result ps_compile_form(const ps_value *spec, const ps_value *options);
ps_result ps_bind_form(const ps_value *template, const ps_value *data, const ps_value *options);
ps_result ps_render_list(const ps_value *spec, const ps_value *rows, const ps_value *options);
ps_result ps_validate(const ps_value *spec, const ps_value *data, const ps_value *options);
ps_result ps_validate_list(const ps_value *spec, const ps_value *options);
ps_result ps_sequence_key(const ps_value *sequence);
ps_result ps_create_key(void);
ps_form_result ps_form_new(const ps_value *template, const ps_value *data, const ps_value *options);
void ps_form_free(ps_form *form);
ps_form *ps_form_clone(const ps_form *form);
ps_result ps_form_read(const ps_form *form, uint8_t member);
ps_result ps_form_apply(ps_form *form, uint8_t method, const ps_value *args);

#endif
