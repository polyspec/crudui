# Benchmark argument fixtures

[한국어](README.ko.md).

`iteration-arguments.json` holds the iteration counts that `tools/bench/run.js` and the
JavaScript, PHP, Go and Rust benchmark drivers accept or reject. A count is one to eight decimal
digits: `--iters` from 1 and `--warmup` from 0, both up to 10000000. Every program rejects any
other value, a missing value included, before it loads a validator, prints the case's `message`
on standard error and exits with status 2.

`rejected` lists each argument pair and its message. `accepted` is one run of the `contact`
fixture with the smallest counts; its report must name that spec and that iteration count.

`tests/build/bench-drivers.test.mjs` runs every case against every program
(`npm run test:bench`).
