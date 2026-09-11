#include "engine_internal.h"

ps_value *ps_error(const char *kind, const char *code, const char *message,
                   const char *at, const ps_value *trace)
{
    ps_value *error = ps_object_value();
    ps_value *empty_trace = NULL;
    if (!trace) trace = empty_trace = ps_array_value();
    if (!error || !trace ||
        !ps_set(error, "kind", ps_string_value(kind)) ||
        !ps_set(error, "code", ps_string_value(code)) ||
        !ps_set(error, "message", ps_string_value(message)) ||
        !ps_set(error, "at", ps_string_value(at ? at : "")) ||
        !ps_set(error, "trace", ps_value_clone(trace))) {
        ps_value_free(error);
        error = NULL;
    }
    ps_value_free(empty_trace);
    return error;
}

ps_result ps_ok(ps_value *value) { return (ps_result){value, NULL}; }
ps_result ps_fail(const char *kind, const char *code, const char *message,
                  const char *at)
{
    return (ps_result){NULL, ps_error(kind, code, message, at, NULL)};
}
