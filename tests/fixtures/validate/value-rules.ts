/**
 * Value, length, membership and pattern cases written from docs/spec/validation-rules.md.
 *
 * Each case states the rule outcome of every field (`null` passes, a rule name fails with
 * that rule) or the load failure; the generator writes the result record from it, so the
 * expectation comes from the specification, not from any runtime.
 */

/** A field outcome: `null` passes; otherwise the failing rule and the message parameters. */
export type Outcome = null | { rule: string; params?: unknown[] };

export interface AuthoredCase {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  data: Record<string, unknown>;
  /** Outcome of every field, in declaration order. */
  outcomes?: Record<string, Outcome>;
  /** The load failure the specification causes. */
  failure?: { code: string; message: string; at: string };
}

const WHITESPACE = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
];
const hex = (code: number) => code.toString(16).toUpperCase().padStart(4, '0');

/** One text field per value, all declaring the same rules. */
function fields(values: Record<string, unknown>, validate: Record<string, unknown>) {
  const properties: Record<string, unknown> = {};
  for (const name of Object.keys(values)) properties[name] = { type: 'text', validate };
  return { spec: { type: 'group', properties }, data: values };
}

const fail = (rule: string, ...params: unknown[]): Outcome => ({ rule, ...(params.length ? { params } : {}) });

function outcomes(names: string[], outcome: (name: string) => Outcome) {
  return Object.fromEntries(names.map(name => [name, outcome(name)]));
}

/** A one-field specification whose declaration fails to load. */
function declaration(name: string, note: string, validate: Record<string, unknown>, message: string, code = 'INVALID_RULE_PARAMETER'): AuthoredCase {
  return {
    name, note,
    spec: { type: 'group', properties: { value: { type: 'text', validate } } },
    data: { value: 'x' },
    failure: { code, message, at: 'value' },
  };
}

const pattern = (rule: string, reason: string, offset: number) => `Invalid ${rule} pattern: ${reason} at ${offset}`;

function patternCase(name: string, note: string, source: string, values: Record<string, unknown>, passing: string[]): AuthoredCase {
  const { spec, data } = fields(values, { pattern: source });
  return { name, note, spec, data, outcomes: outcomes(Object.keys(values), key => (passing.includes(key) ? null : fail('pattern'))) };
}

function invalidPattern(name: string, source: string, reason: string, offset: number): AuthoredCase {
  return declaration(name, `the pattern ${JSON.stringify(source)} is outside the pattern language: ${reason}.`,
    { pattern: source }, pattern('pattern', reason, offset), 'INVALID_RULE_PATTERN');
}

const whitespaceValues = Object.fromEntries(WHITESPACE.map(code => [`u${hex(code)}`, String.fromCodePoint(code)]));

