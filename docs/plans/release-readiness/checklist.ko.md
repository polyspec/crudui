<!-- doc-id: checklist-release-readiness -->
<!-- source-sha256: 84ceff50c94a395d93396b1681c7e44debc68655705f5fd2c170e90477495bbf -->
# Release candidate 재검토 체크리스트

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| C18.1 | Candidate publication 단계에서 조건부 철회를 재검토한다 (우선순위: 높음). | docs/rebuild/documentation-web.md, config/dependency-policy.json, config/dependency-review.json, candidate archive consumer evidence | `make dependency-review RECORD=1`; `node node_modules/@polyspec/kit/scripts/kit/run-tests.mts node -- tests/build/release-fixtures.test.mts`; `make release-consumer TAG="${TAG:?set the candidate tag}"` | [!] 원인: Candidate commit의 ci-passed와 push-gate가 완료되지 않았으며 C17.52는 candidate publication 검증이 아니라 개발 검사를 기록한다.; 재시도: Candidate commit의 ci-passed와 push-gate가 성공하면 publication 전에 조건부 선택과 archive 설치를 재평가한다. |
