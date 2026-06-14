<?php

declare(strict_types=1);

namespace FormSpec\Validator\Compose;

/**
 * $patch application — add / remove / replace over the $ref base (schema §5).
 * Byte-for-byte port of validator-ts/src/compose/patch.ts.
 *
 * Absorbs the legacy legacy directives $after/$before/$merge/$change/$remove
 * (the analysis legacy_mapping):
 *
 *   $after / $before {existing:{new:val}}  → add   (position = declaration order;
 *                                            CRUDUI properties preserve insert order)
 *   $merge / $change {key:{sub:val}}       → replace + add (deep-merge; scalar =
 *                                            replace, new subkey = add)
 *   $remove [k1,k2] | {k:{sub:…}}          → remove (whole key or deep subkey)
 *
 * CRUDUI normalization (the analysis patch_ops): $patch is an OBJECT of operations.
 * Two shapes coexist (both ported from legacy, both order-preserving):
 *
 *   1. Deep-path set — "field.validate.required": ".other". The dotted key is
 *      split into path segments and the value is SET at that node (creating
 *      intermediate objects). SPEC §5 canonical form. The value replaces any
 *      scalar leaf; for object values it deep-merges (legacy $merge =
 *      drupal_array_merge_deep_array: both-array → deep merge, else latter wins).
 *
 *   2. Structured ops — explicit add / remove / replace keys:
 *        add:     { "path.to.new": value, … }   — deep-merge value at path
 *        replace: { "path.to.key": value, … }   — same merge rule (scalar override)
 *        remove:  [ "path.to.key", … ] | { … }  — deep delete (legacy arr::remove)
 *
 * Resolution order: base ($ref) first, then $patch overlays. add/replace
 * deep-merge; remove deep-deletes; deep-path set splits then applies. An
 * unresolved patch (op shape error, path conflict, strict-remove miss) is a LOAD
 * ERROR — never valid:true.
 */
final class Patch
{
    /**
     * Apply a $patch object to the (already $ref-expanded) base spec.
     *
     * @param array<string, mixed> $base
     * @return array<string, mixed>
     */
    public static function apply(array $base, mixed $patch): array
    {
        if (!self::isPlainObject($patch)) {
            throw new ComposeLoadError(
                'PATCH_SHAPE',
                '$patch must be an object of operations, got ' . self::typeName($patch),
            );
        }
        /** @var array<string, mixed> $p */
        $p = $patch;
        $result = $base;

        // Apply entries in declaration order (CRUDUI properties preserve order).
        foreach ($p as $key => $val) {
            $key = (string) $key;
            if ($key === 'add' || $key === 'replace') {
                $result = self::applyAddReplace($result, $val, $key);
            } elseif ($key === 'remove') {
                $result = self::applyRemove($result, $val);
            } else {
                // Deep-path set (SPEC §5 canonical form): "a.b.c": value.
                $result = self::setDeepPath($result, self::splitPath($key), $val);
            }
        }
        return $result;
    }

    /**
     * Structured add/replace: a map of deep-path → value, deep-merged at each path.
     *
     * @param array<string, mixed> $base
     * @return array<string, mixed>
     */
    private static function applyAddReplace(array $base, mixed $val, string $op): array
    {
        if (!self::isPlainObject($val)) {
            throw new ComposeLoadError(
                'PATCH_SHAPE',
                '$patch.' . $op . ' must be an object of deep-path → value',
            );
        }
        $result = $base;
        /** @var array<string, mixed> $val */
        foreach ($val as $path => $value) {
            $result = self::setDeepPath($result, self::splitPath((string) $path), $value);
        }
        return $result;
    }

    /**
     * Structured remove: an array of deep-paths, or a nested {k:{sub:…}} map.
     *
     * @param array<string, mixed> $base
     * @return array<string, mixed>
     */
    private static function applyRemove(array $base, mixed $val): array
    {
        if (\is_array($val) && \array_is_list($val)) {
            $result = $base;
            foreach ($val as $path) {
                if (!\is_string($path)) {
                    throw new ComposeLoadError(
                        'PATCH_SHAPE',
                        '$patch.remove array entries must be strings',
                    );
                }
                $result = self::removeDeepPath($result, self::splitPath($path));
            }
            return $result;
        }
        if (self::isPlainObject($val)) {
            // Nested map form (legacy arr::remove): recurse where both sides are objects.
            /** @var array<string, mixed> $val */
            return self::removeNested($base, $val);
        }
        throw new ComposeLoadError(
            'PATCH_SHAPE',
            '$patch.remove must be an array of paths or a nested object',
        );
    }

    /**
     * Split a dotted deep-path into segments. Empty path is a shape error.
     *
     * @return list<string>
     */
    private static function splitPath(string $path): array
    {
        if ($path === '') {
            throw new ComposeLoadError('PATCH_SHAPE', '$patch path must be non-empty');
        }
        return \explode('.', $path);
    }

