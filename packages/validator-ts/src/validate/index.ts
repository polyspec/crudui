/**
 * CRUDUI validation entry point (reference) — SPEC §2 pipeline.
 *
 * Wires the three CRUDUI passes in order (G5 compose first → §3 traversal → §2 G1
 * value evaluation):
 *
 *   1. compose  — `composeSpec` expands `$ref`/`$patch` into a single spec.
 *                 An unresolved composition throws `ComposeLoadError` HERE
 *                 (a LOAD failure, NOT `valid:false`) — the spec never comes
 *                 into existence, so there is no validation result to return.
 *                 This closes the legacy `valid:true`-on-unresolved-`$ref` gap
 *                 (ProductNft.yml:873).
 *   2/3. validate — `Validator` traverses the composed spec and runs the
 *                 `validate` slot (conditional rule values evaluated by the CRUDUI
 *                 expression engine, then handed to the existing rule registry).
 *
 * The compose pass reuses the existing compose module; the expression engine and
 * rule registry are reused as-is. Nothing here re-implements them, and nothing
 * here touches the legacy model (R7 parallel run).
 */

import {
  composeSpec,
  composeProperties,
  MemoryLoader,
} from '../compose/index';
import type { FileLoader } from '../compose/index';
import type { ValidationResult } from '../types';
import { scanForbiddenKeys } from '../forbidden-scan';
import { Validator } from './validator';

export { Validator } from './validator';
export { ComposeLoadError } from '../compose/index';

/** A virtual file set `$ref` resolves against (`{ key: doc }`). */
export type FileSet = Record<string, Record<string, unknown>>;

/** Options for a CRUDUI validation run. */
export interface ValidateOptions {
  /** Virtual file set for `$ref` resolution (default: empty — no `$ref`). */
  files?: FileSet;
  /** A custom loader (overrides `files`). */
  loader?: FileLoader;
  /** Basepath for relative `$ref` resolution. */
  basepath?: string;
}

/**
 * Validate `data` against a CRUDUI spec. The spec may carry `$ref`/`$patch`; they
 * are expanded first via the compose pass. An unresolved composition throws
 * `ComposeLoadError` (caller distinguishes a LOAD failure from `valid:false`).
 *
 * @param spec a CRUDUI root spec (a group with `properties`; may use composition).
 * @param data the form data to validate.
 * @param options compose loader / file set / basepath.
 * @returns `{ valid, errors }`.
 * @throws {ComposeLoadError} when composition cannot be resolved.
 */
export function validate(
  spec: Record<string, unknown>,
  data: Record<string, unknown>,
  options: ValidateOptions = {}
): ValidationResult {
  const loader: FileLoader =
    options.loader ?? new MemoryLoader(options.files ?? {});
  const opts = options.basepath ? { basepath: options.basepath } : {};

  // Pass 1 (G5): compose. Throws ComposeLoadError on unresolved $ref/$patch.
  //
  // The validation entry resolves to a single `properties` field map. Two entry
  // shapes:
  //   (a) a full root group spec `{ type:'group', properties:{…} }` — compose
  //       the whole spec, then read its composed `properties`.
  //   (b) a properties-layer composition entry `{ $ref, $patch }` (the
  //       composition entry point IS `properties`, types.ts) with no own
  //       `properties` — compose it AS a properties map directly. A top-level
  //       `$ref` flattens the base file's `properties` into this map.
  // Pass 2/3 (§3 + §2 G1): traverse + evaluate the validate slot.
  const hasOwnProperties =
    spec.properties !== null &&
    typeof spec.properties === 'object' &&
    !Array.isArray(spec.properties);
  const isCompositionEntry = '$ref' in spec || '$patch' in spec;

  const properties: Record<string, unknown> =
    isCompositionEntry && !hasOwnProperties
      ? composeProperties(spec, loader, opts)
      : (composeSpec(spec, loader, opts).properties as Record<string, unknown>) ?? {};

  // Load-path forbidden-scan (SPEC §6): walk the composed single spec to
  // arbitrary depth and reject any forbidden meta key BEFORE validation entry.
  // A hit throws ComposeLoadError (a LOAD failure), never `valid:false`. This
  // closes the deep-nesting leak the typed models alone could not (R1).
  scanForbiddenKeys(properties, ['properties']);

  return new Validator({ type: 'group', properties }).validate(data ?? {});
}

export default validate;
