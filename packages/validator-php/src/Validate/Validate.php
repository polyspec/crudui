<?php

declare(strict_types=1);

namespace FormSpec\Validator\Validate;

use FormSpec\Validator\Compose\Compose;
use FormSpec\Validator\Compose\FileLoader;
use FormSpec\Validator\Compose\MemoryLoader;
use FormSpec\Validator\ForbiddenScan;

/**
 * CRUDUI validation entry point — schema §2 pipeline. Port of validator-js
 * src/validate/index.ts (validate).
 *
 * Wires the three CRUDUI passes in order (G5 compose first → §3 traversal → §2 G1
 * value evaluation):
 *
 *   1. compose  — Compose expands $ref/$patch into a single spec. An unresolved
 *                 composition throws a ComposeLoadError HERE (a LOAD failure, NOT
 *                 valid:false) — the spec never comes into existence, so there is
 *                 no validation result to return. This closes the legacy
 *                 valid:true-on-unresolved-$ref gap (ProductNft.yml:873).
 *   2/3. validate — Validator traverses the composed spec and runs the `validate`
 *                 slot (conditional rule values evaluated by the CRUDUI expression
 *                 engine, then handed to the reused legacy rule instances).
 *
 * The compose pass reuses the CRUDUI compose module; the expression engine and rule
 * instances are reused as-is. Nothing here re-implements them, and nothing here
 * touches the legacy Validator (R7 parallel run).
 */
final class Validate
{
    /**
     * Validate `data` against a CRUDUI spec. The spec may carry $ref/$patch; they are
     * expanded first via the compose pass. An unresolved composition throws a
     * ComposeLoadError (caller distinguishes a LOAD failure from valid:false).
     *
     * Two entry shapes (JS validate parity):
     *   (a) a full root group spec { type:'group', properties:{…} } — compose the
     *       whole spec, then read its composed `properties`.
     *   (b) a properties-layer composition entry { $ref, $patch } with no own
     *       `properties` — compose it AS a properties map directly. A top-level
     *       $ref flattens the base file's `properties` into this map.
     *
     * @param array<string, mixed> $spec a CRUDUI root spec (group with `properties`; may compose)
     * @param array<string, mixed> $data the form data to validate
     * @param array<string, array<string, mixed>>|null $files virtual file set for $ref resolution
     * @param FileLoader|null $loader a custom loader (overrides $files)
     * @param string $basepath basepath for relative $ref resolution
     *
     * @throws \FormSpec\Validator\Compose\ComposeLoadError when composition cannot be resolved
     */
    public static function run(
        array $spec,
        array $data,
        ?array $files = null,
        ?FileLoader $loader = null,
        string $basepath = '',
    ): ValidationResult {
        $loader ??= new MemoryLoader($files ?? []);

        $hasOwnProperties = isset($spec['properties'])
            && is_array($spec['properties'])
            && !array_is_list($spec['properties']);
        $isCompositionEntry = array_key_exists('$ref', $spec) || array_key_exists('$patch', $spec);

        // Pass 1 (G5): compose. Throws ComposeLoadError on unresolved $ref/$patch.
        if ($isCompositionEntry && !$hasOwnProperties) {
            $properties = Compose::properties($spec, $loader, $basepath);
        } else {
            $composed = Compose::spec($spec, $loader, $basepath);
            $props = $composed['properties'] ?? [];
            $properties = (is_array($props) && !array_is_list($props)) ? $props : [];
        }

        // Load-path forbidden-scan (schema §6): walk the composed single spec to
        // arbitrary depth and reject any forbidden meta key BEFORE validation
        // entry. A hit throws ComposeLoadError (a LOAD failure), never valid:false.
        // This closes the deep-nesting leak the typed models alone could not (R1).
        ForbiddenScan::scan($properties, ['properties']);

        // Pass 2/3 (§3 + §2 G1): traverse + evaluate the validate slot.
        return (new Validator(['type' => 'group', 'properties' => $properties]))->validate($data);
    }
}
