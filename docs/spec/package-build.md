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
Vitest configuration.

The declaration compiler does not receive deprecated module-resolution options
from the JavaScript bundler. Build commands do not suppress type errors or create
substitute declarations. A clean build removes preceding output before producing
the next package artifacts. Watch commands regenerate declarations after a
successful JavaScript build.

Generated output is not tracked in Git. Svelte's `.svelte-kit` directory is
temporary packaging output; `src` is the build input and `dist` is the published
output. A build must succeed without a preceding `.svelte-kit` directory.
Compiled Go CLI executables are generated from source and excluded from Git.
Applications that execute a CLI build it before use.

The specification CLI runs its TypeScript source through `tsx`. Its generator
imports load the validator through the public package entry, so local commands
and CI tests build the validator before running the CLI. Dependency installation
alone does not generate that package output.

## Acceptance

- `npm ci` installs the pinned dependencies, and `npm run build` executes the
  declared validator and generator builds in dependency order.
- The validator, generator-core and generator-react load through their public
  CommonJS and ES module exports without importing package source paths.
- Strict consumers resolve public types and their complete declaration imports.
- React's exported stylesheet exists and matches its declared source stylesheet.
- Repeated builds preserve the public API and produce the same artifacts for
  unchanged inputs.

These checks cover package generation and consumption. Form control behavior,
validation conformance, SSR and browser interaction retain their separate tests.

Dependency resolution uses the version constraints declared in package manifests.
The lock file records the resolved dependency graph, including optional native
packages for supported platforms. Clean installations use `npm ci`; package and
consumer checks run against the resolved graph before verification is recorded.
Installation runs dependency lifecycle scripts. npm versions that require script
approval use the exact package approvals in the root `allowScripts` field.
Container builds install platform dependencies through the package manager.
The root development dependencies include the shared test runner so that testing
integrations installed at the root can resolve it through normal module lookup.

Dependency updates are prepared and verified locally. The repository does not
schedule dependency update pull requests. Updated manifests and lock files are
verified together with the relevant package and documentation checks.

## Runtime and dependency versions

Release candidates use the latest active LTS release for runtimes that publish
an LTS channel. Node.js uses the newest even-numbered stable major designated as
the active or next LTS release. This permits the next LTS major while it has
Current status and excludes odd-numbered releases. Runtimes and tools without an
LTS channel use the latest stable release supported by the project. Pre-release
versions are excluded unless a specification explicitly requires one.

Repository execution definitions select a release channel instead of an exact
patch release. `.node-version` records the selected Node.js major, and
`.go-version` records the selected Go major and minor release. CI reads these
files. Node.js and Go container stages use the corresponding release line in
their image tags. Rust CI selects the stable toolchain, and Rust container stages
use the stable major channel instead of an exact patch release. CI installs the
current stable npm release. A candidate build resolves these channels once and
records the resulting image and runtime versions in its verification evidence. A
later build adopts a newer applicable release and produces new evidence. Package
lock files record resolved package versions; they do not select a runtime
release.

Package manifests and lock files must resolve one valid dependency graph.
`npm ls --all` must return status 0 without invalid, missing or conflicting
dependencies. `npm audit --audit-level=moderate` must report no moderate, high or
critical vulnerability. A tool with no secure compatible stable release is
replaced. Dependency overrides and audit exclusions do not satisfy these gates.
Unused build and documentation dependencies are removed.

## Documentation site

The documentation site build reads Markdown from `docs/` after API reference
generation. Every Markdown document must contain exactly one level-one heading.
The heading becomes the document heading and the browser title is
`<heading> | CRUDUI`. `index.md` maps to the directory route; every other
Markdown filename maps to the same clean route without the `.md` suffix. The
build also creates a `404.html` page.

Documentation-relative links use clean site routes. The build verifies every
local target and fragment. A relative link outside `docs/` requires an existing
repository file or directory and becomes a repository source link in generated
HTML. Files under `docs/public/` are copied to the site root. Missing targets,
missing fragments, duplicate routes and invalid document headings fail the
build.

The generated site contains navigation, the complete documentation sidebar,
per-page headings and responsive styles. English documents use `en-US` and
`.ko.md` documents use `ko-KR`. A clean build writes only deterministic
output to `docs/.site/dist/`; repeated builds from unchanged inputs must produce
identical files. Development and preview commands serve the same generated
output and return a nonzero status when the initial build fails.

## PHP dependencies

The PHP validator declares runtime and test dependencies in `composer.json`.
`composer.lock` records their resolved versions. Composer installs `vendor/`;
that generated directory is excluded from Git. A clean checkout must install
these dependencies before invoking PHP validation, tests or documentation checks.
CI uses the same installation command as local development.
