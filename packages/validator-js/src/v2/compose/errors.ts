/**
 * Composition load errors (SPEC-V2 §5, §7; unresolved_behavior).
 *
 * Composition is a pre-processing pass that runs BEFORE validation/render: the
 * parser expands `$ref`/`$patch` into a single spec first (G5). An unresolved
 * composition is therefore NOT a validation failure (`valid:false`) — it is a
 * LOAD FAILURE: the spec itself does not come into existence. Never let an
 * unresolved `$ref` pass as `valid:true` (the current v1 bug at
 * ProductNft.yml:873). Every throw here is a load error, distinct from a later
 * validation error.
 *
 * v1 throw sites promoted to v2 load errors:
 *   (1) $ref file missing            — ReferenceResolver.php:124 (yml_parse_file)
 *   (2) $ref format error            — ReferenceResolver.php:113,141 ('… ref error')
 *   (3) detectKey absent             — ReferenceResolver.php:133 ('… not found')
 *   (4) $ref cycle (A→B→A)           — v1 infinite-recurses (no guard); v2 detects
 *   (5) $patch target/op error       — $merge/$change undefined key throws (Parser:241)
 */

/** Base class for every composition load failure. NOT a validation error. */
export class ComposeLoadError extends Error {
  /** Stable machine-readable code (one per unresolved-behavior class). */
  readonly code: ComposeErrorCode;
  /** The composition path stack when the error occurred (for cycle/trace). */
  readonly trace: string[];

  constructor(code: ComposeErrorCode, message: string, trace: string[] = []) {
    super(message);
    this.name = 'ComposeLoadError';
    this.code = code;
    this.trace = trace;
    // Restore prototype chain (TS target ES2020 + extending Error).
    Object.setPrototypeOf(this, ComposeLoadError.prototype);
  }
}

/** Machine-readable load-error codes. */
export type ComposeErrorCode =
  /** $ref points at a file that does not exist (v1 yml_parse_file fail). */
  | 'REF_FILE_NOT_FOUND'
  /** $ref string is malformed: `(…` with no closing `).keys`, or empty path. */
  | 'REF_FORMAT_ERROR'
  /** A detectKey path segment (or the trailing `properties`) is absent. */
  | 'REF_DETECT_KEY_NOT_FOUND'
  /** $ref cycle detected (A→B→A); v1 would infinite-recurse. */
  | 'REF_CYCLE'
  /** $ref value is neither a string nor an array of strings. */
  | 'REF_VALUE_TYPE'
  /** $patch is not an object of deep-path → value entries. */
  | 'PATCH_SHAPE'
  /** $patch op targets a path whose intermediate node is a non-object scalar. */
  | 'PATCH_PATH_CONFLICT'
  /** $patch remove targets a path that does not exist (strict remove). */
  | 'PATCH_REMOVE_TARGET_MISSING'
  /**
   * A forbidden meta key survived into the composed single spec at some depth
   * (SPEC-V2 §6). The recursive forbidden-scan runs after compose/x-strip and
   * before validation; a forbidden key anywhere is a LOAD failure, never
   * `valid:true`. `trace` carries the dotted path to the offending key.
   */
  | 'FORBIDDEN_META_KEY';
