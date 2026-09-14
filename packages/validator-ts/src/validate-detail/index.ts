/** CRUDUI detail-spec structure validation using the shared composition checks. */

import { composeProperties, MemoryLoader, type FileLoader, resolveRef, applyPatch } from '../compose/index';
import type { FileSet, ValidationResult } from '../types';
import { scanForbiddenKeys } from '../forbidden-scan';

/** Options for a detail structure validation run. */
export interface ValidateDetailOptions {
  /** Virtual files available to composition references. */
  files?: FileSet;
  /** Custom composition loader. */
  loader?: FileLoader;
  /** Base directory for relative composition references. */
  basepath?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Validate a detail specification's composition and forbidden-key structure. */
export function validateDetail(
  spec: Record<string, unknown>,
  options: ValidateDetailOptions = {},
): ValidationResult {
  const loader = options.loader ?? new MemoryLoader(options.files ?? {});
  const opts = options.basepath ? { basepath: options.basepath } : {};
  const composed = composeDetailRoot(spec, loader, opts);
  if (isObject(composed.fields)) {
    scanForbiddenKeys({ ...composed, fields: composeProperties(composed.fields, loader, opts) }, []);
  } else {
    scanForbiddenKeys(composed, []);
  }
  return { valid: true, errors: [] };
}

function composeDetailRoot(
  spec: Record<string, unknown>,
  loader: FileLoader,
  opts: { basepath?: string },
): Record<string, unknown> {
  if (!('$ref' in spec) && !('$patch' in spec)) return { ...spec };
  const basepath = opts.basepath ?? '';
  let base: Record<string, unknown> = {};
  let patch: unknown;
  const own: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spec)) {
    if (key === '$ref') base = { ...own, ...resolveRef(value, basepath, loader) };
    else if (key === '$patch') patch = value;
    else own[key] = value;
  }
  let result = { ...base, ...own };
  if (patch !== undefined) result = applyPatch(result, patch);
  return result;
}

export { ComposeLoadError } from '../compose/index';
export default validateDetail;
