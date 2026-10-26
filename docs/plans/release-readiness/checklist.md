<!-- doc-id: checklist-release-readiness -->
# Release candidate reconsideration checklist

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| C18.1 | Reconsider conditional withdrawals at the candidate publication checkpoint (priority: high). | docs/rebuild/documentation-web.md, config/dependency-policy.json, config/dependency-review.json, candidate archive consumer evidence | `make dependency-review RECORD=1`; `node node_modules/@polyspec/kit/scripts/kit/run-tests.mts node -- tests/build/release-fixtures.test.mts`; `make release-consumer TAG="${TAG:?set the candidate tag}"` | [!] cause: The candidate commit has not completed ci-passed and push-gate; C17.52 records development checks, not candidate publication verification.; retry: ci-passed and push-gate succeed for the candidate commit; reassess the conditional choices and archive installs before publication. |
