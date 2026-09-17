#include "engine_internal.h"

#include <stdio.h>
#include <stdlib.h>

/*
 * Rule name and parameter checks (docs/spec/validation-rules.md, "Parameter errors"). A parameter
 * outside the definitions, and a validate or messages key that is not a registered rule, is a load
 * failure (kind compose) whose location is the field's declaration path: at is the property names
 * joined with '.', trace is the list of those names.
 */

bool ps_registered_rule(ps_text rule)
{
    static const char *const rules[] = {
        "required", "email", "minlength", "maxlength", "min", "max", "match", "pattern",
        "unique", "in", "range", "rangelength", "number", "digits", "equalTo", "notEqual",
        "date", "dateISO", "enddate", "url", "accept", "mincount", "maxcount", "step",
    };
    for (size_t i = 0; i < sizeof(rules) / sizeof(rules[0]); ++i)
        if (ps_text_is(rule, rules[i])) return true;
    return false;
}

static bool pattern_rule(ps_text rule)
{
    return ps_text_is(rule, "pattern") || ps_text_is(rule, "match");
}

bool ps_rule_parameter(ps_text rule, const ps_value *parameter, ps_pattern_cache *patterns,
                       ps_parameter_problem *problem)
{
    *problem = (ps_parameter_problem){0};
    if (ps_length_rule(rule)) {
        *problem = ps_length_parameter(rule, parameter);
        return true;
    }
    if (ps_number_rule(rule)) {
        *problem = ps_number_parameter(rule, parameter);
        return true;
    }
    if (ps_text_is(rule, "in")) {
        *problem = ps_in_parameter(parameter);
        return !problem->code || strcmp(problem->code, "INTERNAL_ERROR");
    }
    if (!pattern_rule(rule)) return true;
    if (!parameter || parameter->kind != PS_STRING) {
        *problem = (ps_parameter_problem){.code = "INVALID_RULE_PARAMETER", .message =
            ps_text_is(rule, "match") ? "Invalid match parameter: expected a pattern string"
                                      : "Invalid pattern parameter: expected a pattern string"};
        return true;
    }
    /* A declared pattern is compiled once, when it is checked. */
    const ps_pattern *pattern;
    ps_pattern_error error;
    int valid = ps_pattern_cache_get(patterns, ps_string(parameter), &pattern, &error);
    if (valid < 0) return false;
    if (!valid) *problem = (ps_parameter_problem){.code = "INVALID_RULE_PATTERN", .reason = error.reason, .offset = error.offset};
    return true;
}

ps_value *ps_parameter_error(ps_text rule, const ps_parameter_problem *problem,
                             const ps_text *path, size_t length)
{
    ps_html_buffer at = {0};
    ps_value *trace = ps_array_value();
    for (size_t i = 0; i < length; ++i) {
        if (i) ps_html_character(&at, '.');
        ps_html_append(&at, path[i]);
        if (trace && !ps_append(trace, ps_text_value(path[i]))) { ps_value_free(trace); trace = NULL; }
    }
    ps_chars location = ps_html_take(&at);
    ps_chars message;
    if (!strcmp(problem->code, "UNKNOWN_RULE")) {
        message = PS_CONCAT(PS_TEXT("Unknown rule: "), rule);
    } else if (problem->reason) {
        char offset[32];
        snprintf(offset, sizeof(offset), "%zu", problem->offset);
        message = PS_CONCAT(PS_TEXT("Invalid "), rule, PS_TEXT(" pattern: "), ps_fixed(problem->reason),
                            PS_TEXT(" at "), ps_fixed(offset));
    } else {
        message = ps_copy(ps_fixed(problem->message));
    }
    ps_value *error = location.bytes && message.bytes && trace
        ? ps_error_text("compose", problem->code, ps_view(message), ps_view(location), trace)
        : NULL;
    free(location.bytes);
    free(message.bytes);
    ps_value_free(trace);
    return error;
}

static ps_value *internal_error(void)
{
    return ps_error("internal", "INTERNAL_ERROR", "Validation failed", "", NULL);
}

/* The load failure of one parameter that takes effect, or NULL. */
static ps_value *check_value(ps_text rule, const ps_value *parameter, const ps_text *path, size_t length,
                             ps_pattern_cache *patterns)
{
    if (parameter->kind == PS_NULL || (parameter->kind == PS_BOOL && !parameter->data.boolean)) return NULL;
    ps_parameter_problem problem;
    if (!ps_rule_parameter(rule, parameter, patterns, &problem)) return internal_error();
    if (!problem.code) return NULL;
    ps_value *error = ps_parameter_error(rule, &problem, path, length);
    return error ? error : internal_error();
}

