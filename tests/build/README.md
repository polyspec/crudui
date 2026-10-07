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

`test:runtimes` requires one exact release of every tool: Node.js in `.node-version`,
Go in `.go-version` and the `toolchain` line of every `go.mod`, Rust in
`rust-toolchain.toml`, the PHP minors and Composer in `config/toolchain.json`, and requires the
running Node.js, npm, Go, Rust and Composer to be those releases and PHP to be of a recorded minor
(`scripts/check-toolchain.mjs`). Every CI job runs on `ubuntu-24.04`, names its actions by
commit SHA, sets up the recorded releases and checks the tools it set up; the checkout tracks
no container definition; no browser of a release channel or of the machine is used.
`packageManager` of `package.json` records one exact npm release;
the check fails when the running npm or a workflow step
selects another release, and `node scripts/install-npm.mjs` installs it into `.tools/npm` of the checkout.
`tests/build/checkout-npm.test.mjs` fails when a script, a make target or a CI step installs npm into the machine,
when make, a script that starts npm or a CI job does not put `.tools/npm/node_modules/.bin` first on `PATH`, and
when the installation leaves another release or a temporary directory. The runtime checks run repository Rust Node.js entry points without
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
public CommonJS and ESM exports, and generator-core's internal entry in both formats. It compiles strict NodeNext type projects with
`skipLibCheck: false` against the declarations of validator, generator-core, generator-html,
generator-react, generator-vue, generator-svelte and form-binding, checks the complete declaration graph and verifies React's
exported stylesheet. Invalid public types must prevent declaration emission in
all four TypeScript package configurations. It also checks that each script that runs other
commands stops a command that never ends, with its whole process group, at the command's limit
([command limits](../../docs/operations/testing.md#command-limits)).

`test:bench` checks that the JavaScript, PHP, Go and Rust benchmark drivers and
`tools/bench/run.js` accept and reject the iteration counts of
`tools/bench/iteration-arguments.json` by one rule with one message. It needs PHP, Go
and Rust; the native generation job of CI runs it. It first builds the packages and then the Go and
Rust drivers with `tools/bench/build-drivers.mjs`, which streams each build's output and prints its
result with its elapsed time, without a time limit; the test runs the built drivers, and each of its
tests has the 30-second timeout of the test runner.

`test:build:repeat` runs the complete build twice with `scripts/repeat-build.mjs`, a logged step
without a time limit that reads the path and SHA-256 digest of every output file of the published
packages after each build and fails with every file that differs between its two builds; it keeps no
record between runs. The test covers the package list and the comparison without a build, each test
within the 30-second timeout of the test runner.

`test:packages` builds and packs the packages, installs them into a separate
install project, compiles all framework types, builds the install project and runs
its three form components in a browser. These checks do not replace form
validation, persistence or the full interaction matrix.
