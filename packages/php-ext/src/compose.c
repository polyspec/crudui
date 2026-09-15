#include "engine_internal.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    const ps_value *files;
    const char *basepath;
    char **paths;
    size_t length;
} compose_context;

static ps_value *compose_properties(const ps_value *, compose_context *, ps_value **);
static ps_value *compose_spec(const ps_value *, compose_context *, ps_value **);

static void composition_error(ps_value **error, const char *code, const char *message,
                              const ps_value *trace)
{
    if (*error) return;
    size_t length = 1;
    for (size_t i = 0; trace && i < ps_size(trace); ++i)
        length += strlen(ps_string(ps_at(trace, i))) + (i ? 1 : 0);
    char *at = calloc(length, 1);
    if (!at) return;
    for (size_t i = 0; trace && i < ps_size(trace); ++i) {
        if (i) strcat(at, ".");
        strcat(at, ps_string(ps_at(trace, i)));
    }
    *error = ps_error("compose", code, message, at, trace);
    free(at);
}

static char *join_path(const char *basepath, const char *path)
{
    if (path[0] == '/' || !*basepath) {
        char *copy = malloc(strlen(path) + 1);
        if (copy) strcpy(copy, path);
        return copy;
    }
    size_t length = strlen(basepath) + strlen(path) + 2;
    char *joined = malloc(length);
    if (joined) snprintf(joined, length, "%s/%s", basepath, path);
    return joined;
}

static ps_value *trace_value(const compose_context *context, const char *extra)
{
    ps_value *trace = ps_array_value();
    if (!trace) return NULL;
    for (size_t i = 0; i < context->length; ++i) {
        if (!ps_append(trace, ps_string_value(context->paths[i]))) { ps_value_free(trace); return NULL; }
    }
    if (extra && !ps_append(trace, ps_string_value(extra))) { ps_value_free(trace); return NULL; }
    return trace;
}

static bool is_visiting(const compose_context *context, const char *path)
{
    for (size_t i = 0; i < context->length; ++i) if (!strcmp(context->paths[i], path)) return true;
    return false;
}

static ps_value *merge_objects(const ps_value *base, const ps_value *overlay)
{
    ps_value *out = base && base->kind == PS_OBJECT ? ps_value_clone(base) : ps_object_value();
    if (!out || !overlay || overlay->kind != PS_OBJECT) return out;
    for (size_t i = 0; i < ps_size(overlay); ++i) {
        if (!ps_set(out, ps_key_at(overlay, i), ps_value_clone(ps_at(overlay, i)))) {
            ps_value_free(out); return NULL;
        }
    }
    /* A merge produces an object in specification member order, as an object spread does. */
    if (!ps_value_order(out)) { ps_value_free(out); return NULL; }
    return out;
}

static ps_value *deep_merge_value(const ps_value *existing, const ps_value *incoming)
{
    if (existing && incoming && existing->kind == PS_OBJECT && incoming->kind == PS_OBJECT) {
        ps_value *out = ps_value_clone(existing);
        if (!out) return NULL;
        for (size_t i = 0; i < ps_size(incoming); ++i) {
            const char *key = ps_key_at(incoming, i);
            ps_value *merged = deep_merge_value(ps_get(out, key), ps_at(incoming, i));
            if (!merged || !ps_set(out, key, merged)) { ps_value_free(out); return NULL; }
        }
        return out;
    }
    return ps_value_clone(incoming);
}

static bool next_segment(const char **path, char **segment)
{
    const char *dot = strchr(*path, '.');
    size_t length = dot ? (size_t)(dot - *path) : strlen(*path);
    *segment = malloc(length + 1);
    if (!*segment) return false;
    memcpy(*segment, *path, length); (*segment)[length] = '\0';
    *path = dot ? dot + 1 : NULL;
    return true;
}

