/**
 * Composition orchestrator (schema §5, G5) — the parser's FIRST pass.
 *
 * Resolution order (schema §5, verbatim):
 *   (1) $ref   — expand file/path base, recursively (nested $ref included) into a
 *                single properties base.
 *   (2) $patch — overlay add/remove/replace and deep-path set on that base.
 *   (3) the result is the equivalent SINGLE SPEC (composition keys eliminated).
 *   (4) the field layer (validate/design/behavior/options) then applies to it.
 *
 * G5 (SPEC §2): the parser expands composition first, producing a single spec,
 * BEFORE applying the field layer — without composition a `$ref`-using spec
 * cannot even be loaded. So composition is a pre-processing pass that runs
 * BEFORE validation/render, not a validation step.
 *
 * legacy's positional `array_merge` priority is normalized here: `$ref` = base
 * (first), `$patch` = overlay (later) — base is laid down, patch overrides.
 *
 * `composeProperties` is the entry point: it operates on a `properties` map (the
 * composition entry point, SPEC §2 / types.ts:73) where `$ref`/`$patch` may sit
 * alongside named child fields. `composeSpec` recurses the whole field tree so a
 * `$ref` nested inside any child `properties` is expanded too. Both throw a
 * `ComposeLoadError` for any unresolved composition (never `valid:true`).
 */

import { resolveRef } from './ref';
import { applyPatch } from './patch';
import type { FileLoader } from './loader';

/** Options for a composition pass. */
export interface ComposeOptions {
  /** Basepath for relative `$ref` resolution (legacy ReferenceResolver basepath). */
  basepath?: string;
}

/**
 * Compose a `properties` map: expand `$ref` to a base, overlay `$patch`, return
 * the single (composition-free) properties map. Named sibling keys follow legacy
 * declaration order — a key declared after `$ref` overrides the base; a key
 * declared before it is overridden by the base.
 */
export function composeProperties(
  properties: Record<string, unknown>,
  loader: FileLoader,
  opts: ComposeOptions = {}
): Record<string, unknown> {
  const basepath = opts.basepath ?? '';

  let base: Record<string, unknown> = {};
  let patch: unknown;
  const own: Record<string, unknown> = {};
  let sawPatch = false;

  for (const k of Object.keys(properties)) {
    if (k === '$ref') {
      // $ref array_merges onto whatever was declared before it (legacy order).
      base = { ...own, ...resolveRef(properties[k], basepath, loader) };
      for (const ok of Object.keys(own)) delete own[ok];
    } else if (k === '$patch') {
      sawPatch = true;
      patch = properties[k];
    } else {
      own[k] = properties[k];
    }
  }

  // No composition keys: still recurse into children so nested $ref expands.
  let result: Record<string, unknown> = { ...base, ...own };
  if (sawPatch) {
    result = applyPatch(result, patch);
  }

  // Recurse into every child field's `properties` (the tree may compose deeper).
  for (const fieldName of Object.keys(result)) {
    const field = result[fieldName];
    if (field !== null && typeof field === 'object' && !Array.isArray(field)) {
      result[fieldName] = composeSpec(field as Record<string, unknown>, loader, opts);
    }
  }

  return result;
}

/**
 * Compose a full field spec: expand a field-level `$ref`/`$patch`, then recurse
 * into its `properties` (which may itself compose). Returns the single spec.
 */
export function composeSpec(
  spec: Record<string, unknown>,
  loader: FileLoader,
  opts: ComposeOptions = {}
): Record<string, unknown> {
  const basepath = opts.basepath ?? '';

  // Each branch assigns `resolved` exactly once (no useless first write).
  let resolved: Record<string, unknown>;

  // Field-level $ref / $patch (a field may inherit a whole base spec).
  if ('$ref' in spec || '$patch' in spec) {
    let base: Record<string, unknown> = {};
    let patch: unknown;
    const own: Record<string, unknown> = {};
    for (const k of Object.keys(spec)) {
      if (k === '$ref') {
        // Field-level $ref resolves a file's properties layer too (legacy detectKey).
        base = { ...own, ...resolveRef(spec[k], basepath, loader) };
        for (const ok of Object.keys(own)) delete own[ok];
      } else if (k === '$patch') {
        patch = spec[k];
      } else {
        own[k] = spec[k];
      }
    }
    resolved = { ...base, ...own };
    if (patch !== undefined) {
      resolved = applyPatch(resolved, patch);
    }
  } else {
    resolved = { ...spec };
  }

  // Recurse into `properties` (composition entry point, SPEC §2 / types.ts:73).
  const props = resolved.properties;
  if (props !== null && typeof props === 'object' && !Array.isArray(props)) {
    resolved.properties = composeProperties(props as Record<string, unknown>, loader, opts);
  }

  return resolved;
}