export const AUTHORED_CASES: AuthoredCase[] = [
  // --- whitespace and emptiness ---
  {
    name: 'value-required-whitespace',
    note: 'every White_Space code point alone, and mixed, is empty for required.',
    ...fields({ ...whitespaceValues, mixed: '\u3000\t\u00a0\u2028 ' }, { required: true }),
    outcomes: outcomes([...Object.keys(whitespaceValues), 'mixed'], () => fail('required')),
  },
  {
    name: 'value-required-not-whitespace',
    note: 'NUL, U+180E, U+200B and U+FEFF are not whitespace, and text inside whitespace is a value.',
    ...fields({ nul: '\u0000', mongolian: '\u180e', zeroWidth: '\u200b', bom: '\ufeff', padded: ' \u0000 ', text: '\u3000x\u00a0', zero: 0, no: false }, { required: true }),
    outcomes: outcomes(['nul', 'mongolian', 'zeroWidth', 'bom', 'padded', 'text', 'zero', 'no'], () => null),
  },
  {
    name: 'value-empty-skips-other-rules',
    note: 'an empty value is not evaluated by other rules; a value that only looks blank is.',
    ...fields({ ideographic: '\u3000', nbsp: '\u00a0 ', nul: '\u0000', bom: '\ufeff', empty: '', array: [], object: {} }, { maxlength: 0, pattern: 'a', in: 'a' }),
    outcomes: { ideographic: null, nbsp: null, nul: fail('maxlength', 0), bom: fail('maxlength', 0), empty: null, array: null, object: null },
  },

  // --- canonical text and length ---
  {
    name: 'value-length-canonical-text',
    note: 'lengths count the code points of the canonical text: numbers as ECMAScript writes them, booleans as 1 and 0, strings untrimmed.',
    spec: { type: 'group', properties: Object.fromEntries(([
      ['integer', 2], ['fraction', 3], ['large', 5], ['small', 4], ['sixDecimals', 8], ['shortest', 19],
      ['wide', 21], ['yes', 1], ['no', 1], ['emoji', 1], ['skin', 2], ['combining', 2], ['family', 5],
      ['hangul', 2], ['padded', 3], ['nul', 3],
    ] as const).map(([name, length]) => [name, { type: 'text', validate: { rangelength: [length, length] } }])) },
    data: {
      integer: 12, fraction: 1.5, large: 1e21, small: 1e-7, sixDecimals: 0.000001, shortest: 0.1 + 0.2,
      wide: 123456789012345680000, yes: true, no: false, emoji: '\u{1f600}', skin: '\u{1f44d}\u{1f3fd}',
      combining: 'e\u0301', family: '\u{1f468}\u200d\u{1f469}\u200d\u{1f467}', hangul: '한글', padded: ' x ', nul: 'a\u0000b',
    },
    outcomes: outcomes(['integer', 'fraction', 'large', 'small', 'sixDecimals', 'shortest', 'wide', 'yes', 'no', 'emoji', 'skin', 'combining', 'family', 'hangul', 'padded', 'nul'], () => null),
  },
  {
    name: 'value-length-limits',
    note: 'numbers and booleans fail length limits by their canonical text; arrays and non-empty objects fail length rules.',
    spec: { type: 'group', properties: {
      number: { type: 'text', validate: { maxlength: 1 } },
      decimal: { type: 'text', validate: { minlength: 4 } },
      boolean: { type: 'text', validate: { minlength: 2 } },
      list: { type: 'text', validate: { maxlength: 5 } },
      map: { type: 'text', validate: { minlength: 0 } },
      range: { type: 'text', validate: { rangelength: [2, 3] } },
    } },
    data: { number: 12, decimal: 1.5, boolean: true, list: ['a'], map: { a: 1 }, range: 1234 },
    outcomes: {
      number: fail('maxlength', 1), decimal: fail('minlength', 4), boolean: fail('minlength', 2),
      list: fail('maxlength', 5), map: fail('minlength', 0), range: fail('rangelength', 2, 3),
    },
  },
  declaration('value-length-fraction-limit', 'a length limit is an integer.', { minlength: 1.5 },
    'Invalid minlength parameter: expected an integer from 0 to 9007199254740991'),
  declaration('value-length-negative-limit', 'a length limit is not negative.', { maxlength: -1 },
    'Invalid maxlength parameter: expected an integer from 0 to 9007199254740991'),
  declaration('value-length-unsafe-limit', 'a length limit is a safe integer.', { maxlength: 9007199254740992 },
    'Invalid maxlength parameter: expected an integer from 0 to 9007199254740991'),
  {
    name: 'value-length-condition-map-limit',
    note: 'every value a condition map can select is checked when the specification loads, selected or not.',
    spec: { type: 'group', properties: { big: { type: 'text' }, value: { type: 'text', validate: { minlength: { '.big': 1.5, true: 2 } } } } },
    data: { big: 0, value: 'abc' },
    failure: { code: 'INVALID_RULE_PARAMETER', message: 'Invalid minlength parameter: expected an integer from 0 to 9007199254740991', at: 'value' },
  },
  {
    name: 'value-length-ternary-limit',
    note: 'every literal branch of a ternary is checked when the specification loads, selected or not.',
    spec: { type: 'group', properties: { big: { type: 'text' }, value: { type: 'text', validate: { maxlength: '.big ? 3 : -1' } } } },
    data: { big: 1, value: 'abc' },
    failure: { code: 'INVALID_RULE_PARAMETER', message: 'Invalid maxlength parameter: expected an integer from 0 to 9007199254740991', at: 'value' },
  },
  {
    name: 'value-length-data-limit-selected',
    note: 'a limit a ternary takes from the data is checked when selected, before the empty-value skip.',
    spec: { type: 'group', properties: { big: { type: 'text' }, limit: { type: 'text' }, value: { type: 'text', validate: { minlength: '.big ? .limit : 2' } } } },
    data: { big: 1, limit: 1.5, value: '' },
    failure: { code: 'INVALID_RULE_PARAMETER', message: 'Invalid minlength parameter: expected an integer from 0 to 9007199254740991', at: 'value' },
  },
  {
    name: 'value-length-data-limit-unselected',
    note: 'a data value a ternary does not select is not checked.',
    spec: { type: 'group', properties: { big: { type: 'text' }, limit: { type: 'text' }, value: { type: 'text', validate: { minlength: '.big ? .limit : 2' } } } },
    data: { big: 0, limit: 1.5, value: 'a' },
    outcomes: { big: null, limit: null, value: fail('minlength', 2) },
  },
  {
    name: 'value-length-data-limit-valid',
    note: 'a selected data limit that is an integer applies.',
    spec: { type: 'group', properties: { big: { type: 'text' }, limit: { type: 'text' }, value: { type: 'text', validate: { minlength: '.big ? .limit : 2' } } } },
    data: { big: 1, limit: 4, value: 'abc' },
    outcomes: { big: null, limit: null, value: fail('minlength', 4) },
  },
  {
    name: 'value-length-condition-true',
    note: 'a condition expression that yields true is not a length limit; it fails when selected, even for an empty value.',
    spec: { type: 'group', properties: { on: { type: 'text' }, value: { type: 'text', validate: { minlength: '.on' } } } },
    data: { on: 1, value: '' },
    failure: { code: 'INVALID_RULE_PARAMETER', message: 'Invalid minlength parameter: expected an integer from 0 to 9007199254740991', at: 'value' },
  },
  {
    name: 'value-length-condition-false',
    note: 'a condition expression that yields false disables the rule.',
    spec: { type: 'group', properties: { on: { type: 'text' }, value: { type: 'text', validate: { minlength: '.on' } } } },
    data: { on: 0, value: 'a' },
    outcomes: { on: null, value: null },
  },
  declaration('value-length-invalid-expression', 'a string that is not a valid expression is a literal, and a literal string is not a length limit.',
    { minlength: '.a ? 1 : (.b ? 2 : 3)' }, 'Invalid minlength parameter: expected an integer from 0 to 9007199254740991'),
  declaration('value-length-reversed-range', 'a length range starts at its minimum.', { rangelength: [3, 2] },
    'Invalid rangelength parameter: expected [minimum, maximum] integers with minimum not above maximum'),
  declaration('value-length-fraction-range', 'length range limits are integers.', { rangelength: [1, 2.5] },
    'Invalid rangelength parameter: expected [minimum, maximum] integers with minimum not above maximum'),

  // --- membership ---
  {
    name: 'value-in-comma-string',
    note: 'comma items are trimmed; values are trimmed; numbers match by value only in the decimal grammar; booleans match by canonical text.',
    ...fields({
      plain: 'a', spaced: ' b\u3000', decimal: '1.0', padded: '01', number: 1, yes: true,
      hex: '0x1', exponent: '1e0', upper: 'A', nul: 'a\u0000', no: false, list: ['a', 'b'], mixed: ['a', 'z'],
    }, { in: 'a, b,1' }),
    outcomes: {
      plain: null, spaced: null, decimal: null, padded: null, number: null, yes: null,
      hex: fail('in'), exponent: fail('in'), upper: fail('in'), nul: fail('in'), no: fail('in'), list: null, mixed: fail('in'),
    },
  },
  {
    name: 'value-in-list',
    note: 'list elements are members as they are: never split and never trimmed.',
    ...fields({ joined: 'a,b', part: 'a', inner: 'c', number: '2.50', zero: 0, off: false }, { in: ['a,b', ' c ', 2.5, false] }),
    outcomes: { joined: null, part: fail('in'), inner: fail('in'), number: null, zero: null, off: null },
  },
  {
    name: 'value-in-map',
    note: 'a map contributes its keys.',
    ...fields({ key: 'x', numeric: 2, decimal: '2.0', label: 'X', other: 'y' }, { in: { x: 'X', 2: 'Two' } }),
    outcomes: { key: null, numeric: null, decimal: null, label: fail('in'), other: fail('in') },
  },
  {
    name: 'value-in-array-elements',
    note: 'an array value passes when every element passes; empty elements pass and nested elements fail.',
    ...fields({ blanks: ['a', '', ' ', null, [], {}], nested: ['a', ['a']], record: ['a', { a: 'a' }], other: ['a', 'b'] }, { in: ['a'] }),
    outcomes: { blanks: null, nested: fail('in'), record: fail('in'), other: fail('in') },
  },
  declaration('value-in-member-order', 'members are checked in order, each for its type first.', { in: ['a', 5, [1], ''] },
    'Invalid in parameter: members must be strings, numbers or booleans'),
  declaration('value-in-member-emptiness-first', 'an earlier empty member is reported before a later member of another type.', { in: ['', [1]] },
    'Invalid in parameter: members must not be empty'),
  declaration('value-in-empty-list', 'a membership list has members.', { in: [] }, 'Invalid in parameter: members must not be empty'),
  declaration('value-in-empty-map', 'a membership map has members.', { in: {} }, 'Invalid in parameter: members must not be empty'),
  declaration('value-in-blank-string', 'a membership string has members.', { in: ' \u3000' }, 'Invalid in parameter: members must not be empty'),
  declaration('value-in-empty-item', 'every comma item is a member.', { in: 'a,,b' }, 'Invalid in parameter: members must not be empty'),
  declaration('value-in-blank-element', 'a list member is not blank.', { in: ['a', ' '] }, 'Invalid in parameter: members must not be empty'),
  declaration('value-in-nested-list', 'members are scalars.', { in: [['a']] }, 'Invalid in parameter: members must be strings, numbers or booleans'),
  declaration('value-in-null-member', 'members are strings, numbers or booleans.', { in: ['a', null] }, 'Invalid in parameter: members must be strings, numbers or booleans'),
  declaration('value-in-number-parameter', 'membership is a list, a string or a map.', { in: 5 }, 'Invalid in parameter: expected a list, a comma-separated string or a map'),
  declaration('value-in-true-parameter', 'true is not a membership declaration.', { in: true }, 'Invalid in parameter: expected a list, a comma-separated string or a map'),

  // --- patterns: whole match and the pattern language ---
  patternCase('pattern-whole-alternation', 'alternation is wrapped as a group before the whole match.', 'a|b',
    { a: 'a', b: 'b', ab: 'ab', ba: 'ba', az: 'az' }, ['a', 'b']),
  patternCase('pattern-whole-trailing-newline', 'the end of the value is its end; a final newline is text.', 'x',
    { plain: 'x', newline: 'x\n', before: '\nx' }, ['plain']),
  patternCase('pattern-anchors', 'a leading ^ and a trailing $ add nothing to a whole match.', '^ab$',
    { exact: 'ab', longer: 'abc' }, ['exact']),
  patternCase('pattern-shorthand-ascii', '\\d and \\w are ASCII sets.', '\\d\\w',
    { ascii: '1a', underscore: '9_', arabic: '\u0661a', fullwidth: '\uff11a', accent: '1\u00e9' }, ['ascii', 'underscore']),
  patternCase('pattern-shorthand-space', '\\s is the whitespace set.', 'a\\sb',
    { space: 'a b', ideographic: 'a\u3000b', nel: 'a\u0085b', vertical: 'a\u000bb', bom: 'a\ufeffb', nul: 'a\u0000b' }, ['space', 'ideographic', 'nel', 'vertical']),
  patternCase('pattern-complements', '\\D, \\W and \\S are complements.', '\\D\\W\\S',
    { match: 'x-y', digit: '1-y', word: 'xay', space: 'x- ' }, ['match']),
  patternCase('pattern-any-character', '. is any code point except U+000A.', 'a.b',
    { emoji: 'a\u{1f600}b', carriage: 'a\rb', separator: 'a\u2028b', nul: 'a\u0000b', newline: 'a\nb', pair: 'axyb' }, ['emoji', 'carriage', 'separator', 'nul']),
  patternCase('pattern-escapes', 'literal, control, hexadecimal and code point escapes.', '\\.\\t\\x41\\u{1F600}\\u{41}\\/\\-',
    { match: '.\tA\u{1f600}A/-', dot: 'x\tA\u{1f600}A/-' }, ['match']),
  patternCase('pattern-classes', 'bracket classes with ranges, escapes and shorthands.', '[a-c\\d\\-\\]]+[^x]',
    { match: 'b9-]y', negated: 'b9-]x', outside: 'd' }, ['match']),
  patternCase('pattern-properties', 'general categories and scripts.', '\\p{Lu}\\p{Script=Hangul}\\P{N}',
    { match: 'A한x', lower: 'a한x', latin: 'Aax', number: 'A한1' }, ['match']),
  patternCase('pattern-groups-quantifiers', 'groups and bounded quantifiers.', '(?<head>ab){2}(?:c|d){1,3}e*?f+g?',
    { match: 'ababcdcf', single: 'abcf', many: 'ababccccf', lazy: 'ababceeffg' }, ['match', 'lazy']),
  patternCase('pattern-class-members', 'a class holds \\s and properties; nested bounds may reach the limit.', '([\\s\\p{Lu}]{10}){100}',
    { match: 'A \u3000BCDEFGH'.repeat(100), short: 'A' }, ['match']),
  patternCase('pattern-script-complement', '\\P{Script=Name} is the complement of a script.', '\\P{Script=Latin}+',
    { hangul: '\ud55c', digits: '12', latin: 'x', mixed: '1x' }, ['hangul', 'digits']),
  patternCase('pattern-empty-alternatives', 'empty alternatives and empty groups match the empty text.', 'a|(|b)c',
    { a: 'a', c: 'c', bc: 'bc', ac: 'ac' }, ['a', 'c', 'bc']),
  {
    name: 'pattern-anchors-only',
    note: 'a pattern of anchors alone matches only the empty text, and an empty value is skipped.',
    ...fields({ empty: '', blank: ' ', text: 'x' }, { pattern: '^$' }),
    outcomes: { empty: null, blank: null, text: fail('pattern') },
  },
  {
    name: 'pattern-array-value',
    note: 'an array or object value has no canonical text and fails pattern and match.',
    spec: { type: 'group', properties: { list: { type: 'text', validate: { pattern: '.*' } }, record: { type: 'text', validate: { match: '.*' } } } },
    data: { list: ['a'], record: { a: 'a' } },
    outcomes: { list: fail('pattern'), record: fail('match') },
  },
  patternCase('pattern-size-limit', 'unbounded quantifiers count their minimum plus one; size 1000 is accepted.', '((a{10})*){100}',
    { ten: 'a'.repeat(10), many: 'a'.repeat(990), three: 'aaa' }, ['ten', 'many']),
  patternCase('pattern-depth-limit', 'groups nest 100 deep.', '('.repeat(100) + 'a' + ')'.repeat(100),
    { a: 'a', b: 'b' }, ['a']),
  patternCase('pattern-linear-alternation', 'overlapping alternatives are matched in linear time.', '(?:a|aa)*c',
    { long: 'a'.repeat(5000), match: 'a'.repeat(5000) + 'c' }, ['match']),
  patternCase('pattern-linear-repetition', 'nested unbounded repetition is matched in linear time.', '(?:.*a){12}c',
    { long: 'a'.repeat(5000), match: 'a'.repeat(12) + 'c' }, ['match']),
  patternCase('pattern-large-property-repetition', 'a property repeated 1000 times is matched quickly.', '\\p{L}{1000}',
    { hangul: '\ud55c'.repeat(1000), short: '\ud55c'.repeat(999), digit: '\ud55c'.repeat(999) + '1' }, ['hangul']),
  patternCase('pattern-unicode-data', 'properties use the Unicode 16.0 data: U+088F and U+A7CE are unassigned there.', '\\P{L}\\p{C}\\P{Script=Arabic}\\P{Script=Latin}',
    { unassigned: '\u088f\ua7ce\u088f\ua7ce', letter: 'a\ua7ce\u088f\ua7ce' }, ['unassigned']),
  patternCase('pattern-class-literals', 'inside a class only [, ], \\ and an inner - are escaped; ranges may be one code point.', '[.$^*a-a|]{2}',
    { dots: '.$', stars: '*|', letters: 'aa', other: 'ab' }, ['dots', 'stars', 'letters']),
  patternCase('pattern-leading-zero-bounds', 'bounds are decimal digits.', 'a{002}',
    { two: 'aa', one: 'a' }, ['two']),
  patternCase('pattern-single-anchor', 'a pattern of one $ is an anchor.', '$',
    { text: 'x', blank: '' }, ['blank']),
  {
    name: 'pattern-integer-canonical-text',
    note: 'an integer is written as the nearest double.',
    ...fields({ odd: JSON.rawJSON('9007199254740993'), largest: JSON.rawJSON('9223372036854775807') }, { pattern: '9007199254740992|9223372036854776000' }),
    outcomes: { odd: null, largest: null },
  },
  patternCase('pattern-delimiters-are-text', 'delimiters have no meaning.', '/x/i',
    { text: '/x/i', letter: 'x', upper: 'X' }, ['text']),
  {
    name: 'pattern-canonical-text',
    note: 'numbers and booleans are matched by their canonical text.',
    ...fields({ integer: 12, decimal: 1.5, large: 1e21, yes: true, no: false }, { pattern: '[0-9.e+]+' }),
    outcomes: { integer: null, decimal: null, large: null, yes: null, no: null },
  },
  {
    name: 'pattern-match-name',
    note: 'match is the same rule under its own name.',
    ...fields({ ok: 'ab', bad: 'abc' }, { match: 'a|ab' }),
    outcomes: { ok: null, bad: fail('match') },
  },
  invalidPattern('pattern-invalid-empty', '', 'empty pattern', 0),
  invalidPattern('pattern-invalid-open-group', 'a(b', 'unterminated group', 3),
  invalidPattern('pattern-invalid-open-class', 'a[b', 'unterminated class', 3),
  invalidPattern('pattern-invalid-close-group', 'a)', 'unexpected character', 1),
  invalidPattern('pattern-invalid-close-class', 'a]', 'unexpected character', 1),
  invalidPattern('pattern-invalid-brace', 'a{', 'invalid quantifier', 1),
  invalidPattern('pattern-invalid-bare-brace', '{a', 'invalid quantifier', 0),
  invalidPattern('pattern-invalid-leading-quantifier', '*a', 'invalid quantifier', 0),
  invalidPattern('pattern-invalid-stacked-quantifier', 'a**', 'invalid quantifier', 2),
  invalidPattern('pattern-invalid-possessive', 'a++', 'invalid quantifier', 2),
  invalidPattern('pattern-invalid-reversed-bounds', 'a{3,2}', 'invalid quantifier', 1),
  invalidPattern('pattern-invalid-large-bound', 'a{1001}', 'invalid quantifier', 1),
  invalidPattern('pattern-invalid-open-bound', 'a{,2}', 'invalid quantifier', 1),
  invalidPattern('pattern-invalid-inner-anchor', 'a^b', 'unexpected character', 1),
  invalidPattern('pattern-invalid-leading-end', '$a', 'unexpected character', 0),
  invalidPattern('pattern-invalid-unknown-escape', 'a\\q', 'invalid escape', 1),
  invalidPattern('pattern-invalid-word-boundary', '\\bx', 'invalid escape', 0),
  invalidPattern('pattern-invalid-backreference', '(a)\\1', 'invalid escape', 3),
  invalidPattern('pattern-invalid-short-unicode', '\\u0041', 'invalid escape', 0),
  invalidPattern('pattern-invalid-surrogate', '\\u{D800}', 'invalid escape', 0),
  invalidPattern('pattern-invalid-large-code-point', '\\u{110000}', 'invalid escape', 0),
  invalidPattern('pattern-invalid-hex', '\\x4', 'invalid escape', 0),
  invalidPattern('pattern-invalid-inline-flag', '(?i)x', 'unsupported construct', 0),
  invalidPattern('pattern-invalid-lookahead', 'a(?=b)', 'unsupported construct', 1),
  invalidPattern('pattern-invalid-lookbehind', '(?<=a)b', 'unsupported construct', 0),
  invalidPattern('pattern-invalid-group-name', '(?<1a>x)', 'invalid group name', 0),
  invalidPattern('pattern-invalid-duplicate-name', '(?<n>a)(?<n>b)', 'duplicate group name', 7),
  invalidPattern('pattern-invalid-empty-class', 'a[]', 'invalid class', 1),
  invalidPattern('pattern-invalid-class-bracket', '[[a]', 'invalid class', 0),
  invalidPattern('pattern-invalid-posix-class', '[[:alpha:]]', 'invalid class', 0),
  invalidPattern('pattern-invalid-reversed-range', '[z-a]', 'invalid range', 1),
  invalidPattern('pattern-invalid-shorthand-range', '[\\d-z]', 'invalid range', 1),
  invalidPattern('pattern-invalid-class-complement', 'a[\\S]', 'invalid class', 1),
  invalidPattern('pattern-invalid-nested-size', '(a{100}){20}', 'pattern too large', 0),
  invalidPattern('pattern-invalid-unknown-script', '\\p{Script=Klingon}', 'invalid property', 0),
  invalidPattern('pattern-invalid-property', '\\p{Letter}', 'invalid property', 0),
  invalidPattern('pattern-invalid-short-property', '\\pL', 'invalid property', 0),
  invalidPattern('pattern-invalid-class-dash', '[a-b-c]', 'invalid class', 0),
  invalidPattern('pattern-invalid-set-range-end', '[a-\\d]', 'invalid range', 1),
  invalidPattern('pattern-invalid-outer-size', '((a{10}){10}){11}', 'pattern too large', 0),
  invalidPattern('pattern-invalid-size', 'a{1000}b', 'pattern too large', 0),
  invalidPattern('pattern-invalid-plus-size', '(?:a+){500}b', 'pattern too large', 0),
  invalidPattern('pattern-invalid-size-after-syntax', '(?:a{1000}){2}(', 'unterminated group', 15),
  invalidPattern('pattern-invalid-depth', '('.repeat(101) + 'a' + ')'.repeat(101), 'nesting too deep', 100),
  invalidPattern('pattern-invalid-class-shorthand-end', '[a-\\D]', 'invalid class', 0),
  invalidPattern('pattern-invalid-class-escape', '[\\q]', 'invalid escape', 1),
  invalidPattern('pattern-invalid-class-property', '[\\p{Letter}]', 'invalid property', 1),
  invalidPattern('pattern-invalid-unclosed-name', '(?<abc', 'invalid group name', 0),
  invalidPattern('pattern-invalid-surrogate-category', '\\p{Cs}', 'invalid property', 0),
  {
    name: 'value-parameter-order',
    note: 'a field\'s own rules are checked before the fields it contains, and the location is the declaration path.',
    spec: { type: 'group', properties: { outer: { type: 'group', validate: { maxlength: -1 }, properties: { inner: { type: 'text', validate: { pattern: '(' } } } } } },
    data: { outer: { inner: 'x' } },
    failure: { code: 'INVALID_RULE_PARAMETER', message: 'Invalid maxlength parameter: expected an integer from 0 to 9007199254740991', at: 'outer' },
  },
  {
    name: 'value-parameter-row-path',
    note: 'the location of a parameter inside repeated rows has no row keys.',
    spec: { type: 'group', properties: { rows: { type: 'group', multiple: true, properties: { name: { type: 'text', validate: { match: 'a(' } } } } } },
    data: { rows: { r1: { name: 'x' } } },
    failure: { code: 'INVALID_RULE_PATTERN', message: 'Invalid match pattern: unterminated group at 2', at: 'rows.name' },
  },
  declaration('pattern-invalid-number-parameter', 'a pattern is a string.', { pattern: 5 },
    'Invalid pattern parameter: expected a pattern string'),
  declaration('pattern-invalid-true-parameter', 'true is not a pattern.', { match: true },
    'Invalid match parameter: expected a pattern string'),
];
