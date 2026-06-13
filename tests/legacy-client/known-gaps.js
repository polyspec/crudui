/**
 * Documented client(legacy legacy-client.validate.js) <-> server(new validator-js/php/
 * go/rust) semantic divergences surfaced by this gate.
 *
 * Each entry is a real idempotency gap: the legacy browser runtime and the new
 * validators disagree on the SAME spec + input. These are NOT adapter bugs —
 * they reflect how legacy-client.validate.js actually behaves (verified by driving its
 * own check()/methods under jsdom).
 *
 * Keyed by "<suiteFile> <testId>[<caseIndex>]". The gate treats a mismatch as
 * EXPECTED only if it is listed here. Any mismatch NOT listed fails the gate
 * (regression guard); any listed entry that stops mismatching also fails (so
 * the list cannot rot).
 *
 * ---------------------------------------------------------------------------
 * Why these remain after the client<->server unification pass
 * ---------------------------------------------------------------------------
 * The legacy SERVER (Legacy Form/Validation.php @ pin a47ccba) is the single
 * source of truth. Six client/server semantic divergences were reviewed against
 * that file. For every remaining gap below the legacy CLIENT already AGREES with
 * the legacy SERVER — it is the NEW validators that diverge (an intentional
 * strengthening). The legacy client could not be patched toward the new
 * validators without contradicting the legacy-server truth, and the new
 * validator src is locked (1030-case cross-language idempotency). So they stay
 * documented, not "fixed".
 *
 * Gaps that WERE unified (legacy client patched to match the legacy server =
 * new validators, removed from this list):
 *   - length unit: minlength/maxlength now count Unicode code points
 *     (Validation.php:468 preg_split('//u')), not UTF-16 code units.
 *   - conditional `in [..]` / `not in [..]` literal arrays.
 *   - conditional `== ''` empty-string literal comparison.
 *   - conditional `&&`/`||` precedence (`&&` binds tighter).
 *   - conditional ternary thresholds in a min/max param.
 *   - bare-path truthiness: a numeric value "0" is now falsy (Boolean(0)).
 */
module.exports = {
  // --- required: legacy does NOT trim; whitespace-only passes required ---
  // legacy-client.validate.js required (value.length > 0 only) AND the legacy server
  // Validation.php:96 (0 < strlen((string)$value), no trim) both PASS a
  // whitespace-only string. The NEW validators trim (required.ts:18
  // value.trim() === '') and reject. The client matches the legacy server;
  // the new validators are the divergent (stricter) side. Cannot patch the
  // client toward the new validators without breaking from legacy-server truth.
  'required.json required-004[0]': 'legacy server (Validation.php:96 strlen, no trim) passes whitespace; new validators trim',
  'required.json required-004[1]': 'legacy server (Validation.php:96 strlen, no trim) passes whitespace; new validators trim',
  'required.json required-004[2]': 'legacy server (Validation.php:96 strlen, no trim) passes whitespace; new validators trim',
  'required.json required-004[3]': 'legacy server (Validation.php:96 strlen, no trim) passes whitespace; new validators trim',
  'required.json required-004[5]': 'legacy server (Validation.php:96 strlen, no trim) passes whitespace; new validators trim',
  'required.json required-019[1]': 'legacy server (Validation.php:96 strlen, no trim) passes whitespace; new validators trim',

  // --- implicit number rule: new validators reject non-numeric for type:number
  // even with no explicit `number` rule; legacy runs only declared rules. ---
  // Legacy server Validation.php (check(): foreach $property['rules']) runs ONLY
  // declared rules — there is no implicit number. legacy-client.validate.js does the
  // same. The NEW validators add an implicit number check for type:number
  // fields (Validator.ts:618-648, documented there as "intentional
  // strengthening, legacy had no implicit number at all"). Client matches the
  // legacy server; the new validators are the divergent side.
  'min-max.json min-max-015[0]': 'legacy server runs only declared rules (no implicit number); new validators add implicit number',
  'min-max.json min-max-015[1]': 'legacy server runs only declared rules (no implicit number); new validators add implicit number',
  'min-max.json min-max-015[2]': 'Infinity: new validators reject via implicit number/max; legacy server string-compares (passes)',
  'number-implicit.json number-implicit-norules-001[0]': 'legacy server runs only declared rules (no implicit number); new validators add implicit number',
  'number-implicit.json number-implicit-norules-001[1]': 'legacy server runs only declared rules (no implicit number); new validators add implicit number',
  'number-implicit.json number-implicit-group-001[0]': 'legacy server runs only declared rules (no implicit number); new validators add implicit number',

  // --- malformed threshold: new validators skip a non-numeric min/max param;
  // legacy does a raw comparison (value >= "xyz") and fails. ---
  // Legacy server Validation.php:148 `$value >= $param` with a non-numeric
  // param does a PHP loose comparison: "5" >= "xyz" === false -> min FAILS
  // (verified: PHP 8.4 "5" >= "xyz" => false). legacy-client.validate.js `value >= param`
  // does the same JS string comparison -> fails. The NEW validators skip a
  // malformed (NaN) threshold (min.ts:58-61 Number(ruleParam) isNaN -> null).
  // Client matches the legacy server; the new validators are the divergent side.
  // (Only `min` reproduces; for `max`, "5" <= "abc" === true on both server and
  // legacy, which already agrees with the new validators, so it is not a gap.)
  'malformed-threshold.json malformed-min-001[0]': 'legacy server (Validation.php:148 "5">="xyz"=false) fails; new validators skip malformed min',
  'malformed-threshold.json malformed-min-001[1]': 'legacy server (Validation.php:148 string-compares) fails; new validators skip malformed min',
};
