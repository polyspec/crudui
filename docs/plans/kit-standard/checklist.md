<!-- doc-id: checklist-kit-standard -->
# The kit standard checklist

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| C16.1 | The repository follows the kit standard 0.0.54 | The files that follow PRINCIPLES.md of kit 0.0.54: the plan layout, the rules of AGENTS, the layout and the checks of the repository | `make kit-check` | [o] |
| C16.2 | CI calls existing targets on PHP 8.4, and no test is skipped | .github/workflows/ci.yml, tests/build/make-tool-path.test.mts, packages/php-ext/tests/engine.test.mjs | `node --test tests/build/make-tool-path.test.mts` | [o] |