static bool set_path(ps_value *object, const char *path, const ps_value *value,
                     ps_value **error)
{
    if (!*path) { composition_error(error, "PATCH_SHAPE", "$patch path must be non-empty", NULL); return false; }
    const char *remaining = path;
    ps_value *node = object;
    for (;;) {
        char *segment = NULL;
        if (!next_segment(&remaining, &segment)) return false;
        if (!remaining) {
            ps_value *merged = deep_merge_value(ps_get(node, segment), value);
            bool ok = merged && ps_set(node, segment, merged);
            free(segment); return ok;
        }
        ps_value *child = ps_get_mut(node, segment);
        if (!child) {
            ps_value *created = ps_object_value();
            if (!created || !ps_set(node, segment, created)) { free(segment); return false; }
            child = ps_get_mut(node, segment);
        } else if (child->kind != PS_OBJECT) {
            char message[256];
            snprintf(message, sizeof(message), "$patch cannot descend into non-object at '%s'", segment);
            composition_error(error, "PATCH_PATH_CONFLICT", message, NULL);
            free(segment); return false;
        }
        free(segment); node = child;
    }
}

static bool remove_path(ps_value *object, const char *path, ps_value **error)
{
    const char *remaining = path;
    ps_value *node = object;
    for (;;) {
        char *segment = NULL;
        if (!next_segment(&remaining, &segment)) return false;
        ps_value *child = ps_get_mut(node, segment);
        if (!child) {
            char message[256];
            snprintf(message, sizeof(message), "$patch remove target not found: '%s'", path);
            composition_error(error, "PATCH_REMOVE_TARGET_MISSING", message, NULL);
            free(segment); return false;
        }
        if (!remaining) { bool removed = ps_delete(node, segment); free(segment); return removed; }
        if (child->kind != PS_OBJECT) {
            char message[256];
            snprintf(message, sizeof(message), "$patch remove cannot descend into non-object at '%s'", segment);
            composition_error(error, "PATCH_REMOVE_TARGET_MISSING", message, NULL);
            free(segment); return false;
        }
        free(segment); node = child;
    }
}

static void remove_nested(ps_value *base, const ps_value *spec)
{
    for (size_t i = 0; i < ps_size(spec); ++i) {
        const char *key = ps_key_at(spec, i);
        ps_value *target = ps_get_mut(base, key);
        const ps_value *part = ps_at(spec, i);
        if (target && target->kind == PS_OBJECT && part->kind == PS_OBJECT) remove_nested(target, part);
        else ps_delete(base, key);
    }
}

static ps_value *apply_patch(const ps_value *base, const ps_value *patch, ps_value **error)
{
    if (!patch || patch->kind != PS_OBJECT) {
        composition_error(error, "PATCH_SHAPE", "$patch must be an object of operations", NULL); return NULL;
    }
    ps_value *out = ps_value_clone(base);
    if (!out) return NULL;
    for (size_t i = 0; i < ps_size(patch) && !*error; ++i) {
        const char *operation = ps_key_at(patch, i);
        const ps_value *value = ps_at(patch, i);
        if (!strcmp(operation, "add") || !strcmp(operation, "replace")) {
            if (value->kind != PS_OBJECT) {
                composition_error(error, "PATCH_SHAPE", "$patch add and replace values must be objects", NULL); break;
            }
            for (size_t j = 0; j < ps_size(value); ++j)
                if (!set_path(out, ps_key_at(value, j), ps_at(value, j), error)) break;
        } else if (!strcmp(operation, "remove")) {
            if (value->kind == PS_ARRAY) {
                for (size_t j = 0; j < ps_size(value); ++j) {
                    const ps_value *path = ps_at(value, j);
                    if (path->kind != PS_STRING) {
                        composition_error(error, "PATCH_SHAPE", "$patch.remove array entries must be strings", NULL); break;
                    }
                    if (!remove_path(out, ps_string(path), error)) break;
                }
            } else if (value->kind == PS_OBJECT) remove_nested(out, value);
            else composition_error(error, "PATCH_SHAPE", "$patch.remove must be an array of paths or a nested object", NULL);
        } else if (!set_path(out, operation, value, error)) break;
    }
    if (*error || !ps_value_order(out)) { ps_value_free(out); return NULL; }
    return out;
}

