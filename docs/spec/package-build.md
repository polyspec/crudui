# Package builds

[Korean](package-build.ko.md).

Package builds produce JavaScript, public TypeScript declarations and declared
stylesheets from the same source. JavaScript retains each package's declared
CommonJS and ES module formats. TypeScript generates declarations from the public
entry and its imports, with the package's strict compiler options and
`noEmitOnError`. Tests are checked separately from distributable declarations.

Test configuration files declare the module format used by their loader. A Vitest
configuration that uses ES module syntax uses an `.mts` or `.mjs` extension, or a
closest `package.json` with `"type": "module"`. A package that publishes CommonJS
`.js` files retains its CommonJS package type and uses `.mts` for an ES module
Vitest configuration. An ES module Vite configuration resolves paths from
`import.meta.dirname`; it does not use the CommonJS-only `__dirname` binding.
Configuration checks discover source files from the extracted repository tree and
do not require Git metadata. They exclude generated and dependency directories.

The declaration compiler does not receive deprecated module-resolution options
from the JavaScript bundler. Build commands do not suppress type errors or create
substitute declarations. A clean build removes preceding output before producing
the next package artifacts. Watch commands regenerate declarations after a
successful JavaScript build.

Every named type referenced by a public TypeScript declaration is exported from
the package entry point and included in the generated API reference. The API
reference covers each package's public `"."` entry; the `./internal` entries of
generator-core and the validator are built beside it with shared chunks in both module formats, so both
entries use one copy of each module, and it is not documented as public API. TypeDoc
validation warnings fail both API generation and documentation coverage checks.
The documentation pipeline does not suppress references to unexported public
types.

Generated output is not tracked in Git. Svelte's `.svelte-kit` directory is
temporary packaging output; `src` is the build input and `dist` is the published
output. A build must succeed without a preceding `.svelte-kit` directory.
Compiled Go CLI executables are generated from source and excluded from Git.
A CLI is built before use.

Repository Make targets may prepend tool directories to `PATH`. Each recipe
command that depends on an added directory explicitly supplies the expanded
`PATH` when invoking the tool. The tool must resolve from that directory when
Make's process started without it.
Rust recipes do not add a Cargo proxy directory to `PATH`. They use the shared
Rust command entry point, which executes the regular Cargo, rustc and rustdoc
files selected by the toolchain record.

Repository Node.js build and test entry points resolve Rust tools through one
shared rule. An invocation may declare absolute Cargo, rustc and rustdoc paths.
Otherwise, the resolver discovers one regular rustup executable from the
declared `PATH` entries and the Rustup Cargo home (`CARGO_HOME`, or the Rustup
default under `HOME` when omitted). Duplicate references to the same executable
are one result; distinct results are ambiguous and fail. The resolver executes
`rustup which cargo`, `rustup which rustc` and `rustup which rustdoc` in the
working directory declared for the Cargo command. The resolver requires that
directory to be absolute and canonical, with regular directory components and
no symbolic links. It then
requires every returned path to be an absolute, canonical, executable regular
file with no symbolic-link path
component. Missing records, malformed version output and ambiguous discovery
fail before a build starts. Entry points execute the resolved Cargo path, set
`RUSTC` and `RUSTDOC` to the resolved compiler paths and do not substitute Rust
commands from the process `PATH`.

The specification CLI runs its TypeScript source through `tsx`. Its generator
imports load the validator through the public package entry, so local commands
and CI tests build the validator before running the CLI. Dependency installation
alone does not generate that package output.

## Acceptance

- `npm ci --strict-allow-scripts` installs the pinned dependencies, and `npm run build` executes the
  declared validator and generator builds in dependency order.
- The validator, generator-core, generator-html and generator-react load through their public
  CommonJS and ES module exports without importing package source paths.
- `@crudui/form-binding` loads only through its ES module export. Its declarations are in ES
  module format, and neither Node.js nor TypeScript resolves the package for a CommonJS project.
- `@crudui/generator-vue` declares `"type": "module"` and loads through its ES module and
  CommonJS exports. Its declarations are in ES module format and their relative imports name `.js`
  files, so strict `NodeNext` ES module and CommonJS projects compile against them.
- `@crudui/generator-svelte` loads through its `svelte` export. Its declarations are in ES module
  format, and their relative imports name `.js` files or `.svelte` files. A strict `NodeNext` ES
  module project compiles against them when an import of a `.svelte` file resolves to the
  `.svelte.d.ts` declaration beside it, as the Svelte toolchain resolves it.
- Strict install projects resolve public types and their complete declaration imports.
- Install verification installs every package that `contracts/features.json` records, and
  repeated builds compare the output of every one of them; a check whose package list differs
  from that record fails.
