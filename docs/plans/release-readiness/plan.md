<!-- doc-id: plan-release-readiness -->
# Local release candidate preparation

[한국어](plan.ko.md)

## Preparation order

The [checklist](checklist.md) is complete. CRUDUI 0.0.8 is public from commit
`47612fe4297203d46232646eba8365a6fbda43ef`, which passed full CI, push checks and all three tag release workflows.
The release workflow installed and checked all 11 archives outside the checkout before publication.

## Current decisions

- C16.8: C18.2 completes the current parser decision. Fresh stable and next VitePress distributions still contain the
  affected parser; the directly managed current markdown-it 15.0.3 parser includes the fix. The renderer remains in use
  for this candidate. The rebuild record's maintenance trigger does not defer the current candidate decision.
- C16.173: C18.3 supports current React and React DOM without the widget-script exception and retains script execution
  and server hydration verification.
- C16.45, C16.170 and C16.171: Native package managers resolve the current local sources. The root Composer declaration
  and lock select the current sibling packages; a duplicate archive-compatibility profile is not part of local preparation.
- C16.169: Current advisory review determines applicable findings. A withdrawn advisory does not require a version bump
  and does not exempt the current dependency graph from security verification.
- C18.4 prepares current npm dependencies and supported Svelte peers. C18.5 aligns version 0.0.8 declarations and native
  locks. C18.6 separates PHP source-only helper tests from the extension runtime tests.

## Accepted decisions

C16.13 is implemented by C16.13-1. C16.29-1 corrects forwarding and records the application-specific requirements that
retain the current adapter. C16.65 removes an invalid vocabulary restriction. C16.172 leaves constraint selection to
Composer rather than matching another repository's exact declaration. These decisions do not remove the current
source dependency, package or consumer checks.

## Completion

Record the prepared source commit, review date, evaluated versions, native package-manager results and consumer results.
Build any local candidate artifacts from the current merged source snapshot and consume only artifacts made in that run.
Complete the remaining local corrections with their owning checks and merge every completed development branch into local
`main`. C18.1 becomes complete only after this preparation and its local verification finish.

Successful CI remains a condition of later publication, not a reason to leave local preparation bypassed. A later change
requires its owning verification and the publication checks of the resulting commit. Future maintenance triggers remain
separate from the completed decision for this candidate.
