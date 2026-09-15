<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Compose;

use CRUDUI\Validator\Support\JsonValue;

/**
 * $ref resolution expands base inheritance before other composition (SPEC §5).
 *
 * Resolution supports these input forms:
 *   (1) value = a single string OR a list of strings — a list resolves each path
 *       in order, then array_merge (later overrides earlier on key clash).
 *   (2) plain path 'OptionMultiplexable.yml' → load YAML, descend by the default
 *       detectKey ['properties'] (= take the file's properties only).
 *   (3) path-specified '(file.yml).a.b' → regex split, detectKeys = ['a','b',
 *       'properties'] — descend a.b, then descend to properties underneath.
 *   (4) relative paths get the basepath '/' prefix; absolute (/-leading) pass
 *       through (handled by the FileLoader).
 *   (5) the result is recursively processed — nested $ref is expanded.
 *
 * CRUDUI normalization: $ref is the properties-layer composition entry point. The
 * resolved result is flattened to a single properties map and laid down as the
 * base; $patch overlays it (base first, patch overrides). Unresolved $ref
 * (missing file / bad format / absent detectKey / cycle) is a LOAD ERROR — never
 * valid:true (the legacy ProductNft.yml:873 bug).
 */
final class Ref
{
    /** The regex that splits '(path).keys' — mirrors legacy ReferenceResolver:113. */
    private const PATH_SPEC_RE = '/^\((?<path>.*?)\)\.(?<keys>.*)$/s';

    /**
     * Resolve a $ref value (string or list of strings) to a single flattened
     * properties map. Each entry is resolved in declaration order and merged
     * (later overrides earlier). Nested $ref inside a resolved doc is expanded
     * recursively. The $visiting set (canonical file keys on the current chain)
     * detects cycles.
     *
     * @param array<string, bool> $visiting
     * @return array<string, mixed>
     */
    public static function resolve(
        mixed $value,
        string $basepath,
        FileLoader $loader,
        array $visiting = [],
    ): array {
        $paths = self::normalizeValue($value);

        $merged = [];
        foreach ($paths as $path) {
            $resolved = self::resolveSingle($path, $basepath, $loader, $visiting);
            // array_merge: later keys override earlier (legacy resolve() semantics).
            $merged = self::shallowMerge($merged, $resolved);
        }
        return $merged;
    }

    /**
     * Normalize the $ref value into a list of path strings (legacy: scalar→[scalar]).
     *
     * @return list<string>
     */
    private static function normalizeValue(mixed $value): array
    {
        if (\is_string($value)) {
            return [$value];
        }
        if (\is_array($value) && \array_is_list($value)) {
            foreach ($value as $p) {
                if (!\is_string($p)) {
                    throw new ComposeLoadError(
                        'REF_VALUE_TYPE',
                        '$ref array entries must be strings, got ' . self::typeName($p),
                    );
                }
            }
            /** @var list<string> $value */
            return $value;
        }
        throw new ComposeLoadError(
            'REF_VALUE_TYPE',
            '$ref must be a string or an array of strings, got ' . self::typeName($value),
        );
    }

