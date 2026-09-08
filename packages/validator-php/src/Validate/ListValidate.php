<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Validate;

use CRUDUI\Validator\Compose\Compose;
use CRUDUI\Validator\Compose\FileLoader;
use CRUDUI\Validator\Compose\MemoryLoader;
use CRUDUI\Validator\Compose\Patch;
use CRUDUI\Validator\Compose\Ref;
use CRUDUI\Validator\ForbiddenScan;

/**
 * CRUDUI list-spec validation entry point — SPEC §9 read sister. Byte-for-byte
 * port of validator-ts/src/validate-list/index.ts (validateList).
 *
 * The read sister of Validate::run (validate). A list-spec describes the SAME
 * domain as a form-spec, shown as a list instead of accepted as input. It shares
 * the CRUDUI engine 100%: expression / i18n / design / composition ($ref/$patch) /
 * forbidden-key scan run the SAME code that form-spec runs. Nothing here
 * re-implements them.
 *
 * Pass model — list reuses form-spec passes 1 and 2, and STOPS:
 *
 *   1. compose (G5, structure) — $ref/$patch on the columns map are the
 *      composition entry point (the read mirror of form-spec properties); they
 *      expand through Compose::properties — the SAME engine. search is INPUT, a
 *      form-spec reference (SPEC §9.1), so a { $ref, $patch } search overlay
 *      expands through the SAME compose primitives. An unresolved composition
 *      throws ComposeLoadError HERE (a LOAD failure, NOT valid:false) — the spec
 *      never comes into existence.
 *   2. forbidden-scan (§6, structure) — ForbiddenScan::scan walks the COMPOSED
 *      list tree (columns / each Column / format options bucket / actions / sort /
 *      pagination / design / search) to arbitrary depth and rejects any forbidden
 *      meta key (display_switch/if/when/show_if/_/x{key}…) as a LOAD failure (code
 *      FORBIDDEN_META_KEY, dotted trace). Pure structure — no data.
 *
 * Pass 3 (DATA validate) does NOT apply: a list has no data (rows are INJECTED,
 * DB-agnostic — SPEC §9). There is no value to evaluate a validate slot against.
 * So this function NEVER validates rows.
 *
 * The "schema shape" checks — additionalProperties:false (1급 closed),
 * required:columns, the sort.dir/pagination.mode enums, and the polymorphic
 * CellFormat (anyOf) — are NOT this engine's job. The four-language CRUDUI engines do
 * not perform JSON-Schema-style shape validation (SPEC §8: JSON Schema is not
 * adopted). Those live ONLY in the meta-schema (ajv, list-metaschema). This entry
 * owns exactly the cross-language structure gate: compose + forbidden-scan. No new
 * invention.
 *
 * This NEVER touches form-spec Validate::run (R7 parallel run): it is a sibling
 * entry that reuses the shared Compose / ForbiddenScan modules.
 */
final class ListValidate
{
    /** Sentinel for "no $patch seen" (distinct from a present null $patch). */
    private const UNDEFINED = "\0__compose_undefined__\0";

    /**
     * Validate a CRUDUI list-spec STRUCTURE. The spec's columns map (and a { $ref,
     * $patch } search overlay) may carry composition; it is expanded first via the
     * compose pass — the SAME engine form-spec uses. An unresolved composition
     * throws ComposeLoadError (caller distinguishes a LOAD failure from
     * valid:false). A forbidden meta key anywhere in the composed list tree is
     * likewise a LOAD failure. NO rows/data are validated (SPEC §9: rows are
     * injected).
     *
     * @param array<string, mixed> $spec a CRUDUI list root spec ({ columns, search?, sort?, pagination?, actions?, empty?, design?, $ref?, $patch? }; columns may use composition)
     * @param array<string, array<string, mixed>>|null $files virtual file set for $ref resolution
     * @param FileLoader|null $loader a custom loader (overrides $files)
     * @param string $basepath basepath for relative $ref resolution
     *
     * @throws \CRUDUI\Validator\Compose\ComposeLoadError when composition cannot be resolved OR a forbidden meta key survives into the composed list tree
     */
    public static function run(
        array $spec,
        ?array $files = null,
        ?FileLoader $loader = null,
        string $basepath = '',
    ): ListValidationResult {
        $loader ??= new MemoryLoader($files ?? []);

        // Pass 1 (G5): compose. Build the composed list tree the forbidden-scan walks.
        //
        // List-root $ref/$patch (G5: a base list-spec inheritance) is applied first,
        // through the SAME Ref::resolve/Patch::apply primitives form-spec uses. The
        // base file exposes its list under a properties layer (the legacy detectKey
        // convention Ref enforces). An unresolved root $ref throws here.
        $composed = self::composeListRoot($spec, $loader, $basepath);

        // columns is the composition ENTRY POINT (read mirror of form-spec
        // properties): $ref/$patch on the columns map expand through
        // Compose::properties — the SAME engine. An unresolved columns $ref throws.
        if (self::isObject($composed['columns'] ?? null)) {
            /** @var array<string, mixed> $columns */
            $columns = $composed['columns'];
            $composed['columns'] = Compose::properties($columns, $loader, $basepath);
        }

        // search is INPUT — a form-spec reference (SPEC §9.1). A { $ref, $patch }
        // search overlay expands through the SAME compose primitives; its expanded
        // sub-form then rides the SAME forbidden-scan below (no separate invention).
        if (
            self::isObject($composed['search'] ?? null)
            && (\array_key_exists('$ref', $composed['search']) || \array_key_exists('$patch', $composed['search']))
        ) {
            /** @var array<string, mixed> $search */
            $search = $composed['search'];
            $composed['search'] = Compose::properties($search, $loader, $basepath);
        }

        // Pass 2 (§6): forbidden-scan over the WHOLE composed list tree to arbitrary
        // depth. A hit (a condition-only/legacy/magic meta key or an x{key} residue
        // anywhere — a forbidden COLUMN key, a show_if on a Column, an if one level
        // below the open CellFormat options bucket, …) is a LOAD failure, never
        // valid:false. The trace points at the shallowest offending key.
        ForbiddenScan::scan($composed, []);

        // Structure loaded clean. No rows → no data validation (SPEC §9). The
        // "schema shape" checks are the meta-schema's job, not this engine's.
        return new ListValidationResult(true, []);
    }

    /**
     * Apply a list-root $ref/$patch (G5: base list-spec inheritance), reusing the
     * SAME Ref::resolve/Patch::apply primitives form-spec compose uses. When the
     * root has no composition keys the spec is returned unchanged (a shallow copy).
     * The base file is resolved through Ref::resolve (the legacy detectKey
     * properties-layer convention) so a missing/malformed base is a LOAD failure
     * here.
     *
     * @param array<string, mixed> $spec
     * @return array<string, mixed>
     */
    private static function composeListRoot(array $spec, FileLoader $loader, string $basepath): array
    {
        if (!\array_key_exists('$ref', $spec) && !\array_key_exists('$patch', $spec)) {
            return $spec;
        }

        $base = [];
        $patch = self::UNDEFINED;
        $own = [];
        foreach ($spec as $k => $v) {
            if ($k === '$ref') {
                // base = (earlier own keys) overlaid by ref (legacy declaration order).
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

    /** A JSON object: a non-list array (or the empty array, read as {}); never a scalar/null/list. */
    private static function isObject(mixed $v): bool
    {
        return \is_array($v) && ($v === [] || !\array_is_list($v));
    }
}
