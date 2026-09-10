/**
 * `$patch` application — add / remove / replace over the `$ref` base (SPEC
 * §5). Absorbs the legacy legacy directives `$after`/`$before`/`$merge`/`$change`/
 * `$remove` (the analysis legacy_mapping):
 *
 *   $after / $before {existing:{new:val}}  → add   (position = declaration order;
 *                                            CRUDUI properties preserve insert order)
 *   $merge / $change {key:{sub:val}}       → replace + add (deep-merge; scalar =
 *                                            replace, new subkey = add)
 *   $remove [k1,k2] | {k:{sub:…}}          → remove (whole key or deep subkey)
 *
 * CRUDUI normalization (the analysis patch_ops): `$patch` is an OBJECT of operations.
 * Two order-preserving input shapes are supported:
 *
 *   1. Deep-path set — `"field.validate.required": ".other"`. The dotted key is
 *      split into path segments and the value is SET at that node (creating
 *      intermediate objects). This is the SPEC §5 canonical form. The value
 *      replaces any scalar leaf; for object values it deep-merges (legacy $merge =
 *      drupal_array_merge_deep_array: both-array → deep merge, else latter wins).
 *
 *   2. Structured ops — explicit `add` / `remove` / `replace` keys:
 *        add:     { "path.to.new": value, … }   — deep-merge value at path
 *        replace: { "path.to.key": value, … }   — same merge rule (scalar override)
 *        remove:  [ "path.to.key", … ] | { … }  — deep delete (legacy arr::remove)
 *
 * Resolution order: base ($ref) first, then $patch overlays. add/replace
 * deep-merge; remove deep-deletes; deep-path set splits then applies. An
 * unresolved patch (op shape error, path conflict, strict-remove miss) is a
 * LOAD ERROR — never `valid:true`.
 */

import { ComposeLoadError } from './errors';

/** A `$patch` value: a flat deep-path map, and/or structured add/remove/replace. */
export type Patch = Record<string, unknown>;

/** Apply a `$patch` object to the (already `$ref`-expanded) base spec. */
export function applyPatch(base: Record<string, unknown>, patch: unknown): Record<string, unknown> {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new ComposeLoadError(
      'PATCH_SHAPE',
      `$patch must be an object of operations, got ${
        patch === null ? 'null' : Array.isArray(patch) ? 'array' : typeof patch
      }`
    );
  }
  const p = patch as Patch;
  let result = base;

  // Apply entries in declaration order (CRUDUI properties preserve order).
  for (const key of Object.keys(p)) {
    const val = p[key];
    if (key === 'add' || key === 'replace') {
      result = applyAddReplace(result, val, key);
    } else if (key === 'remove') {
      result = applyRemove(result, val);
    } else {
      // Deep-path set (SPEC §5 canonical form): "a.b.c": value.
      result = setDeepPath(result, splitPath(key), val);
    }
  }
  return result;
}

/** Structured add/replace: a map of deep-path → value, deep-merged at each path. */
function applyAddReplace(
  base: Record<string, unknown>,
  val: unknown,
  op: 'add' | 'replace'
): Record<string, unknown> {
  if (val === null || typeof val !== 'object' || Array.isArray(val)) {
    throw new ComposeLoadError(
      'PATCH_SHAPE',
      `$patch.${op} must be an object of deep-path → value`
    );
  }
  let result = base;
  for (const path of Object.keys(val as Record<string, unknown>)) {
    result = setDeepPath(result, splitPath(path), (val as Record<string, unknown>)[path]);
  }
  return result;
}

/** Structured remove: an array of deep-paths, or a nested `{k:{sub:…}}` map. */
function applyRemove(base: Record<string, unknown>, val: unknown): Record<string, unknown> {
  if (Array.isArray(val)) {
    let result = base;
    for (const path of val) {
      if (typeof path !== 'string') {
        throw new ComposeLoadError('PATCH_SHAPE', `$patch.remove array entries must be strings`);
      }
      result = removeDeepPath(result, splitPath(path));
    }
    return result;
  }
  if (val !== null && typeof val === 'object') {
    // Nested map form (legacy arr::remove): recurse where both sides are objects.
    return removeNested(base, val as Record<string, unknown>);
  }
  throw new ComposeLoadError(
    'PATCH_SHAPE',
    `$patch.remove must be an array of paths or a nested object`
  );
}

