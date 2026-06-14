# @crudui/cli

crudui orchestrator CLI. A thin wrapper over the code/schema single source of
truth (generator-core registry, validator-ts rules, schema JSON, forbidden-scan,
grammar docs) — it holds no hand-copied catalog. Runs through the tsx loader so
the `.ts` sources import directly (no separate build), exactly like
`validator-ts/bin/validate.mjs`.

```
node --import tsx bin/crudui.mjs <subcommand>
```

## Subcommands (implemented)

- `describe [--json|--md]` — unified capabilities from code/schema import·parse
  (default `--json`). Drift 0 against the sources; includes list capability.
- `check <spec.{yml,json}>` — meta-schema (ajv) + forbidden-scan + type catalog.
  Exit 0 on pass, 1 on fail.
- `explain <spec> [--lang ko|en]` — spec → natural-language back-check
  (reverse-verification of the spec).
- `list-widgets [--json]` — widget kinds + layout + aliases (a thin view of
  `describe.widgets`).

`validate`, `render`, and `scaffold` are NOT wired into the dispatcher
(roadmap); only the four above are callable.

## Test

```
npm test     # vitest (describe drift, check catalog, explain, list describe)
```
