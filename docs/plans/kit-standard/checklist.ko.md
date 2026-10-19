<!-- doc-id: checklist-kit-standard -->
<!-- source-sha256: f6dd06b360813d018bf75965940419c8130932fe49bef629519f666b8af87c8b -->
# kit 표준 체크리스트

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| C16.1 | 저장소가 kit 표준 0.0.54를 따른다 | The files that follow PRINCIPLES.md of kit 0.0.54: the plan layout, the rules of AGENTS, the layout and the checks of the repository | `make kit-check` | [o] |
| C16.2 | CI는 존재하는 target을 PHP 8.4로 호출하고, 어떤 test도 skip하지 않는다 | .github/workflows/ci.yml, tests/build/make-tool-path.test.mts, packages/php-ext/tests/engine.test.mjs | `node --test tests/build/make-tool-path.test.mts` | [o] |
| C16.3 | config/parity.json의 모든 unit은 모든 구현에서 성립하고, test가 이름으로 적은 spec requirement를 인용한다 (kit K273, K275, K276) | config/parity.json, docs/spec, the tests of every implementation | `make parity-declarations-check` | [!] 원인: 선언이 아직 profile, native 전용 symbol이나 exclusion, 또는 명명된 requirement가 없는 unit을 담고 있다; 각 구현의 누락된 feature와 test는 red-first로 작성되어야 한다; 재시도: kit 0.0.55를 make kit-sync로 설치한 후 |