    /**
     * Set a value at a deep path, creating intermediate objects. When both the
     * existing leaf and the new value are plain objects, DEEP-MERGE (legacy $merge);
     * otherwise the new value REPLACES (legacy scalar override). Returns a new tree
     * (PHP arrays are value types, so the input is never mutated).
     *
     * @param array<string, mixed> $node
     * @param list<string>         $segments
     * @return array<string, mixed>
     */
    private static function setDeepPath(array $node, array $segments, mixed $value): array
    {
        $head = $segments[0];
        $rest = \array_slice($segments, 1);
        $out = $node;

        if (\count($rest) === 0) {
            $existing = \array_key_exists($head, $out) ? $out[$head] : null;
            $out[$head] = self::mergeValue(
                \array_key_exists($head, $out) ? $existing : self::UNDEFINED,
                $value,
            );
            return $out;
        }

        if (!\array_key_exists($head, $out)) {
            $out[$head] = self::setDeepPath([], $rest, $value);
        } elseif (self::isPlainObject($out[$head])) {
            /** @var array<string, mixed> $child */
            $child = $out[$head];
            $out[$head] = self::setDeepPath($child, $rest, $value);
        } else {
            // Intermediate node is a scalar/array — cannot descend into it.
            throw new ComposeLoadError(
                'PATCH_PATH_CONFLICT',
                "\$patch cannot descend into non-object at '" . $head . "'",
            );
        }
        return $out;
    }

    /** Sentinel for "key absent" (distinct from a present null value). */
    private const UNDEFINED = "\0__compose_undefined__\0";

    /**
     * legacy deep-merge leaf rule (drupal_array_merge_deep_array): both plain objects
     * → recursive deep merge; otherwise the latter value wins (scalar/array
     * override). Mirrors JS mergeValue; an UNDEFINED existing means "no prior
     * leaf" (JS existing === undefined), so the incoming value is taken as-is.
     */
    private static function mergeValue(mixed $existing, mixed $incoming): mixed
    {
        if (
            $existing !== self::UNDEFINED
            && self::isPlainObject($existing)
            && self::isPlainObject($incoming)
        ) {
            /** @var array<string, mixed> $existing */
            /** @var array<string, mixed> $incoming */
            $out = $existing;
            foreach ($incoming as $k => $v) {
                $prior = \array_key_exists($k, $out) ? $out[$k] : self::UNDEFINED;
                $out[$k] = self::mergeValue($prior, $v);
            }
            return $out;
        }
        return $incoming;
    }

    /**
     * Delete a value at a deep path. Strict: a missing target is a load error.
     *
     * @param array<string, mixed> $node
     * @param list<string>         $segments
     * @return array<string, mixed>
     */
    private static function removeDeepPath(array $node, array $segments): array
    {
        $head = $segments[0];
        $rest = \array_slice($segments, 1);

        if (!\array_key_exists($head, $node)) {
            throw new ComposeLoadError(
                'PATCH_REMOVE_TARGET_MISSING',
                "\$patch remove target not found: '" . \implode('.', $segments) . "'",
            );
        }
        $out = $node;
        if (\count($rest) === 0) {
            unset($out[$head]);
            return $out;
        }
        if (!self::isPlainObject($out[$head])) {
            throw new ComposeLoadError(
                'PATCH_REMOVE_TARGET_MISSING',
                "\$patch remove cannot descend into non-object at '" . $head . "'",
            );
        }
        /** @var array<string, mixed> $child */
        $child = $out[$head];
        $out[$head] = self::removeDeepPath($child, $rest);
        return $out;
    }

    /**
     * Nested-map remove (legacy arr::remove): for each key, recurse when both the
     * target and the removal spec are objects, else unset the key. A missing key
     * is tolerated here (legacy arr::remove silently unsets), unlike the array form.
     *
     * @param array<string, mixed> $base
     * @param array<string, mixed> $spec
     * @return array<string, mixed>
     */
    private static function removeNested(array $base, array $spec): array
    {
        $out = $base;
        foreach ($spec as $key => $sub) {
            $hasKey = \array_key_exists($key, $out);
            $target = $hasKey ? $out[$key] : null;
            if (
                $hasKey
                && self::isPlainObject($target)
                && self::isPlainObject($sub)
            ) {
                /** @var array<string, mixed> $target */
                /** @var array<string, mixed> $sub */
                $out[$key] = self::removeNested($target, $sub);
            } else {
                unset($out[$key]);
            }
        }
        return $out;
    }

    /**
     * JS "plain object" predicate: x !== null && typeof x === 'object' &&
     * !Array.isArray(x). In PHP a json_decode(true) map is a non-list array; a
     * JSON array is a list array. An empty {} and an empty [] both decode to [];
     * a spec graph node is always an object, so an empty array is treated as a
     * plain object (the JS {} branch). A scalar/null is never a plain object.
     */
    private static function isPlainObject(mixed $v): bool
    {
        if (!\is_array($v)) {
            return false;
        }
        if ($v === []) {
            return true; // empty {} (object), the only spec-graph reading
        }
        return !\array_is_list($v);
    }

    /** JS-style type name for $patch shape error messages. */
    private static function typeName(mixed $v): string
    {
        if ($v === null) {
            return 'null';
        }
        if (\is_array($v)) {
            return \array_is_list($v) && $v !== [] ? 'array' : 'object';
        }
        return \gettype($v);
    }
}
