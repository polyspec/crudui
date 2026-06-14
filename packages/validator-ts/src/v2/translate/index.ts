/**
 * v1→v2 translator (reference) — public surface.
 *
 * SPEC→SPEC migration (v2-NEW, R7 parallel run): translate a legacy v1 field spec
 * into the canonical v2 model, and reverse the REVERSIBLE subset for the
 * round-trip gate. The translator is the ONLY recognizer of legacy key names —
 * the v2 meta-schema and forbidden-scan never recognize them (R2/R4). Translator
 * output passes the meta-schema and forbidden-scan (zero meta keys), never runs
 * `eval`, and never mutates the v1 input.
 *
 * Round-trip (SPEC §6): v1→v2→v1 = original bit-for-bit holds ONLY over the
 * reversible key set. `roundtripV1` runs the loop and reports whether the input
 * stayed inside that set (note log empty) — an input with any irreversible
 * absorption is OUTSIDE the gate by construction (R7), not a translator bug.
 */

export { translateV1ToV2 } from './v1tov2';
export { translateV2ToV1 } from './v2tov1';
export type {
  V1Spec,
  V2Spec,
  TranslateResult,
  TranslateNote,
  KeyMapping,
  IrreversibleReason,
} from './types';
export { KEY_MAPPINGS } from './types';

import { translateV1ToV2 } from './v1tov2';
import { translateV2ToV1 } from './v2tov1';
import type { V1Spec, TranslateNote } from './types';

/** Outcome of a v1→v2→v1 round-trip. */
export interface RoundtripResult {
  /** The intermediate v2 spec. */
  v2: Record<string, unknown>;
  /** The reverse-translated v1 spec. */
  back: V1Spec;
  /** The irreversibility log from the forward pass. */
  notes: TranslateNote[];
  /** Whether the input is in the reversible set (no irreversible absorption fired). */
  reversible: boolean;
  /** Whether `back` equals the input bit-for-bit (only asserted when reversible). */
  lossless: boolean;
}

/**
 * Run v1→v2→v1 and report losslessness. When the forward pass logged no
 * irreversible absorption (`reversible:true`), `back` must equal the input
 * bit-for-bit; the helper computes both so a test can assert the gate. When the
 * input used an irreversible key, `reversible:false` — the round-trip is OUTSIDE
 * the SPEC §6 gate (R7) and `lossless` is informational only.
 */
export function roundtripV1(v1: V1Spec): RoundtripResult {
  const { v2, notes } = translateV1ToV2(v1);
  const back = translateV2ToV1(v2);
  const reversible = notes.length === 0;
  const lossless = deepEqual(v1, back);
  return { v2, back, notes, reversible, lossless };
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
