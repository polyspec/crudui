# Validator throughput benchmark (JS / PHP / Go / Rust)

Runs the four form-spec validators over the **same spec + same input**, N times
each, and reports throughput (ops/sec) and average latency (µs). Purpose: a
defensible "which backend?" comparison — not an absolute speed claim.

## Run it

```sh
make bench            # all four backends
make bench-js         # one backend
make bench-php
make bench-go
make bench-rust
```

Or directly:

```sh
node tools/bench/run.js --iters 50000 --warmup 5000
node tools/bench/run.js --only js,rust --iters 100000
node tools/bench/run.js --json          # raw JSON lines, no table/file
```

Results print as a table and are written to `tools/bench/results.md`.

## What is measured

Each backend:

1. loads its validator library **in-process** (JS `require`, PHP composer
   autoload, Go package import, Rust crate path-dep),
2. reads the fixture spec + input,
3. builds the `Validator` **once**,
4. **warms up** `warmup` iterations (JIT / branch settling), then
5. **times** `iters` iterations of `validate(input)`.

The timed window is `validate()`-only. Process startup, module/autoload, spec
parse, and fixture I/O all happen **before** the clock starts.

The two fixtures:

| spec         | size       | input            | source |
| ------------ | ---------- | ---------------- | ------ |
| `contact`    | ~6 fields  | fully valid      | `examples/shared-specs/contact.yml` |
| `large-form` | ~80 fields | empty form `{}`  | `tests/fixtures/specs/LargeForm.yml` |

Fixtures are materialized to JSON by `gen-fixtures.js` so every backend reads
byte-identical input (YAML parsing is a JS-only concern and stays out of the
timed path). `make bench` regenerates them first.

## Fairness notes — read before quoting numbers

- **Absolute times are machine-dependent.** They come from one machine, one
  run. Quote the **ratios** between backends within a spec, never the raw µs.

- **Compare down a column, within one spec.** The four rows of a spec are the
  apples-to-apples backend comparison. The two specs are **not** comparable to
  each other: `contact` runs a valid payload through *every* rule, while
  `large-form` runs the empty form, which **short-circuits at the first
  required field**. A spec looking "faster" reflects its input, not difficulty.
  (This is why a backend can post higher ops/sec on the 80-field spec than on
  the 6-field one.)

- **Startup is excluded by construction** — one process per backend per run,
  with the loop inside it. The per-case `spawnSync` in
  `tests/runner/compare-all.js` is correct for the idempotency check but folds
  interpreter/binary boot into every call; reusing it here would measure
  startup, not validation.

- **Same workload, enforced.** All four read the same `fixtures/*.json`, and
  `run.js` aborts the run if the backends disagree on `valid`/`error`/`field`
  for any spec. Comparing throughput on a workload that splits the validators
  would be meaningless.

- **Rust is built `--release`.** A debug build would mismeasure by a large,
  misleading factor.

- **The empty-form large-form input is deliberate.** The raw Legacy
  `LargeForm.yml` carries literal `[]`-suffixed keys for its `multiple` fields
  (`sub_category_seqs[]`, `cover_images[]`, ...), and the four validators
  normalize that suffix differently when matching input keys — a populated
  payload makes PHP diverge from JS/Go/Rust on those array fields (a pre-existing
  difference, outside this benchmark's scope). The empty form is the input all
  four agree on while still driving all 80 fields' required/conditional checks.

## Files

| file                | role |
| ------------------- | ---- |
| `run.js`            | orchestrator: launch drivers, check agreement, table + `results.md` |
| `gen-fixtures.js`   | YAML specs → `fixtures/*.spec.json` + `*.input.json` |
| `bench-js.js`       | JS driver (in-process loop) |
| `bench-php.php`     | PHP driver (single process, in-process loop) |
| `go/main.go`        | Go driver (own module, `replace` → local validator-go) |
| `rust/main.rs`      | Rust driver (own crate, path-dep → local validator-rust) |
| `fixtures/`         | generated spec + input JSON |
| `results.md`        | generated last-run table (machine-dependent) |

## Prerequisites

- `node` (validator-ts `dist/` built: `cd packages/validator-ts && npm run build`)
- `php` with `packages/validator-php/vendor` installed (`composer install`)
- `go`
- `cargo` (on `$HOME/.cargo/bin`; `make bench` prepends it to `PATH`)

A backend whose toolchain or build is missing is reported as failed and skipped;
the rest still run.