static ps_value *resolve_single(const char *raw, compose_context *context, ps_value **error)
{
    const char *path = raw;
    char *path_copy = NULL;
    char *keys_copy = NULL;
    if (*path == '(') {
        const char *marker = strstr(path + 1, ").");
        if (!marker) { composition_error(error, "REF_FORMAT_ERROR", "Invalid $ref path", NULL); return NULL; }
        size_t file_length = (size_t)(marker - path - 1);
        path_copy = malloc(file_length + 1);
        if (!path_copy) return NULL;
        memcpy(path_copy, path + 1, file_length); path_copy[file_length] = '\0';
        keys_copy = malloc(strlen(marker + 2) + 1);
        if (!keys_copy) { free(path_copy); return NULL; }
        strcpy(keys_copy, marker + 2); path = path_copy;
    }
    if (!*path) { composition_error(error, "REF_FORMAT_ERROR", "Invalid $ref path", NULL); free(path_copy); free(keys_copy); return NULL; }
    char *normalized = join_path(context->basepath, path);
    if (!normalized) { free(path_copy); free(keys_copy); return NULL; }
    ps_value *trace = trace_value(context, normalized);
    if (is_visiting(context, normalized)) {
        composition_error(error, "REF_CYCLE", "$ref cycle detected", trace);
        ps_value_free(trace); free(normalized); free(path_copy); free(keys_copy); return NULL;
    }
    const ps_value *node = ps_get(context->files, normalized);
    if (!node || node->kind != PS_OBJECT) {
        char message[512]; snprintf(message, sizeof(message), "$ref file not found: %s", normalized);
        composition_error(error, "REF_FILE_NOT_FOUND", message, trace);
        ps_value_free(trace); free(normalized); free(path_copy); free(keys_copy); return NULL;
    }
    ps_value *owned = ps_value_clone(node);
    node = owned;
    if (keys_copy) {
        char *cursor = keys_copy;
        while (cursor && *cursor) {
            char *dot = strchr(cursor, '.'); if (dot) *dot = '\0';
            node = ps_get(node, cursor);
            if (!node) break;
            cursor = dot ? dot + 1 : NULL;
        }
    }
    if (node) node = ps_get(node, "properties");
    if (!node || node->kind != PS_OBJECT) {
        composition_error(error, "REF_DETECT_KEY_NOT_FOUND", "$ref properties path was not found", trace);
        ps_value_free(trace); ps_value_free(owned); free(normalized); free(path_copy); free(keys_copy); return NULL;
    }
    char **paths = realloc(context->paths, (context->length + 1) * sizeof(*paths));
    if (!paths) { ps_value_free(trace); ps_value_free(owned); free(normalized); free(path_copy); free(keys_copy); return NULL; }
    context->paths = paths; context->paths[context->length++] = normalized;
    ps_value *result = compose_properties(node, context, error);
    context->length--; free(context->paths[context->length]);
    ps_value_free(trace); ps_value_free(owned); free(path_copy); free(keys_copy);
    return result;
}

