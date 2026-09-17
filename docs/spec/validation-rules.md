# Validation rules

[한국어](validation-rules.ko.md).

Fields declare rules under `validate`. The [schema contract](schema.md)
defines field structure; [validation APIs](../operations/validation.md) define
entry points, load failures and input failures.

## Registered rules

| Rules | Parameter and operation |
| --- | --- |
| `required` | `true` requires a supplied, nonempty value. |
| `email`, `url` | Boolean enablement of the corresponding format check. |
| `minlength`, `maxlength` | Integer minimum or maximum length; see [values](#values). |
| `rangelength` | `[minimum, maximum]` length; see [values](#values). |
| `number`, `digits` | Boolean enablement of the [numeric](#values) or digit-only check. |
| `min`, `max` | Inclusive numeric lower or upper bound. |
| `range` | Inclusive `[minimum, maximum]` numeric bounds. |
| `step` | Numeric increment counted from 0. |
| `match`, `pattern` | Whole-value [pattern](#patterns); both names use the same rule implementation. |
| `equalTo`, `notEqual` | Field comparison; the rule receives its reference or literal parameter unchanged. |
| `in` | [Membership](#values) in a list, comma-separated string or map. |
| `date`, `dateISO` | Boolean enablement of date format checks. |
| `enddate` | Start-date field path; a parsed end date must not precede the parsed start date. |
| `mincount`, `maxcount` | Minimum or maximum collection size. |
| `unique` | Uniqueness check, optionally using a reference or filter parameter. |
| `accept` | File extension or MIME-type parameter. |

The [TypeScript registry](../../packages/validator-ts/src/rules/index.ts) defines
built-in names. `crudui describe` derives its catalog from this registry;
see the [CLI procedure](../operations/cli.md). Every runtime has the same built-in rules and
no way to register others. A `validate` or `messages` key that is not one of these names fails the
load with `UNKNOWN_RULE` (see [parameter errors](#parameter-errors)); names are compared exactly,
so `equalto` is not `equalTo`.

## Evaluation

Rules run in declaration order and stop at the first failure for each field.
A resolved `false` or `null` parameter disables the rule. A rule name that is
not registered is a load failure whatever its parameter, so a misspelled rule never
disables validation silently; the meta-schema rejects the same names.

A `number` field runs the implicit `number` check before other rules unless it
declares that rule explicitly. Nonfinite numeric inputs fail numeric validation.

**Visibility.** A field whose `design.show` resolves to `false` against the data being
validated is hidden. The rules of a hidden field and of every field it contains are not
evaluated — `required`, collection counts and all others — and it reports no error. Its value
is neither changed nor removed: the data keeps it, and conditions and references elsewhere read
it as it is, so a value kept while its field is hidden is validated again once the data shows the
field. `design.show` resolves like a conditional parameter (a boolean, an expression or a
condition map, in the field's row context); only a resolved `false` hides, so a field without
`design.show`, with a condition map that selects nothing, or with a string that is not a valid
expression (a literal) is visible. The shape of the data is an
input contract and is checked for hidden fields too. Visibility
depends on the data alone, so a server reaches the same result as the form that showed it.

## Values

Every runtime applies these definitions; the rules below use no other notion of
whitespace, emptiness or text.

**Unicode data** is Unicode 16.0.0 as recorded in
[`contracts/unicode-properties.json`](../../contracts/unicode-properties.json), which
`scripts/generate-unicode-properties.mjs` derives from the Unicode Character Database files in
`contracts/unicode/`. Every runtime embeds that table and uses no other Unicode data, so every
runtime classifies every code point the same way.

**Whitespace** is exactly the code points with the Unicode `White_Space` property:
U+0009–U+000D, U+0020, U+0085, U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029,
U+202F, U+205F and U+3000. U+0000, U+180E, U+200B and U+FEFF are not whitespace.
**Trimming** removes leading and trailing whitespace and nothing else.

**Empty values** are a missing value, `null`, a string that is empty after
trimming, an empty array and an empty object. `0` and `false` are supplied values.
`required` fails on an empty value. Every other rule except `mincount` and
`maxcount` passes an empty value without evaluating it; collection-count rules
evaluate empty collections. A repeated field or group whose data is missing is an empty
collection. Requiredness and collection limits are separate; see
[empty collections](empty-collections.md).

**Canonical text** of a scalar is: a string itself; `true` as `1` and `false` as
`0`; a finite number as ECMAScript `Number.prototype.toString` writes its double value (the
shortest text that reads back as the same double, with an exponent when the
magnitude is at least 10^21 or below 10^-6, and `0` for negative zero). An integer is first
converted to the nearest double, so `9007199254740993` is written `9007199254740992`.

**Length** rules (`minlength`, `maxlength`, `rangelength`) count the Unicode code
points of a scalar's canonical text, untrimmed. Their limits are integers from 0
to 9007199254740991; `rangelength` requires minimum ≤ maximum. An array or object
value has no canonical text and fails a length rule, `pattern` and `match`.

**Numbers.** A value is numeric when it is a finite number, or a string that after trimming is
*numeric text* whose value is finite. Numeric text is the HTML valid floating-point number: an
optional `-`, then digits, digits followed by `.` and digits, or `.` and digits, then optionally
`e` or `E`, an optional `-` or `+` and digits (`^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$`);
its value is the nearest double. `+1`, `1.`, hexadecimal, `Infinity`, `NaN`, separators and
non-ASCII digits are not numeric text, and text whose value overflows is not numeric. Booleans,
`null`, arrays and objects are not numeric.

- `number` passes a numeric value.
- `min`, `max` and `range` pass a numeric value that is not below the minimum and not above the
  maximum; `step` passes a numeric value that is an integer multiple of the step, counted from 0.
  A value that is not numeric fails these rules. Multiples are decided exactly: the value and the
  step are read as the decimal numbers their canonical texts write, without a tolerance, so
  `0.3` is a multiple of `0.1` and `0.30000000000000004` is not.
- `digits` passes a string or a number whose canonical text (a string trimmed) consists only of
  ASCII digits; booleans and other values fail.
- `mincount` and `maxcount` count the elements of an array or the keys of an object; a missing
  value, `null` and a string that is empty after trimming count 0, and any other scalar counts 1.
- A message shows a numeric parameter as its canonical text. Every `{0}` and `{1}` of a default or
  declared message is replaced when the rule has that parameter; a placeholder for a parameter the
  rule does not have stays as written.

**Membership** (`in`) takes its members from a list (each element as is), a
comma-separated string (split at U+002C, each item trimmed) or a map (its keys).
Members are strings, numbers or booleans; a member of another type, an
empty member set and a member whose canonical text is empty after trimming are
declaration errors; members are checked in order, each for its type before its emptiness. A
string value is trimmed; an array value passes when every element passes, an empty element
(including an empty array or object) passes as an empty value does, and a non-empty array or
object element fails. A value matches a member
when their canonical texts are the same code points, or when both are numeric with equal
values. List elements and map keys are read as they are, so a member with surrounding whitespace
is not numeric text. Case, Unicode normalization and text that is not numeric never match.

## Patterns

`pattern` and `match` require the **whole** canonical text of the value to match,
as an HTML `pattern` attribute does. A pattern uses the CRUDUI pattern language,
a regular language that every runtime recognizes and matches itself, with the same
result and a matching time proportional to the value's length times the pattern's size:

| Construct | Accepted form |
| --- | --- |
| Literal | Any Unicode scalar value except `\ ^ $ . \| ? * + ( ) [ ] { }` |
| Escape | `\` followed by one of `^ $ \ . * + ? ( ) [ ] { } \| / -`; `\t \n \r \f \v`; `\xHH`; `\u{H…}` (1–6 hexadecimal digits, a scalar value) |
| Class shorthand | `\d` = `[0-9]`, `\w` = `[0-9A-Za-z_]`, `\s` = whitespace, and `\D \W \S` as their complements |
| Any character | `.` = any code point except U+000A |
| Bracket class | `[…]` or `[^…]` with at least one member; members are literals, escapes, `\d`, `\w`, `\s`, properties and ranges `a-z` whose endpoints are single code points in non-descending order; inside a class only `[`, `]`, `\` and a `-` that is neither first nor last are escaped |
| Unicode property | `\p{X}` or `\P{X}` with a general category (`L Lu Ll Lt Lm Lo M Mn Mc Me N Nd Nl No P Pc Pd Ps Pe Pi Pf Po S Sm Sc Sk So Z Zs Zl Zp C Cc Cf Co`), or `\p{Script=Name}` / `\P{Script=Name}` with a script (the Unicode `Script` property) named in the Unicode data |
| Group | `(…)`, `(?:…)`, `(?<name>…)` with a unique name matching `[A-Za-z_][A-Za-z0-9_]*`; groups nest at most 100 deep |
| Quantifier | `*`, `+`, `?`, `{n}`, `{n,}`, `{n,m}` (decimal digits, n ≤ m ≤ 1000) after an atom or group, optionally followed by `?` |
| Alternation | `\|` |
| Anchor | `^` as the first character and `$` as the last; they add nothing to a whole match |

An alternative or a group may be empty, and a pattern may consist of anchors alone; only the
empty pattern is rejected. A lazy quantifier matches the same values as its greedy form, because
only the whole value is matched. `C` is `Cc`, `Cf`, `Co`, the surrogates and the unassigned code
points; a property's complement contains every code point outside it.

**Size.** The size of a pattern is at most 1000. An atom (a literal, an escape, a shorthand, `.`,
a class or a property) has size 1; a sequence or an alternation has the sum of its parts' sizes;
a quantified item has its item's size times its maximum, or times its minimum plus one when it is
unbounded (`*` and `+` count 1 and 2 times).

Anything else is outside the language, including backreferences, lookaround,
inline flags, case-insensitive matching, word boundaries, POSIX classes, possessive
or repeated quantifiers, `\uHHHH`, octal and control escapes, and the empty pattern.
Delimiters have no meaning: `/x/i` matches the text `/x/i`. A pattern parameter is
a string, `false` or `null`.

## Parameter errors

A parameter outside these definitions is a load failure, and so is a rule name that is not a
registered rule. Rule names and parameters are checked after composition and the forbidden-key
scan, fields in declaration order, each field's `validate` rules in declaration order (a rule's
name before its parameter) and then its `messages` keys in declaration order, all before the
fields it contains, and the first failure is reported. A `messages` key names the rule whose
message it overrides; it may name a registered rule the field does not declare, such as the
implicit `number` check. Names are checked for hidden fields and fields without data too. Its location
is the field's declaration path: the property names from the root joined with `.`,
without row keys. Every runtime reports the same code and message:

| Parameter | Code | Message |
| --- | --- | --- |
| `validate` or `messages` key that is not a registered rule | `UNKNOWN_RULE` | `Unknown rule: {name}` |
| `minlength`, `maxlength` limit | `INVALID_RULE_PARAMETER` | `Invalid {rule} parameter: expected an integer from 0 to 9007199254740991` |
| `rangelength` limits | `INVALID_RULE_PARAMETER` | `Invalid rangelength parameter: expected [minimum, maximum] integers with minimum not above maximum` |
| `number`, `digits` limit | `INVALID_RULE_PARAMETER` | `Invalid {rule} parameter: expected true or false` |
| `min`, `max` limit | `INVALID_RULE_PARAMETER` | `Invalid {rule} parameter: expected a finite number` |
| `range` limits | `INVALID_RULE_PARAMETER` | `Invalid range parameter: expected [minimum, maximum] finite numbers with minimum not above maximum` |
| `step` | `INVALID_RULE_PARAMETER` | `Invalid step parameter: expected a finite number above 0` |
| `mincount`, `maxcount` limit | `INVALID_RULE_PARAMETER` | `Invalid {rule} parameter: expected an integer from 0 to 9007199254740991` |
| `in` members of another type | `INVALID_RULE_PARAMETER` | `Invalid in parameter: expected a list, a comma-separated string or a map` |
| `in` member that is not a string, number or boolean | `INVALID_RULE_PARAMETER` | `Invalid in parameter: members must be strings, numbers or booleans` |
| `in` without members, or with an empty member | `INVALID_RULE_PARAMETER` | `Invalid in parameter: members must not be empty` |
| `pattern`, `match` of another type | `INVALID_RULE_PARAMETER` | `Invalid {rule} parameter: expected a pattern string` |
| `pattern`, `match` outside the language | `INVALID_RULE_PATTERN` | `Invalid {rule} pattern: {reason} at {offset}` |

The pattern `{reason}` is one of `empty pattern`, `unexpected character`,
`unsupported construct`, `invalid escape`, `invalid class`, `invalid range`,
`invalid property`, `invalid quantifier`, `unterminated group`,
`unterminated class`, `invalid group name`, `duplicate group name`, `nesting too deep` and
`pattern too large`. An escape
not listed in the language is an `invalid escape`, and a `(?` group other than
`(?:` and `(?<name>` is an `unsupported construct`. `{offset}` is the code-point
index where the invalid construct starts (the backslash of an escape, the `(` of a
group, the `[` of a class, the first character of a quantifier or range); for an
unterminated group or class it is the length of the pattern. A quantifier character
(`* + ? {`) that does not follow an atom or group, a bound above 1000 and a minimum above the
maximum are an `invalid quantifier`. Inside a bracket class, `\D`, `\W` and `\S`, an empty
class, a nested `[` and an unescaped `-` that is neither first, last nor a range operator are an
`invalid class` at the `[`; a class is read left to right, so such a member is reported when
it is read, even where it would end a range; a range endpoint that is a set rather than a single
code point, and a descending range, are an `invalid range` at the first
endpoint; an escape or property inside a class keeps its own reason at its backslash. A `(?<`
group that is not a lookbehind (`(?<=`, `(?<!`) and has no valid name closed by `>` is an
`invalid group name` at the `(`. `^` or `$`
anywhere but the first or last character (a pattern of one `^` or `$` is an anchor) and a
surrogate code point are an `unexpected character`. The group that opens the 101st nesting level
is `nesting too deep` at its `(`. A pattern whose size exceeds 1000 is `pattern too large` at 0,
checked after the rest of the pattern is valid.

Parameters are checked when the specification loads, including every literal a condition map or
a ternary can select, whether or not it is selected. A string that is not a valid [expression](expressions.md) is a literal.
Only a value computed from the data is checked when it is selected: the result of a plain condition
expression (`false` disables the rule, `true` is checked as the parameter) and a ternary branch
that is a path or a condition, which happens before the empty-value skip. A runtime
never skips a pattern rule and never warns. It does not hand patterns to a regular-expression
engine: it recognizes the pattern with this grammar and matches it with its own linear-time
matcher over the Unicode data.

Repeated scalar fields apply `required`, `unique`, `mincount` and `maxcount` to
the collection and other rules to each element. Nested repeated groups retain
their row keys in error paths. The [form runtime](form-runtime.md) defines row
identity and order.

## Conditional parameters

```yaml
type: group
properties:
  email:
    type: email
    validate:
      required: ".enabled"
      email: true
  amount:
    type: text
    validate:
      min: ".premium ? 10 : 1"
```

Conditional parameters use the [expression contract](expressions.md). A condition
map selects the first matching value, or its `true` default. Ternary expressions
return the selected branch value.

`equalTo`, `notEqual`, `unique`, `enddate`, `accept`, `match`, `pattern` and `in`
receive parameters unchanged for their own processing. In particular,
`enddate: period.start` references a field; it is not a boolean condition.
For `enddate`, `.start` resolves a sibling field and `..start` resolves one
group level above, using the common field-reference resolver.
Membership maps are value sets, not condition maps.

`design.show` decides whether a field's rules run; see [visibility](#evaluation). A condition in
`validate.required` makes a visible field optional.

## Errors and verification

Each error contains the field path, field name, failing rule, message and value
when available. Custom messages use the declared rule name, including the
distinction between `match` and `pattern`. Defaults are defined by the rule
implementations. The [fixture contract](test-fixtures.md) defines expected
results and failure records.

Run all four validator package suites using the [testing procedure](../operations/testing.md).
Record actual results in [feature status](../features.md); a rule name appearing
in every registry does not prove all inputs behave identically.
