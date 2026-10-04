# Execution checklist

[한국어](execution-checklist.ko.md).

This document lists the planned tasks of CRUDUI, the verification command of each task and its completion. The contracts are in [the specification](../spec/form-markup.md), the status of each feature in [Feature status](../features.md) and the actual changes in [the changelog](../../CHANGELOG.md).

## How to use

- Task ID format: `C<wave>.<number>`. A branch is `{type}/{shortname}-C<wave>.<number>` and a worktree `crudui-{shortname}-C<wave>.<number>` (AGENTS).
- The last column of every task row is its state (AGENTS): `[ ]` waiting, `[~]` in progress, `[o]` done, `[!]` bypassed with its cause and retry condition. A task is `[o]` only after its verification passed on the committed tree.
- A task changes the specification first, then adds failing tests, then changes the implementation.
- A wave starts when the waves that it names as dependencies are done.

## Wave 1 — A stylesheet for small screens and a Tailwind version of the stylesheet

Depends on: none. `@crudui/generator-core/crudui.css` is the only stylesheet of the CRUDUI blocks, and it has no rule for a narrow viewport: no test opens a form, a list or a detail at the width of a phone. A page styled with Tailwind CSS cannot build the CRUDUI styles with its Tailwind build and theme. CRUDUI ships its own stylesheet and a Tailwind version, and an installation chooses one of them.

| ID | Task | Verification | Status |
|---|---|---|---|
| C1.1 | Specify the narrow viewport: every block of the shared fixtures renders without horizontal overflow of the page at a viewport width of 360 CSS pixels and at 1280 pixels, with every control and action inside the viewport | `make docs-check` | [o] |
| C1.2 | Add the browser case of the narrow viewport over the shared fixtures, confirm that it fails where `crudui.css` overflows, and correct `crudui.css` | the browser case, `make docs-check` | [o] |
| C1.3 | Specify the Tailwind version: `@crudui/generator-core/crudui.tailwind.css`, a Tailwind CSS 4 source that styles the same `crudui-*` classes with `@apply` and the same `--crudui-*` custom properties, which compiles with a Tailwind build; the markup does not change, and the compiled result gives every element of the shared fixtures the same computed style as `crudui.css` at both widths | `make docs-check` | [ ] |
| C1.4 | Write `crudui.tailwind.css` and a case that compiles it with the latest stable Tailwind CSS and compares the computed styles with `crudui.css` at both widths; confirm the case fails before the source exists | the comparison case | [ ] |
| C1.5 | Package export, feature status, operations document, changelog and the full suite | the full suite, `make docs-check` | [ ] |
