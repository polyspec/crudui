/** Root composition shared by the list and detail structure validators. */

import { resolveRef, applyPatch } from './compose/index';
import type { FileLoader } from './compose/index';

/**
 * Apply a specification root `$ref`/`$patch` (base specification inheritance) with the same
 * resolveRef/applyPatch primitives form composition uses. A root without composition keys is
 * returned as a shallow copy. The base file is resolved through resolveRef (a `properties` layer),
 * so a missing or malformed base is a load failure. Own keys written before `$ref` yield to the
 * base; own keys written after it override the base; `$patch` applies last.
 */
export function composeRoot(
  spec: Record<string, unknown>,
  loader: FileLoader,
  opts: { basepath?: string }
): Record<string, unknown> {
  if (!('$ref' in spec) && !('$patch' in spec)) {
    return { ...spec };
  }
  const basepath = opts.basepath ?? '';
  let base: Record<string, unknown> = {};
  let patch: unknown;
  const own: Record<string, unknown> = {};
  for (const k of Object.keys(spec)) {
    if (k === '$ref') {
      base = { ...own, ...resolveRef(spec[k], basepath, loader) };
      for (const ok of Object.keys(own)) delete own[ok];
    } else if (k === '$patch') {
      patch = spec[k];
    } else {
      own[k] = spec[k];
    }
  }
  let resolved: Record<string, unknown> = { ...base, ...own };
  if (patch !== undefined) {
    resolved = applyPatch(resolved, patch);
  }
  return resolved;
}

