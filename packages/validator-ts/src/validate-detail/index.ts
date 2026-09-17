/** CRUDUI detail-spec structure validation using the shared composition checks. */

import { composeProperties, MemoryLoader, type FileLoader } from '../compose/index';
import { composeRoot } from '../compose-root';
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
  // The root composes exactly as a list root does.
  const composed = composeRoot(spec, loader, opts);
  if (isObject(composed.fields)) {
    scanForbiddenKeys({ ...composed, fields: composeProperties(composed.fields, loader, opts) }, []);
  } else {
    scanForbiddenKeys(composed, []);
  }
  return { valid: true, errors: [] };
}
