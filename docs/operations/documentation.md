# Documentation maintenance

[한국어](documentation.ko.md).

| Location | Content |
| --- | --- |
| `README.md` | Project introduction, minimum setup and document links. |
| `docs/spec/` | Approved structures, contracts, rules and acceptance criteria. |
| `docs/features.md` | Implementation, verification evidence and deployment status. |
| `docs/operations/` | Current setup, execution, deployment and verification procedures. |
| `CHANGELOG.md` | Actual behavior changes and verification results. |
| `docs/plans/` | Proposals awaiting approval; remove after incorporation into the specification. |
| `AGENTS.md` | Development procedures and required checks. |

Each subject has one authoritative document. English is authoritative; its Korean
translation uses `.ko.md`. Update both in the same change and compare their
meaning. Store personal preferences and conversation context outside Git.

Update the specification before changing direction. Mark unfinished behavior in
the feature table. Update implementation status, verification evidence and the
changelog with the behavior change. Test results apply only to the code tested;
they do not establish deployment.

Run `make docs-check` for API documentation, local links, required translations
and feature status fields. Run `make docs` to generate API references, schema and
the documentation site. Automated checks do not establish content accuracy;
review the relevant source and tests before recording a result.

Use repository-relative paths in scripts and documents. External source tools
must require an explicit input path. They must not depend on another project's
checkout or a developer's home directory.

Translation and link checks cover repository entry documents, generator package
READMEs, the form comparison example README, feature status, and all documents under `docs/spec/`, `docs/operations/`
and `docs/plans/`. Older reference documents outside those directories are not
included in translation coverage. The check compares code examples and status
fields between translations; prose equivalence requires review.
