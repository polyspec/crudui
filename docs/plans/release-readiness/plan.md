<!-- doc-id: plan-release-readiness -->
# Release candidate reconsideration

[한국어](plan.ko.md)

## Dependency and checkpoint

The [checklist](checklist.md) becomes active after `ci-passed` and `push-gate` succeed for the candidate commit and before
publication. C18.1 is bypassed until that dependency holds. A development review does not complete this checkpoint.
The maintainer supplies the candidate tag through `TAG`; this plan creates no tag.

## Conditional decisions

- C16.8: Query the current stable VitePress distribution and compare its bundled parser with the security fix. Adopt a
  suitable fixed distribution, or retain the renderer with current evidence in the rebuild record.
- C16.173: Reconsider the React widget-script exception against the current candidate and available fixes. An upgrade
  must preserve client widget-script execution; run its owning tests when evaluating a changed React version. Version
  alignment alone does not require an upgrade.
- C16.45, C16.170 and C16.171: Verify the tracked dependency declarations and candidate archives without development
  links. The dependency manager must resolve the published versions and the consumer smoke commands must pass.
- C16.169: Refresh advisory data. A withdrawn advisory does not require an update, but its withdrawal does not exempt
  the candidate from new security findings.

## Accepted decisions

C16.13 is implemented by C16.13-1. C16.29-1 corrects forwarding and documents why the current adapter is retained; its
rebuild record states when its tool comparison changes. C16.65 removes an invalid vocabulary restriction. C16.172 does
not require matching another repository's exact PHPUnit constraint; Composer selects within the declared constraint.
These decisions do not remove the candidate dependency and archive checks.

## Completion

Record the candidate commit, review date, evaluated versions, retained decisions and consumer results. A feasible change
is implemented with its owning checks before publication. A changed candidate obtains its own required CI results.
A condition that still prevents an optional replacement is recorded with current evidence and a new retry condition;
it is never described as permanent solely because it was previously withdrawn.
