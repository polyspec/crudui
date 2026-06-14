/**
 * CRUDUI render errors (Svelte) — surfaced failures, never silent.
 *
 * An unregistered field `type` is a GAP in the registry, not a valid render. In
 * the default (throw) mode it raises `UnsupportedFieldTypeError`, mirroring the
 * `ComposeLoadError` lane: every un-ported type is RED until ported. The standard
 * is not lowered — the registry is completed. The opt-in marker mode emits a
 * grep-able `data-unsupported-type` div + HTML comment instead of throwing.
 * Byte-identical to the React CRUDUI reference (shared 3-framework parity gate).
 */

/** An unregistered field type reached the renderer (default-throw mode). */
export class UnsupportedFieldTypeError extends Error {
  /** Stable error code (matches the conformance error lane). */
  readonly code = 'UNSUPPORTED_FIELD_TYPE' as const;
  /** The unregistered type string. */
  readonly type: string;
  /** The field path where it occurred. */
  readonly path: string;

  constructor(type: string, path: string) {
    super(`Unsupported field type "${type}" at "${path}" (no current emitter registered)`);
    this.name = 'UnsupportedFieldTypeError';
    this.type = type;
    this.path = path;
    Object.setPrototypeOf(this, UnsupportedFieldTypeError.prototype);
  }
}