    /**
     * Resolve one $ref path entry, descending detectKeys and expanding nested refs.
     *
     * @param array<string, bool> $visiting
     * @return array<string, mixed>
     */
    private static function resolveSingle(
        string $rawPath,
        string $basepath,
        FileLoader $loader,
        array $visiting,
    ): array {
        $orgPath = $rawPath;
        $path = $rawPath;
        $detectKeys = ['properties'];

        // Path-specified form '(file.yml).a.b' (legacy: leading '(').
        if (\str_starts_with($path, '(')) {
            if (\preg_match(self::PATH_SPEC_RE, $path, $m) !== 1) {
                throw new ComposeLoadError('REF_FORMAT_ERROR', $orgPath . ' ref error');
            }
            $path = $m['path'];
            $keys = $m['keys'];
            // detectKeys = explode('.', keys) ++ ['properties'] (legacy:115).
            $detectKeys = [...\explode('.', $keys), 'properties'];
        }

        // Empty path is a format error (legacy: ReferenceResolver:141).
        if ($path === '') {
            throw new ComposeLoadError('REF_FORMAT_ERROR', $orgPath . ' ref error');
        }

        $key = $loader->normalize($path, $basepath);

        // Cycle detection: this file key already on the current resolution chain
        // (legacy has no guard and infinite-recurses; CRUDUI must detect — SPEC §7).
        if (isset($visiting[$key])) {
            $chain = [...\array_keys($visiting), $key];
            throw new ComposeLoadError(
                'REF_CYCLE',
                '$ref cycle detected: ' . \implode(' -> ', $chain),
                $chain,
            );
        }

        // throws REF_FILE_NOT_FOUND if absent; a loaded document uses specification member order.
        $doc = JsonValue::orderedMembers($loader->load($key));

        // Descend detectKeys (legacy: ReferenceResolver:129-136).
        $node = $doc;
        foreach ($detectKeys as $detectKey) {
            if (self::isPlainObject($node) && \array_key_exists($detectKey, (array) $node)) {
                /** @var array<string, mixed> $node */
                $node = ((array) $node)[$detectKey];
            } else {
                $chain = [...\array_keys($visiting), $key];
                throw new ComposeLoadError(
                    'REF_DETECT_KEY_NOT_FOUND',
                    $detectKey . ' not found in ' . $orgPath,
                    $chain,
                );
            }
        }

        if (!self::isPlainObject($node)) {
            // A properties layer must be a map. A scalar/array here is malformed.
            $chain = [...\array_keys($visiting), $key];
            throw new ComposeLoadError(
                'REF_DETECT_KEY_NOT_FOUND',
                $orgPath . ' resolved to a non-object properties layer',
                $chain,
            );
        }

        // Recursively expand nested $ref inside the resolved properties map. Add
        // this file key to the visiting chain so a deeper $ref back to it is a cycle.
        $nextVisiting = $visiting;
        $nextVisiting[$key] = true;
        /** @var array<string, mixed> $node */
        return self::expandNested((array) $node, $basepath, $loader, $nextVisiting);
    }

    /**
     * Expand any $ref (and merge any $patch) sitting INSIDE a resolved properties
     * map, recursively (legacy: resolve() re-runs Parser::process). The resolved base
     * is laid down first, then sibling named keys override it (legacy array_merge
     * declaration order: a later plain key overrides an earlier $ref).
     *
     * @param array<string, mixed> $node
     * @param array<string, bool>  $visiting
     * @return array<string, mixed>
     */
    private static function expandNested(
        array $node,
        string $basepath,
        FileLoader $loader,
        array $visiting,
    ): array {
        if (!\array_key_exists('$ref', $node) && !\array_key_exists('$patch', $node)) {
            return $node;
        }

        $base = [];
        $patch = self::UNDEFINED;
        $own = [];

        // Preserve declaration order: $ref expands to the base; keys declared
        // after it override, keys before it are overridden by it (legacy positional
        // array_merge).
        foreach ($node as $k => $v) {
            if ($k === '$ref') {
                // base = (earlier own keys) overlaid by ref, matching legacy order
                // where the ref array_merges onto whatever was processed before it.
                $base = self::shallowMerge($own, self::resolve($v, $basepath, $loader, $visiting));
                // own keys already folded into base; reset so later keys override.
                $own = [];
            } elseif ($k === '$patch') {
                $patch = $v;
            } else {
                $own[$k] = $v;
            }
        }

        $result = self::shallowMerge($base, $own);
        if ($patch !== self::UNDEFINED) {
            $result = Patch::apply($result, $patch);
        }
        return $result;
    }

    /** Sentinel for "no $patch seen" (distinct from a present null $patch). */
    private const UNDEFINED = "\0__compose_undefined__\0";

    /**
     * Shallow merge: { ...a, ...b } — b's keys override a's, b's new keys append.
     * PHP array union (+) keeps left on clash, so this assigns b over a instead.
     * Insertion order follows a's order for shared keys, then b's new keys (the
     * JS spread { ...a, ...b } order).
     *
     * @param array<string, mixed> $a
     * @param array<string, mixed> $b
     * @return array<string, mixed>
     */
    private static function shallowMerge(array $a, array $b): array
    {
        $out = $a;
        foreach ($b as $k => $v) {
            $out[$k] = $v;
        }
        return JsonValue::orderedMembers($out);
    }

    /** Objects are stdClass values or non-list PHP associative arrays. */
    private static function isPlainObject(mixed $v): bool
    {
        return $v instanceof \stdClass || (\is_array($v) && !\array_is_list($v));
    }

    /** JS-style type name for $ref value-type error messages. */
    private static function typeName(mixed $v): string
    {
        if ($v === null) {
            return 'null';
        }
        if (\is_array($v)) {
            return 'array';
        }
        return \gettype($v);
    }
}
