# Legacy-client validation gate

Compares the **legacy jQuery browser runtime**
`examples/limepie-original/assets/js/dist.validate.js` against the **new
validators** (`packages/validator-ts`; PHP/Go/Rust already agree with it per
`tests/runner/compare-all.js`).

This is the axis `compare-all.js` deliberately excludes. compare-all treats
`validator-ts` as the client replacement and never runs `dist.validate.js`. If
a legacy form still validates in the browser with `dist.validate.js`, the
browser verdict and the server verdict are not guaranteed to agree. This gate
measures that agreement, per case, over `tests/cases/*.json`.

## Run

```
cd tests/legacy-client
npm install        # jquery + jsdom + vitest (local to this dir)
npm run gate       # standalone report (exit 0 = pass)
npm test           # same gate as vitest
```

## Feasibility: the legacy runtime IS programmatically drivable

`dist.validate.js` is DOM-coupled (jQuery-validation style): `check()` reads the
live value via `getValueByElement(element)`, looks elements up by name selector,
and renders errors into `.message` divs. It does not take a trusted plain value.

The adapter (`adapter.js`) drives it faithfully under `jsdom` + `jquery`:

1. Load `dist.validate.js` in a jsdom realm with `$`, `jQuery`, `window`,
   `document`, `performance`, `console` bound (a stubbed `console` silences the
   file's stray `console.log(element)` calls).
2. Synthesize the Limepie form Limepie itself emits: one `.valid-target` element
   per leaf field, `name`/`data-rule-name` = the bracket-path that `fixSpec()`
   produces (verified against `tests/fixtures/reference-html`), value injected
   from the case input.
3. `$(form).validate({spec})`, then determine validity + first failing rule by
   replaying the exact method loop from `check()` (it returns only a boolean and
   a localized message div, so the failing rule name is recovered by re-running
   the same `$.validator.methods[m]` calls with `dependency-mismatch` skip and
   `required` passed as the 4th arg).

Output shape matches `compare-all.js`: `{valid, error, field}`.

## Census (current)

```
total 1030  matched 526  documented-gaps 28  excluded 476  regressions 0
```

The gate PASSES when there are no undocumented mismatches and no stale gap
entries. `matched` = legacy and new agree. `gaps` = they disagree and the
divergence is a documented client<->server semantic gap (`known-gaps.js`).
`excluded` = the case cannot be faithfully driven (see below).

## Rules legacy does NOT support (excluded from comparison)

- `pattern` with a **conditional/ternary param** (`.x == y ? a : b`): legacy
  `match` treats the param as a literal regex; it cannot evaluate the condition.
- `display_switch`: **zero** references in `dist.validate.js`. Display gating is
  a new-validator feature; the legacy runtime relied on external show/hide JS.
- `accept` / file / image: `input[type=file].value` cannot be set under jsdom
  and there is no `FileList` to synthesize.
- array / `multiple` groups and `[]` leaves, and array-valued inputs: legacy
  needs the multi-element `[__uniqid__]` naming convention that cannot be
  reproduced from the spec alone (drives `unique`, `mincount`, `maxcount`,
  per-element `min`/`max`/`required`).
- conditional cross-field references whose absolute dotted path cannot be
  resolved alongside relative `.`/`..` paths under a single synthesized DOM.
- raw scalar boolean input (no canonical single-control DOM value).

Rules that ARE compared and match: `required`, `minlength`, `maxlength`,
`email`, `pattern`/`match` (literal regex, anchored), `min`, `max`, and
single-group conditional `required` via relative `.`/`..` paths.

## Client <-> server semantic gaps found (real idempotency gaps)

Every entry below is the legacy browser runtime disagreeing with the new
server-side validators on the same spec + input. Full list in `known-gaps.js`.

| Gap | Legacy (browser) | New (server) |
| --- | --- | --- |
| **required whitespace** | `" "`, `"\t"`, `"\n"` pass required (`value.length>0`, no trim) | rejected |
| **length unit** | `minlength`/`maxlength` count UTF-16 code units (emoji = 2) | count codepoints |
| **implicit number** | `type:number` with no `number` rule accepts `"abc"` | rejects (implicit number rule) |
| **malformed threshold** | `min:"xyz"` does `value >= "xyz"` string compare and fails | skips malformed param |
| **`in [array]` literal** | condition parser lacks `in [US,CA]` syntax -> condition false | parsed |
| **`== ''` literal** | condition parser lacks empty-string literal compare | parsed |
| **`&&`/`||` precedence** | differs from new condition parser | new precedence |
| **ternary threshold** | `min:".t==1 ? 100 : 0"` not evaluated by legacy `min` | evaluated |
| **DOM string truthiness** | `.has_warranty` with DOM value `"0"` is truthy | numeric `0` is falsy |

## Files

- `adapter.js` — loads `dist.validate.js` under jsdom+jQuery; `runLegacyCase(spec, input)` -> `{supported, valid, error, field}` or `{supported:false, reason}`.
- `gate.js` — runs all `tests/cases/*.json`, classifies match/gap/excluded/regression; standalone CLI and `runGate()` export.
- `gate.test.mjs` — vitest wrapper (regression + stale-gap guards).
- `known-gaps.js` — documented client<->server gaps; the gate fails on any undocumented mismatch and on any stale (no-longer-reproducing) entry.
- `sweep.js` — dev helper: per-suite match/mismatch/skip totals (`DIFFS=1` to list mismatches).
