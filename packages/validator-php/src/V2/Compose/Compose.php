<?php

declare(strict_types=1);

namespace FormSpec\Validator\V2\Compose;

/**
 * Composition orchestrator (SPEC-V2 §5, G5) — the parser's FIRST pass.
 * Byte-for-byte port of validator-ts/src/v2/compose/compose.ts.
 *
 * Resolution order (SPEC-V2 §5, verbatim):
 *   (1) $ref   — expand file/path base, recursively (nested $ref included) into a
 *                single properties base.
 *   (2) $patch — overlay add/remove/replace and deep-path set on that base.
 *   (3) the result is the equivalent SINGLE SPEC (composition keys eliminated).
 *   (4) the field layer (validate/design/behavior/options) then applies to it.
 *
 * G5 (SPEC §2): the parser expands composition first, producing a single spec,
 * BEFORE applying the field layer — without composition a $ref-using spec cannot
 * even be loaded. So composition is a pre-processing pass that runs BEFORE
 * validation/render, not a validation step.
 *
 * v1's positional array_merge priority is normalized here: $ref = base (first),
 * $patch = overlay (later) — base is laid down, patch overrides.
 *
 * composeProperties is the entry point: it operates on a properties map (the
 * composition entry point, SPEC §2) where $ref/$patch may sit alongside named
 * child fields. composeSpec recurses the whole field tree so a $ref nested inside
 * any child properties is expanded too. Both throw a ComposeLoadError for any
 * unresolved composition (never valid:true).
 */
final class Compose
{
    /** Sentinel for "no $patch seen" (distinct from a present null $patch). */
    private const UNDEFINED = "\0__compose_undefined__\0";

    /**
     * Compose a properties map: expand $ref to a base, overlay $patch, return the
     * single (composition-free) properties map. Named sibling keys follow v1
     * declaration order — a key declared after $ref overrides the base; a key
     * declared before it is overridden by the base.
     *
     * @param array<string, mixed> $properties
     * @return array<string, mixed>
     */
    public static function properties(
        array $properties,
        FileLoader $loader,
        string $basepath = '',
    ): array {
        $base = [];
        $patch = self::UNDEFINED;
        $own = [];

        foreach ($properties as $k => $v) {
            if ($k === '$ref') {
                // $ref array_merges onto whatever was declared before it (v1 order).
                $base = self::merge($own, Ref::resolve($v, $basepath, $loader));
                $own = [];
            } elseif ($k === '$patch') {
                $patch = $v;
            } else {
                $own[$k] = $v;
            }
        }

        // No composition keys: still recurse into children so nested $ref expands.
        $result = self::merge($base, $own);
        if ($patch !== self::UNDEFINED) {
            $result = Patch::apply($result, $patch);
        }

        // Recurse into every child field's properties (the tree may compose deeper).
        foreach ($result as $fieldName => $field) {
            if (self::isPlainObject($field)) {
                /** @var array<string, mixed> $field */
                $result[$fieldName] = self::spec($field, $loader, $basepath);
            }
        }

        return $result;
    }

    /**
     * Compose a full field spec: expand a field-level $ref/$patch, then recurse
     * into its properties (which may itself compose). Returns the single spec.
     *
     * @param array<string, mixed> $spec
     * @return array<string, mixed>
     */
    public static function spec(
        array $spec,
        FileLoader $loader,
        string $basepath = '',
    ): array {
        // Field-level $ref / $patch (a field may inherit a whole base spec).
        if (\array_key_exists('$ref', $spec) || \array_key_exists('$patch', $spec)) {
            $base = [];
            $patch = self::UNDEFINED;
            $own = [];
            foreach ($spec as $k => $v) {
                if ($k === '$ref') {
                    // Field-level $ref resolves a file's properties layer too
                    // (v1 detectKey).
                    $base = self::merge($own, Ref::resolve($v, $basepath, $loader));
                    $own = [];
                } elseif ($k === '$patch') {
                    $patch = $v;
                } else {
                    $own[$k] = $v;
                }
            }
            $resolved = self::merge($base, $own);
            if ($patch !== self::UNDEFINED) {
                $resolved = Patch::apply($resolved, $patch);
            }
        } else {
            $resolved = $spec;
        }

        // Recurse into properties (composition entry point, SPEC §2).
        if (\array_key_exists('properties', $resolved) && self::isPlainObject($resolved['properties'])) {
            /** @var array<string, mixed> $props */
            $props = $resolved['properties'];
            $resolved['properties'] = self::properties($props, $loader, $basepath);
        }

        return $resolved;
    }

    /**
     * Shallow merge { ...a, ...b }: b overrides a on clash, b's new keys append.
     *
     * @param array<string, mixed> $a
     * @param array<string, mixed> $b
     * @return array<string, mixed>
     */
    private static function merge(array $a, array $b): array
    {
        $out = $a;
        foreach ($b as $k => $v) {
            $out[$k] = $v;
        }
        return $out;
    }

    /**
     * JS "plain object" predicate: non-list array, or empty array (read as {});
     * never a scalar/null/list.
     */
    private static function isPlainObject(mixed $v): bool
    {
        if (!\is_array($v)) {
            return false;
        }
        if ($v === []) {
            return true;
        }
        return !\array_is_list($v);
    }
}