- Install verification packs each workspace from its package directory. The
  `pack --json` result of the recorded npm release contains exactly one package record.
  The record reports the same package name and one archive filename.
- React's exported stylesheet exists and matches its declared source stylesheet.
- Repeated builds preserve the public API and produce the same artifacts for
  unchanged inputs.

These checks cover package generation and installation. Form control behavior,
validation conformance, SSR and browser interaction retain their separate tests.

Dependency resolution uses the version constraints declared in package manifests.
The lock file records the resolved dependency graph, including optional native
packages for supported platforms. Clean installations use
`npm ci --strict-allow-scripts`; package and
install checks run against the resolved graph before verification is recorded.
Installation runs dependency lifecycle scripts. Each independently installed
dependency graph records required script approvals as exact package versions in
the `allowScripts` field of that graph's root package manifest. Name-only and
version-range approvals are not accepted. A clean install uses npm's strict
approval check and fails before installation when any lifecycle script is not
covered by an exact approval.
Workspace packages use the root lock file and do not maintain package-level lock
files.
Container builds install platform dependencies through the package manager.
Container build contexts exclude every generated package output directory. A
container build does not import extension objects, native modules or other build
output from the host workspace.
The root development dependencies include the shared test runner so that testing
integrations installed at the root can resolve it through normal module lookup.
Every repository-root Node.js entry point invoked by a build or test target
declares each directly imported third-party package in the root manifest. A
workspace package is available through the root workspace declaration. A
transitive dependency or a dependency declared only by another workspace does
not satisfy a root entry point.
Repository-root test commands may load modules below `examples/`. The root
manifest declares every third-party package imported by those modules, and one
clean root installation provides those dependencies. Tests do not depend on an
ignored nested `node_modules` directory. The cross-check renderer resolves Vite
and the Svelte Vite plugin by package specifier; it does not construct a path
inside `node_modules`.

Dependency updates are prepared and verified locally. The repository does not
schedule dependency update pull requests. Updated manifests and lock files are
verified together with the relevant package and documentation checks.
Composer path repositories for repository-local packages set `symlink` to
`false`. Composer copies each local package into `vendor/`; installed PHP package
trees do not contain symbolic links. Manifests and lock files record the same
copy-install setting. A copy does not follow later source changes, so a check that loads a copied package reinstalls it from its source first.
Library manifests do not declare their release version. Git repository metadata
provides release versions. A project that resolves one local path repository
declares the exact package version in that repository's `options.versions` map,
and its requirement uses the same version.
Container builds without Git metadata declare `COMPOSER_ROOT_VERSION` with the
repository package version before running Composer. They do not use Composer's
inferred root-version value.

## Runtime and dependency versions

Every tool that builds, installs or checks the repository runs at one exact
version that the checkout records, locally, in CI and in the container images,
so the same tree gives the same result on every date and machine. A newer
release is adopted by changing its record, which the checks then require
everywhere. Releases are chosen when the record changes: runtimes that publish an
LTS channel use their latest active LTS release, Node.js its newest even-numbered
stable major designated as the active or next LTS release, and other tools their
latest stable release supported by the project. Pre-release versions are excluded
unless a specification explicitly requires one. No run queries a registry for the
latest release of a channel, and no tool installs another version on its own.

- `.node-version` records the exact Node.js release, which CI reads.
- `packageManager` of the root `package.json` records the exact npm release,
  because the npm that installs, packs and runs the scripts changes their results,
  as the `pack --json` report changed from an array in npm 11 to an object in
  npm 12. `node scripts/install-npm.mjs` installs exactly that release into the
  ignored directory `.tools/npm` of the checkout and never into the machine, whose
  npm every other checkout uses. The Makefile, every script that
  starts npm and every CI job put `.tools/npm/node_modules/.bin` first on `PATH`;
  a container image installs the same release as the npm of its image.
- `.go-version` records the exact Go release, which CI reads. Every `go.mod`
  names it in its `toolchain` line, and `GOTOOLCHAIN=local`, which the Makefile,
  CI and the images set, keeps go from downloading another toolchain.
- `rust-toolchain.toml` records the exact Rust release with the profile `minimal`
  and the components `rustfmt` and `clippy`. The Makefile, CI and the images set
  `RUSTUP_AUTO_INSTALL=0`, so a cargo without the installed toolchain fails with
  rustup's message instead of installing it; `make install` and CI install it
  with `rustup toolchain install --no-self-update`.
- `config/toolchain.json` records the exact PHP release of each tested PHP minor
  in `php`, the exact Composer release in `composer`, and the SHA-256 of the
  Linux x64 archive of the Node.js release in `node`. A container image takes
  PHP from the `php` image of the recorded release of the newest tested minor and
  Composer from the `composer` image of its recorded release, because Debian has
  no package of either release; no image installs a `php8.N-*` package.
