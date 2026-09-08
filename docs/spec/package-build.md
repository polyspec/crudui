# Package builds

[Korean](package-build.ko.md).

Package builds produce JavaScript, public TypeScript declarations and declared
stylesheets from the same source. JavaScript retains each package's declared
CommonJS and ES module formats. TypeScript generates declarations from the public
entry and its imports, with the package's strict compiler options and
`noEmitOnError`. Tests are checked separately from distributable declarations.

The declaration compiler does not receive deprecated module-resolution options
from the JavaScript bundler. Build commands do not suppress type errors or create
substitute declarations. A clean build removes preceding output before producing
the next package artifacts. Watch commands regenerate declarations after a
successful JavaScript build.

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