/** Split a dotted deep-path into segments. Empty path is a shape error. */
function splitPath(path: string): string[] {
  if (path === '') {
    throw new ComposeLoadError('PATCH_SHAPE', `$patch path must be non-empty`);
  }
  return path.split('.');
}

/**
 * Set a value at a deep path, creating intermediate objects. When both the
 * existing leaf and the new value are plain objects, DEEP-MERGE (legacy $merge);
 * otherwise the new value REPLACES (legacy scalar override). Returns a new tree
 * (the input is not mutated).
 */
function setDeepPath(
  node: Record<string, unknown>,
  segments: string[],
  value: unknown
): Record<string, unknown> {
  const [head, ...rest] = segments;
  const out: Record<string, unknown> = { ...node };

  if (rest.length === 0) {
    const existing = out[head];
    out[head] = mergeValue(existing, value);
    return out;
  }

  const child = out[head];
  if (child === undefined) {
    out[head] = setDeepPath({}, rest, value);
  } else if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
    out[head] = setDeepPath(child as Record<string, unknown>, rest, value);
  } else {
    // Intermediate node is a scalar/array — cannot descend into it.
    throw new ComposeLoadError(
      'PATCH_PATH_CONFLICT',
      `$patch cannot descend into non-object at '${head}'`
    );
  }
  return out;
}

/**
 * legacy deep-merge leaf rule (drupal_array_merge_deep_array): both plain objects →
 * recursive deep merge; otherwise the latter value wins (scalar/array override).
 */
function mergeValue(existing: unknown, incoming: unknown): unknown {
  if (
    existing !== null &&
    typeof existing === 'object' &&
    !Array.isArray(existing) &&
    incoming !== null &&
    typeof incoming === 'object' &&
    !Array.isArray(incoming)
  ) {
    const out: Record<string, unknown> = { ...(existing as Record<string, unknown>) };
    for (const k of Object.keys(incoming as Record<string, unknown>)) {
      out[k] = mergeValue(out[k], (incoming as Record<string, unknown>)[k]);
    }
    return out;
  }
  return incoming;
}

/** Delete a value at a deep path. Strict: a missing target is a load error. */
function removeDeepPath(
  node: Record<string, unknown>,
  segments: string[]
): Record<string, unknown> {
  const [head, ...rest] = segments;
  if (!(head in node)) {
    throw new ComposeLoadError(
      'PATCH_REMOVE_TARGET_MISSING',
      `$patch remove target not found: '${segments.join('.')}'`
    );
  }
  const out: Record<string, unknown> = { ...node };
  if (rest.length === 0) {
    delete out[head];
    return out;
  }
  const child = out[head];
  if (child === null || typeof child !== 'object' || Array.isArray(child)) {
    throw new ComposeLoadError(
      'PATCH_REMOVE_TARGET_MISSING',
      `$patch remove cannot descend into non-object at '${head}'`
    );
  }
  out[head] = removeDeepPath(child as Record<string, unknown>, rest);
  return out;
}

/**
 * Nested-map remove (legacy arr::remove): for each key, recurse when both the
 * target and the removal spec are objects, else unset the key. A missing key is
 * tolerated here (legacy arr::remove silently unsets), unlike the array-path form.
 */
function removeNested(
  base: Record<string, unknown>,
  spec: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(spec)) {
    const sub = spec[key];
    const target = out[key];
    if (
      key in out &&
      target !== null &&
      typeof target === 'object' &&
      !Array.isArray(target) &&
      sub !== null &&
      typeof sub === 'object' &&
      !Array.isArray(sub)
    ) {
      out[key] = removeNested(target as Record<string, unknown>, sub as Record<string, unknown>);
    } else {
      delete out[key];
    }
  }
  return out;
}
