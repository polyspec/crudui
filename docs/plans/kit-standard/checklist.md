<!-- doc-id: checklist-kit-standard -->
# The kit standard checklist

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| C16.1 | The repository follows the kit standard 0.0.54 | The files that follow PRINCIPLES.md of kit 0.0.54: the plan layout, the rules of AGENTS, the layout and the checks of the repository | `make kit-check` | [o] |
| C16.2 | CI calls existing targets on PHP 8.4, and no test is skipped | .github/workflows/ci.yml, tests/build/make-tool-path.test.mts, packages/php-ext/tests/engine.test.mjs | `node --test tests/build/make-tool-path.test.mts` | [o] |
| C16.3 | Every unit of config/parity.json holds in every implementation and cites the spec requirements its tests name (kit K273, K275, K276) | config/parity.json, docs/spec, the tests of every implementation | `make parity-declarations-check` | [!] cause: the declaration still holds profiles, native-only symbols or exclusions, or units without named requirements; each missing feature and test of each implementation is to be written red-first; retry: after kit 0.0.55 is installed with make kit-sync |
| C16.4 | The Korean checklist of the kit-standard plan matches its source | docs/plans/kit-standard/checklist.ko.md | `node node_modules/@polyspec/kit/dist/check-documents.mjs` | [o] |
| C16.5 | docs/ holds only the folders K245 allows | docs/.site, scripts/docs-web/build.mts, scripts/docs-web/watch.mts, docs/operations/documentation.md, docs/operations/documentation.ko.md | `make layout-check`, `node node_modules/@polyspec/kit/dist/run-tests.mjs node -- tests/docs/development-server.test.mts tests/docs/web-build.test.mts` | [o] |
| C16.6 | The PHP generator has no empty catch | packages/generator/php/src/Internal/Design.php, packages/generator/php/tests/FormTest.php | `make lint-php`, `node node_modules/@polyspec/kit/dist/run-tests.mjs phpunit --cwd packages/generator/php -- tests/FormTest.php` | [o] |
