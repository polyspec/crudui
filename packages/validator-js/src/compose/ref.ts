/**
 * `$ref` resolution — base inheritance, resolved before anything else (schema
 * §5; legacy ReferenceResolver.php).
 *
 * Semantics ported from legacy (single source of truth):
 *   (1) value = a single string OR an array of strings — an array resolves each
 *       path in order, then array_merge (later overrides earlier on key clash).
 *   (2) plain path `OptionCombination.yml` → load YAML, descend by the default
 *       detectKey `['properties']` (= take the file's `properties` only).
 *   (3) path-specified `(file.yml).a.b` → regex split, detectKeys = ['a','b',
 *       'properties'] — descend a.b, then descend to `properties` underneath.
 *   (4) relative paths get the basepath '/' prefix; absolute (/-leading) pass
 *       through (handled by the FileLoader).
 *   (5) the result is recursively processed — nested `$ref` is expanded.
 *
 * CRUDUI normalization: `$ref` is the `properties`-layer composition entry point.
 * The resolved result is flattened to a single properties map and laid down as
 * the base; `$patch` overlays it (base first, patch overrides). Unresolved
 * `$ref` (missing file / bad format / absent detectKey / cycle) is a LOAD ERROR
 * — never `valid:true` (the legacy LargeForm.yml:873 bug).
 */

import { ComposeLoadError } from './errors';
import type { FileLoader, LoadedDoc } from './loader';
import { applyPatch } from './patch';

/** The regex that splits `(path).keys` — mirrors legacy ReferenceResolver:113. */
const PATH_SPEC_RE = /^\((?<path>.*?)\)\.(?<keys>.*)$/;

/**
 * Resolve a `$ref` value (string or string[]) to a single flattened properties
 * map. Each entry is resolved in declaration order and merged (later overrides
 * earlier). Nested `$ref` inside a resolved doc is expanded recursively. The
 * `visiting` set (canonical file keys on the current chain) detects cycles.
 */
export function resolveRef(
  value: unknown,
  basepath: string,
  loader: FileLoader,
  visiting: ReadonlySet<string> = new Set()
): Record<string, unknown> {
  const paths = normalizeRefValue(value);

  let merged: Record<string, unknown> = {};
  for (const path of paths) {
    const resolved = resolveSingleRef(path, basepath, loader, visiting);
    // array_merge: later keys override earlier (legacy resolve() semantics).
    merged = { ...merged, ...resolved };
  }
  return merged;
}

/** Normalize the `$ref` value into a list of path strings (legacy: scalar→[scalar]). */
function normalizeRefValue(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    for (const p of value) {
      if (typeof p !== 'string') {
        throw new ComposeLoadError(
          'REF_VALUE_TYPE',
          `$ref array entries must be strings, got ${typeof p}`
        );
      }
    }
    return value as string[];
  }
  throw new ComposeLoadError(
    'REF_VALUE_TYPE',
    `$ref must be a string or an array of strings, got ${
      value === null ? 'null' : typeof value
    }`
  );
}

/** Resolve one `$ref` path entry, descending detectKeys and expanding nested refs. */
function resolveSingleRef(
  rawPath: string,
  basepath: string,
  loader: FileLoader,
  visiting: ReadonlySet<string>
): Record<string, unknown> {
  const orgPath = rawPath;
  let path = rawPath;
  let detectKeys: string[] = ['properties'];

  // Path-specified form `(file.yml).a.b` (legacy: leading '(').
  if (path.startsWith('(')) {
    const m = PATH_SPEC_RE.exec(path);
    if (!m || !m.groups) {
      throw new ComposeLoadError(
        'REF_FORMAT_ERROR',
        `${orgPath} ref error`
      );
    }
    path = m.groups.path;
    const keys = m.groups.keys;
    // detectKeys = explode('.', keys) ++ ['properties'] (legacy:115).
    detectKeys = [...keys.split('.'), 'properties'];
  }

  // Empty path is a format error (legacy: ReferenceResolver:141).
  if (path === '') {
    throw new ComposeLoadError('REF_FORMAT_ERROR', `${orgPath} ref error`);
  }

  const key = loader.normalize(path, basepath);

  // Cycle detection: this file key already on the current resolution chain
  // (legacy has no guard and infinite-recurses; CRUDUI must detect — SPEC §7).
  if (visiting.has(key)) {
    throw new ComposeLoadError(
      'REF_CYCLE',
      `$ref cycle detected: ${[...visiting, key].join(' -> ')}`,
      [...visiting, key]
    );
  }

  const doc = loader.load(key); // throws REF_FILE_NOT_FOUND if absent

  // Descend detectKeys (legacy: ReferenceResolver:129-136).
  let node: unknown = doc;
  for (const detectKey of detectKeys) {
    if (
      node !== null &&
      typeof node === 'object' &&
      !Array.isArray(node) &&
      detectKey in (node as LoadedDoc)
    ) {
      node = (node as LoadedDoc)[detectKey];
    } else {
      throw new ComposeLoadError(
        'REF_DETECT_KEY_NOT_FOUND',
        `${detectKey} not found in ${orgPath}`,
        [...visiting, key]
      );
    }
  }

  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    // A properties layer must be a map. A scalar/array here is a malformed ref.
    throw new ComposeLoadError(
      'REF_DETECT_KEY_NOT_FOUND',
      `${orgPath} resolved to a non-object properties layer`,
      [...visiting, key]
    );
  }

  // Recursively expand nested $ref inside the resolved properties map. Add this
  // file key to the visiting chain so a deeper $ref back to it is a cycle.
  const nextVisiting = new Set(visiting);
  nextVisiting.add(key);
  return expandNestedRefs(node as Record<string, unknown>, basepath, loader, nextVisiting);
}

/**
 * Expand any `$ref` (and merge any `$patch`) sitting INSIDE a resolved
 * properties map, recursively (legacy: resolve() re-runs Parser::process). The
 * resolved base is laid down first, then sibling named keys override it (legacy
 * array_merge declaration order: a later plain key overrides an earlier $ref).
 */
function expandNestedRefs(
  node: Record<string, unknown>,
  basepath: string,
  loader: FileLoader,
  visiting: ReadonlySet<string>
): Record<string, unknown> {
  if (!('$ref' in node) && !('$patch' in node)) {
    return node;
  }

  let base: Record<string, unknown> = {};
  let patch: unknown;
  const own: Record<string, unknown> = {};

  // Preserve declaration order: $ref expands to the base; keys declared after it
  // override, keys before it are overridden by it (legacy positional array_merge).
  for (const k of Object.keys(node)) {
    if (k === '$ref') {
      // base = (earlier own keys) overlaid by ref, matching legacy order where the
      // ref array_merges onto whatever was processed before it.
      base = { ...own, ...resolveRef(node[k], basepath, loader, visiting) };
      // own keys already folded into base; reset so later keys override base.
      for (const ok of Object.keys(own)) delete own[ok];
    } else if (k === '$patch') {
      patch = node[k];
    } else {
      own[k] = node[k];
    }
  }

  let result = { ...base, ...own };
  if (patch !== undefined) {
    result = applyPatch(result, patch);
  }
  return result;
}
