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
 */
module.exports = {
  // --- required: legacy does not trim; whitespace-only passes required ---
  // legacy-client.validate.js required (line 1129-1131) checks value.length>0 only.
  // New validators reject whitespace-only. A user typing only spaces passes
  // the browser but fails the server.
  'required.json required-004[0]': 'legacy required does not trim whitespace',
  'required.json required-004[1]': 'legacy required does not trim whitespace',
  'required.json required-004[2]': 'legacy required does not trim whitespace',
  'required.json required-004[3]': 'legacy required does not trim whitespace',
  'required.json required-004[5]': 'legacy required does not trim whitespace',
  'required.json required-019[1]': 'legacy required does not trim whitespace',

  // --- length unit: legacy uses UTF-16 code units, new uses codepoints ---
  // legacy-client.validate.js getLength/min/maxlength use value.length (UTF-16). For
  // non-BMP chars (emoji = 2 code units), counts diverge from codepoint length.
  'length-codepoint.json codepoint-maxlength-001[0]': 'UTF-16 length vs codepoint length',
  'length-codepoint.json codepoint-maxlength-001[2]': 'UTF-16 length vs codepoint length',
  'length-codepoint.json codepoint-minlength-001[0]': 'UTF-16 length vs codepoint length',
  'length-codepoint.json codepoint-minlength-boundary-001[1]': 'UTF-16 length vs codepoint length',
  'length-codepoint.json codepoint-mixed-001[0]': 'UTF-16 length vs codepoint length',

  // --- implicit number rule: new validators reject non-numeric for type:number
  // even with no explicit `number` rule; legacy only runs declared rules. ---
  'min-max.json min-max-015[0]': 'new applies implicit number rule; legacy does not',
  'min-max.json min-max-015[1]': 'new applies implicit number rule; legacy does not',
  'min-max.json min-max-015[2]': 'Infinity: new rejects via max/number; legacy string-compares',
  'number-implicit.json number-implicit-norules-001[0]': 'new applies implicit number rule; legacy does not',
  'number-implicit.json number-implicit-norules-001[1]': 'new applies implicit number rule; legacy does not',
  'number-implicit.json number-implicit-group-001[0]': 'new applies implicit number rule; legacy does not',

  // --- malformed threshold: new skips a non-numeric min/max param; legacy
  // does a raw string comparison (value >= "xyz") and fails. ---
  'malformed-threshold.json malformed-min-001[0]': 'new skips malformed min param; legacy string-compares',
  'malformed-threshold.json malformed-min-001[1]': 'new skips malformed min param; legacy string-compares',

  // --- conditional expression coverage / typing ---
  // legacy dependTypes.string cannot parse `in [list]` literal arrays.
  'conditional.json cond-in-001[2]': 'legacy lacks `in [array]` literal syntax',
  'conditional.json cond-in-001[3]': 'legacy lacks `in [array]` literal syntax',
  'conditional.json cond-in-002[2]': 'legacy lacks `in [array]` literal syntax',
  'conditional.json cond-not-in-001[2]': 'legacy lacks `not in [array]` literal syntax',
  // DOM string value "0" is truthy; new validators treat numeric 0 as falsy.
  'conditional.json cond-truthy-001[0]': 'DOM string "0" truthy vs typed 0 falsy',
  // ternary in a min param: legacy min cannot evaluate conditional thresholds.
  'conditional.json cond-multiple-rules-001[2]': 'legacy min cannot evaluate ternary threshold',
  // empty-string literal comparison `== ''` not supported by legacy parser.
  'conditional.json cond-empty-check-001[1]': "legacy lacks `== ''` empty-literal comparison",
  // &&/|| precedence differs between legacy and new condition parser.
  'conditional.json cond-precedence-001[2]': 'legacy &&/|| precedence differs from new parser',
  'conditional.json cond-precedence-001[3]': 'legacy &&/|| precedence differs from new parser',
};
