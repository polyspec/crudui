# Package build checks

[한국어](README.ko.md).

Run from the repository root:

```sh
npm ci --strict-allow-scripts
npm run test:runtimes
npm run test:dependencies
npm run build
npm run test:build
npm run test:build:repeat
npm run test:packages
```

`test:runtimes` requires one even-numbered Node.js major in `.node-version` and
one Go major and minor release in `.go-version`. CI reads both files, and every
Node.js and Go container stage uses the corresponding release line. Rust CI and
container stages select the stable Rust channel. The check rejects exact runtime
patch releases and numeric npm releases. CI installs the current stable npm
release. The runtime checks run repository Rust Node.js entry points without
Cargo on the process `PATH`. Each entry point must resolve Cargo, rustc and
rustdoc from one toolchain record and supply the resolved compiler paths to
Cargo.

`test:dependencies` rejects invalid, missing and conflicting installed packages.
For every tracked npm lock file, it also rejects moderate, high and critical
advisories, unapproved lifecycle scripts and script approvals that do not name an
exact package version.

`test:runtimes` also runs the contract manifest check on synthetic repositories and on this
repository: every package entry is declared with its exact value exports and visibility, and only
CRUDUI package code imports an internal entry.

`test:build` loads validator, generator-core, generator-html and generator-react through their
public CommonJS and ESM exports, and generator-core's internal entry in both formats. It compiles strict NodeNext type consumers with
`skipLibCheck: false`, checks the complete declaration graph and verifies React's
exported stylesheet. Invalid public types must prevent declaration emission in
all four TypeScript package configurations. It also checks that each script that runs other
commands stops a command that never ends, with its whole process group, at the command's limit
([command limits](../../docs/operations/testing.md#command-limits)).

`test:bench` checks that the JavaScript, PHP, Go and Rust benchmark drivers and
`tools/bench/run.js` accept and reject the iteration counts of
`tests/fixtures/bench/iteration-arguments.json` by one rule with one message. It needs PHP, Go
and Rust; the native generation job of CI runs it.

`test:build:repeat` runs the complete build twice and compares every output file's
path and SHA-256 digest in all five package directories.

`test:packages` builds and packs the packages, installs them into a separate
consumer, compiles all framework types, builds the consumer application and runs
its three form components in a browser. These checks do not replace form
validation, persistence or the full interaction matrix.
