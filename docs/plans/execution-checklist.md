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
| C1.3 | Specify the Tailwind version: `@crudui/generator-core/crudui.tailwind.css` holds the rules of `crudui.css` in the cascade layer `components` of Tailwind CSS 4, generated from `crudui.css` and checked against it, so it is imported after `tailwindcss` and the Tailwind utilities override the CRUDUI rules; the markup does not change, and compiled with the theme and the utilities of the latest stable Tailwind CSS it gives every element of the shared fixtures the same computed style as `crudui.css` at both widths. Amended on 2026-10-04: the first text required a second stylesheet written with `@apply`, which two hand-written copies of about 900 rules would let drift apart | `make docs-check` | [o] |
| C1.4 | Generate `crudui.tailwind.css` with a script that also checks the committed file; add a case that compiles it with the latest stable Tailwind CSS and compares the computed styles with `crudui.css` at both widths in the three engines; confirm both fail before the file exists | the generation check, the comparison case | [o] |
| C1.5 | Package export, feature status, operations document, changelog and the full suite | the full suite, `make docs-check` | [~] |
