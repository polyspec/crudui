/**
 * legacy→schema translator (reference) — public surface.
 *
 * SPEC→SPEC migration (schema-NEW, R7 parallel run): translate a legacy legacy field spec
 * into the canonical schema model, and reverse the REVERSIBLE subset for the
 * round-trip gate. The translator is the ONLY recognizer of legacy key names —
 * the schema meta-schema and forbidden-scan never recognize them (R2/R4). Translator
 * output passes the meta-schema and forbidden-scan (zero meta keys), never runs
 * `eval`, and never mutates the legacy input.
 *
 * Round-trip (SPEC §6): legacy→schema→legacy = original bit-for-bit holds ONLY over the
 * reversible key set. `roundtripLegacy` runs the loop and reports whether the input
 * stayed inside that set (note log empty) — an input with any irreversible
 * absorption is OUTSIDE the gate by construction (R7), not a translator bug.
 */

export { translateFromLegacy } from './from-legacy';
export { translateToLegacy } from './to-legacy';
export type {
  LegacySpec,
  SchemaSpec,
  TranslateResult,
  TranslateNote,
  KeyMapping,
  IrreversibleReason,
} from './types';
export { KEY_MAPPINGS } from './types';

import { translateFromLegacy } from './from-legacy';
import { translateToLegacy } from './to-legacy';
import type { LegacySpec, TranslateNote } from './types';

/** Outcome of a legacy→schema→legacy round-trip. */
export interface RoundtripResult {
  /** The intermediate schema spec. */
  schema: Record<string, unknown>;
  /** The reverse-translated legacy spec. */
  back: LegacySpec;
  /** The irreversibility log from the forward pass. */
  notes: TranslateNote[];
  /** Whether the input is in the reversible set (no irreversible absorption fired). */
  reversible: boolean;
  /** Whether `back` equals the input bit-for-bit (only asserted when reversible). */
  lossless: boolean;
}

/**
 * Run legacy→schema→legacy and report losslessness. When the forward pass logged no
 * irreversible absorption (`reversible:true`), `back` must equal the input
 * bit-for-bit; the helper computes both so a test can assert the gate. When the
 * input used an irreversible key, `reversible:false` — the round-trip is OUTSIDE
 * the SPEC §6 gate (R7) and `lossless` is informational only.
 */
export function roundtripLegacy(legacy: LegacySpec): RoundtripResult {
  const { schema, notes } = translateFromLegacy(legacy);
  const back = translateToLegacy(schema);
  const reversible = notes.length === 0;
  const lossless = deepEqual(legacy, back);
  return { schema, back, notes, reversible, lossless };
}

/** Structural deep-equality (key order irrelevant; value-identical required). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}
