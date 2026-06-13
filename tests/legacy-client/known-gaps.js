/**
 * Documented client(legacy dist.validate.js) <-> server(new validator-js/php/
 * go/rust) semantic divergences surfaced by this gate.
 *
 * Each entry is a real idempotency gap: the legacy browser runtime and the new
 * validators disagree on the SAME spec + input. These are NOT adapter bugs —
 * they reflect how dist.validate.js actually behaves (verified by driving its
 * own check()/methods under jsdom).
 *
 * Keyed by "<suiteFile> <testId>[<caseIndex>]". The gate treats a mismatch as
 * EXPECTED only if it is listed here. Any mismatch NOT listed fails the gate
 * (regression guard); any listed entry that stops mismatching also fails (so
 * the list cannot rot).
 *
 * ---------------------------------------------------------------------------
 * Single source of truth = logically correct behavior, not the legacy runtime
 * ---------------------------------------------------------------------------
 * The validation semantics are governed by docs/VALIDATION-RULES.md
 * "Validation Semantics Principles". Legacy defects are corrected, not
 * preserved: the new validators (validator-js/php/go/rust, 1044-case
 * cross-language idempotency) are the reference, and dist.validate.js is
 * patched toward them. Three legacy defects were corrected in
 * dist.validate.js and removed from this list:
 *   - required whitespace: value is trimmed before the emptiness check; a
 *     whitespace-only string fails required (required method).
 *   - implicit number: a type:number field rejects a non-numeric value even
 *     with no declared `number` rule (fixSpec injects `number: true` first).
 *   - malformed min/max threshold: a non-numeric (NaN) threshold makes the
 *     rule inapplicable and is skipped (min/max methods).
 *
 * Earlier-unified gaps (also corrected, also removed):
 *   - length unit: minlength/maxlength count Unicode code points.
 *   - conditional `in [..]` / `not in [..]` literal arrays.
 *   - conditional `== ''` empty-string literal comparison.
 *   - conditional `&&`/`||` precedence (`&&` binds tighter).
 *   - conditional ternary thresholds in a min/max param.
 *   - bare-path truthiness: a numeric value "0" is falsy (Boolean(0)).
 */
module.exports = {
  // --- "Infinity": both sides REJECT; they disagree only on which rule key
  // reports the failure. This is NOT one of the three corrected principles —
  // it is a separate question of what string counts as a number.
  //
  // New validators: isValidNumber("Infinity") === true (number.ts:25-26 accepts
  // the "Infinity"/"-Infinity" literals), so the implicit number passes and
  // max(100) rejects it -> error `max`.
  // Legacy client: the `number` method's regex
  //   /^(?:-?\d+|-?\d{1,3}(?:,\d{3})+)?(?:\.\d+)?$/
  // does NOT match "Infinity", so the implicit number rejects it first ->
  // error `number`. Correcting this would require widening the legacy number
  // regex to accept the Infinity literal — a distinct change outside the three
  // confirmed principles (required-trim, implicit-number-presence,
  // malformed-param-skip). Both runtimes still reject the value, so this is a
  // benign rule-key divergence, documented rather than forced.
  'min-max.json min-max-015[2]': 'both reject Infinity; new reports `max` (Infinity is a valid number, exceeds 100), legacy reports `number` (regex rejects the Infinity literal) — separate from the three corrected principles',
};