static ps_value *resolve_ref(const ps_value *reference, compose_context *context, ps_value **error)
{
    if (!reference || (reference->kind != PS_STRING && reference->kind != PS_ARRAY)) {
        composition_error(error, "REF_VALUE_TYPE",
                          "$ref must be a string or an array of strings", NULL);
        return NULL;
    }
    ps_value *out = ps_object_value();
    if (!out) return NULL;
    size_t count = reference->kind == PS_ARRAY ? ps_size(reference) : 1;
    for (size_t i = 0; i < count; ++i) {
        const ps_value *path = reference->kind == PS_ARRAY ? ps_at(reference, i) : reference;
        if (!path || path->kind != PS_STRING) {
            composition_error(error, "REF_VALUE_TYPE", "$ref must be a string or an array of strings", NULL); break;
        }
        ps_value *resolved = resolve_single(ps_string(path), context, error);
        if (!resolved) break;
        ps_value *merged = merge_objects(out, resolved);
        ps_value_free(out); ps_value_free(resolved); out = merged;
        if (!out) break;
    }
    if (*error || !out) { ps_value_free(out); return NULL; }
    return out;
}

static ps_value *compose_layer(const ps_value *input, compose_context *context, ps_value **error)
{
    ps_value *base = ps_object_value();
    ps_value *own = ps_object_value();
    const ps_value *patch = NULL;
    if (!base || !own) goto fail;
    for (size_t i = 0; i < ps_size(input); ++i) {
        const char *key = ps_key_at(input, i);
        const ps_value *value = ps_at(input, i);
        if (!strcmp(key, "$ref")) {
            ps_value *resolved = resolve_ref(value, context, error);
            if (!resolved) goto fail;
            ps_value *before = merge_objects(own, resolved);
            ps_value_free(resolved); ps_value_free(base); base = before;
            ps_value_free(own); own = ps_object_value();
            if (!base || !own) goto fail;
        } else if (!strcmp(key, "$patch")) patch = value;
        else if (!ps_set(own, key, ps_value_clone(value))) goto fail;
    }
    ps_value *out = merge_objects(base, own);
    ps_value_free(base); ps_value_free(own);
    if (!out) return NULL;
    if (patch) {
        ps_value *patched = apply_patch(out, patch, error);
        ps_value_free(out); out = patched;
    }
    return out;
fail:
    ps_value_free(base); ps_value_free(own); return NULL;
}

static ps_value *compose_properties(const ps_value *properties, compose_context *context, ps_value **error)
{
    if (!properties || properties->kind != PS_OBJECT) return ps_object_value();
    ps_value *out = compose_layer(properties, context, error);
    if (!out) return NULL;
    for (size_t i = 0; i < ps_size(out); ++i) {
        const ps_value *field = ps_at(out, i);
        if (field->kind != PS_OBJECT) continue;
        ps_value *composed = compose_spec(field, context, error);
        if (!composed || !ps_replace(out, i, composed)) { ps_value_free(out); return NULL; }
    }
    return out;
}

static ps_value *compose_spec(const ps_value *spec, compose_context *context, ps_value **error)
{
    ps_value *out = compose_layer(spec, context, error);
    if (!out) return NULL;
    const ps_value *properties = ps_get(out, "properties");
    if (properties && properties->kind == PS_OBJECT) {
        ps_value *composed = compose_properties(properties, context, error);
        if (!composed || !ps_set(out, "properties", composed)) { ps_value_free(out); return NULL; }
    }
    return out;
}

ps_value *ps_compose_properties(const ps_value *properties, const ps_value *files,
                                const char *basepath, ps_value **error)
{
    compose_context context = {files && files->kind == PS_OBJECT ? files : NULL,
        basepath ? basepath : "", NULL, 0};
    ps_value *empty = NULL;
    if (!context.files) context.files = empty = ps_object_value();
    ps_value *out = compose_properties(properties, &context, error);
    free(context.paths); ps_value_free(empty); return out;
}

ps_value *ps_compose_spec(const ps_value *spec, const ps_value *files,
                          const char *basepath, ps_value **error)
{
    compose_context context = {files && files->kind == PS_OBJECT ? files : NULL,
        basepath ? basepath : "", NULL, 0};
    ps_value *empty = NULL;
    if (!context.files) context.files = empty = ps_object_value();
    ps_value *out = compose_spec(spec, &context, error);
    free(context.paths); ps_value_free(empty); return out;
}