/*
 * The load failure of a declared parameter. A length, numeric or count parameter may be
 * conditional: every value of a condition map and every literal branch of a ternary is checked,
 * selected or not; a branch that takes its value from the data, and the result of any other
 * expression, is checked when validation selects it. A string that is not an expression is a
 * literal. Pattern and membership parameters are used as declared.
 */
static ps_value *check_declared(ps_text rule, const ps_value *parameter, const ps_text *path, size_t length,
                                ps_pattern_cache *patterns)
{
    if (!ps_length_rule(rule) && !ps_number_rule(rule))
        return check_value(rule, parameter, path, length, patterns);
    if (parameter->kind == PS_OBJECT) {
        for (size_t i = 0; i < ps_size(parameter); ++i) {
            ps_value *error = check_value(rule, ps_at(parameter, i), path, length, patterns);
            if (error) return error;
        }
        return NULL;
    }
    if (parameter->kind != PS_STRING || !ps_condition_expression(ps_string(parameter)))
        return check_value(rule, parameter, path, length, patterns);
    bool parsed = false;
    ps_value *literals = ps_expression_literals(ps_string(parameter), &parsed);
    if (!literals) return internal_error();
    /* A string that is not an expression is a literal. */
    if (!parsed) {
        ps_value_free(literals);
        return check_value(rule, parameter, path, length, patterns);
    }
    ps_value *error = NULL;
    for (size_t i = 0; !error && i < ps_size(literals); ++i)
        error = check_value(rule, ps_at(literals, i), path, length, patterns);
    ps_value_free(literals);
    return error;
}

/* The UNKNOWN_RULE load failure of a name that is not a registered rule, or NULL. */
static ps_value *check_name(ps_text rule, const ps_text *path, size_t length)
{
    if (ps_registered_rule(rule)) return NULL;
    static const ps_parameter_problem unknown = {.code = "UNKNOWN_RULE"};
    ps_value *error = ps_parameter_error(rule, &unknown, path, length);
    return error ? error : internal_error();
}

/* A field's rule names and parameters in declaration order, then its messages keys. */
static ps_value *check_field(const ps_value *field, const ps_text *path, size_t length,
                             ps_pattern_cache *patterns)
{
    const ps_value *rules = ps_get(field, "validate");
    for (size_t i = 0; rules && rules->kind == PS_OBJECT && i < ps_size(rules); ++i) {
        ps_text rule = ps_key(rules, i);
        ps_value *error = check_name(rule, path, length);
        if (!error) error = check_declared(rule, ps_at(rules, i), path, length, patterns);
        if (error) return error;
    }
    const ps_value *messages = ps_get(field, "messages");
    for (size_t i = 0; messages && messages->kind == PS_OBJECT && i < ps_size(messages); ++i) {
        ps_value *error = check_name(ps_key(messages, i), path, length);
        if (error) return error;
    }
    return NULL;
}

static ps_value *check_properties(const ps_value *properties, ps_text **path, size_t *capacity, size_t length,
                                  ps_pattern_cache *patterns)
{
    if (!properties || properties->kind != PS_OBJECT) return NULL;
    for (size_t i = 0; i < ps_size(properties); ++i) {
        const ps_value *field = ps_at(properties, i);
        if (!field || field->kind != PS_OBJECT) continue;
        if (length + 1 > *capacity) {
            size_t grown = *capacity ? *capacity * 2 : 8;
            ps_text *resized = realloc(*path, grown * sizeof(**path));
            if (!resized) return internal_error();
            *path = resized;
            *capacity = grown;
        }
        (*path)[length] = ps_key(properties, i);
        ps_value *error = check_field(field, *path, length + 1, patterns);
        if (error) return error;
        const ps_value *children = ps_get(field, "properties");
        if (ps_is_string(ps_get(field, "type"), "group") && children && children->kind == PS_OBJECT) {
            error = check_properties(children, path, capacity, length + 1, patterns);
            if (error) return error;
        }
    }
    return NULL;
}

ps_value *ps_check_rule_parameters(const ps_value *properties, ps_pattern_cache *patterns)
{
    ps_text *path = NULL;
    size_t capacity = 0;
    ps_value *error = check_properties(properties, &path, &capacity, 0, patterns);
    free(path);
    return error;
}
