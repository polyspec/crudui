/**
 * Documented client(legacy dist.validate.js) <-> server(new validator-ts/php/
 * go/rust) semantic differences reported by this comparison.
 *
 * Each entry is a real idempotency gap: the legacy browser runtime and the new
 * validators disagree on the SAME spec + input. These are NOT adapter bugs —
 * they reflect how dist.validate.js actually behaves (verified by driving its
 * own check()/methods under jsdom).
 *
 * Keyed by "<suiteFile> <testId>[<caseIndex>]". The comparison treats a mismatch as
 * expected only if it is listed here. Any unlisted mismatch fails the comparison
 * (regression guard); any listed entry that stops mismatching also fails (so
 * the list cannot rot).
 *
 * ---------------------------------------------------------------------------
 * Single source of truth = logically correct behavior, not the legacy runtime
 * ---------------------------------------------------------------------------
 * The validation semantics are governed by docs/spec/validation-rules.md
 * "Validation Semantics Principles". Legacy defects are corrected, not
 * preserved: the new validators (validator-ts/php/go/rust, 1044-case
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
 *   - non-finite number input: "Infinity"/"-Infinity"/"NaN" are rejected as a
 *     `number` error on both sides — a number input value must be finite
 *     (number.ts isFinite). Both runtimes now report the SAME rule key.
 *
 * No documented gaps remain: the legacy client matches the new validators on
 * every comparable case. Any new mismatch fails the comparison.
 */
module.exports = {};