- `node scripts/check-toolchain.mjs <tool>...` fails for every named tool that
  does not run at its recorded version and names the record, the expected and the
  running version, and the fix. Every CI job runs it for the tools that it set up;
  `make toolchain-check` runs it for all of them.

A container stage names its image by an exact tag and its digest, and the
Debian packages of an image come from `snapshot.debian.org` at one recorded date,
so a definition installs the same files on every date. Package lock files record
resolved package versions; they do not select a runtime release.

GitHub-hosted CI runs on `ubuntu-24.04` and names every action by the commit SHA
of one release, with the release in a comment. Native report upload uses
`actions/upload-artifact` 7, whose action runtime is Node.js 24. An action that
declares a deprecated Node.js runtime is not accepted even when the runner
replaces that runtime during execution.

The browser checks run Chrome and Firefox at the builds that the locked
`puppeteer` pins and WebKit at the build that the locked `playwright` pins;
`node scripts/install-browsers.mjs <chrome|firefox|webkit>...` installs them, and
no browser of the machine or of a release channel is used. Linux CI browser jobs
keep the cache of Puppeteer in `.tools/puppeteer` of the checkout
(`PUPPETEER_CACHE_DIR`) and install the set-user-ID sandbox helper of that
Chrome at `/usr/local/sbin/chrome-devel-sandbox`, which `CHROME_DEVEL_SANDBOX`
names. Before tests start, a preflight requires the browser and every parent path
component to be regular filesystem entries with no symbolic-link resolution. The
preflight launches Chrome without sandbox-disabling arguments and requires
`chrome://sandbox` to report `You are adequately sandboxed.` This status requires
a namespace or SUID first layer, PID and network namespaces, and Seccomp-BPF. Any
failed condition fails the job. A failed sandbox condition names the evaluation
or the `chrome://sandbox` row, its reported value and the required value. CI
browser checks do not use `--no-sandbox` or `--disable-setuid-sandbox`.

Every Git-tracked npm lock file is a maintained dependency graph. The root
installation must make `npm ls --all` return status 0 without invalid, missing or
conflicting dependencies. `npm audit --package-lock-only --audit-level=moderate`
must report no moderate, high or critical vulnerability for each tracked lock
file. `npm ci --dry-run --strict-allow-scripts` must also succeed for each graph.
A URL dependency may be fetched only when the root manifest declares it directly.
The project npm configuration sets `allow-remote=root`; npm rejects URL
dependencies introduced by dependencies. The manifest pins each permitted URL to
an immutable source revision, and the lock file records its integrity.
A tool with no secure compatible stable release is replaced. Dependency overrides
and audit exclusions do not satisfy these checks. Unused build and documentation
dependencies are removed.

## Documentation web

The documentation web build reads Markdown from `docs/` after API reference
generation. Every Markdown document must contain exactly one level-one heading.
The heading becomes the document heading and the browser title is
`<heading> | CRUDUI`. `index.md` maps to the directory route; every other
Markdown filename maps to the same path with an `.html` suffix. The
build also creates a `404.html` page.

Heading anchors use the GitHub-compatible slug of the rendered heading text:
case is folded, punctuation and whitespace become hyphens, repeated hyphens
and boundary hyphens are removed, and a leading digit is not prefixed. Duplicate
heading slugs receive a numeric suffix. Relative document links use these
anchors, so a link fragment must match the generated slug.

Documentation-relative links use generated HTML routes. The build verifies every
local target and fragment. A relative link outside `docs/` requires an existing
repository file or directory and becomes a repository source link in generated
HTML. Files under `docs/public/` are copied to the web root. Missing targets,
missing fragments, duplicate routes and invalid document headings fail the
build.

The generated web contains navigation, the complete documentation sidebar,
per-page headings and responsive styles. English documents use `en-US` and
`.ko.md` documents use `ko-KR`. A clean build writes only deterministic
output to `docs/.web/dist/`; repeated builds from unchanged inputs must produce
identical files. Development and preview commands serve the same generated
output and return a nonzero status when the initial build fails.

`DOCS_BASE_PATH` sets the URL prefix for build, development and preview. It defaults
to `/` when omitted. Explicit values must start and end with `/` and contain only
letters, digits, `_` or `-` in each path segment. Invalid values fail the command.
Navigation, document links, images, styles and the 404 page use that prefix.
GitHub Pages publishes the checked web at `https://polyspec.github.io/crudui/`
after the CI documentation job succeeds on `main`.

## PHP dependencies

The PHP validator declares runtime and test dependencies in `composer.json`.
`composer.lock` records their resolved versions. Composer installs `vendor/`;
that generated directory is excluded from Git. A clean checkout must install
these dependencies before invoking PHP validation, tests or documentation checks.
CI uses the same installation command as local development.
