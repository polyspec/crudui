<!-- doc-id: checklist-kit-standard -->
<!-- source-sha256: e95e5b5022d4b8b10f8fc3598227f182bd4db5627ee1294612aa88bd206281a2 -->
# kit 표준 체크리스트

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| C16.1 | 저장소가 kit 표준 0.0.54를 따른다 | The files that follow PRINCIPLES.md of kit 0.0.54: the plan layout, the rules of AGENTS, the layout and the checks of the repository | `make kit-check` | [o] |
| C16.2 | CI는 존재하는 target을 PHP 8.4로 호출하고, 어떤 test도 skip하지 않는다 | .github/workflows/ci.yml, tests/build/make-tool-path.test.mts, packages/php-ext/tests/engine.test.mjs | `node --test tests/build/make-tool-path.test.mts` | [o] |
| C16.3 | config/parity.json의 모든 unit은 모든 구현에서 성립하고, test가 이름으로 적은 spec requirement를 인용한다 (kit K273, K275, K276) | config/parity.json, docs/spec, the tests of every implementation | `make parity-declarations-check` | [!] 원인: 선언이 아직 profile, native 전용 symbol이나 exclusion, 또는 명명된 requirement가 없는 unit을 담고 있다; 각 구현의 누락된 feature와 test는 red-first로 작성되어야 한다; 재시도: kit 0.0.55를 make kit-sync로 설치한 후 |
| C16.4 | kit-standard plan의 한국어 checklist가 원문과 일치한다 | docs/plans/kit-standard/checklist.ko.md | `node node_modules/@polyspec/kit/dist/check-documents.mjs` | [o] |
| C16.5 | docs/는 K245가 허용한 폴더만 담는다 | docs/.site, scripts/docs-web/build.mts, scripts/docs-web/watch.mts, docs/operations/documentation.md, docs/operations/documentation.ko.md | `make layout-check`, `node node_modules/@polyspec/kit/dist/run-tests.mjs node -- tests/docs/development-server.test.mts tests/docs/web-build.test.mts` | [o] |
| C16.6 | PHP generator에 빈 catch가 없다 | packages/generator/php/src/Internal/Design.php, packages/generator/php/tests/FormTest.php | `make lint-php`, `node node_modules/@polyspec/kit/dist/run-tests.mjs phpunit --cwd packages/generator/php -- tests/FormTest.php` | [o] |
| C16.7 | repository의 모든 도구가 config/rebuild.json에 class를 가진다 | config/rebuild.json, docs/rebuild | `make rebuild-check` | [o] |
| C16.8 | 문서 site는 VitePress로 빌드하고 docs/.vitepress/dist를 제거한다 (scripts/docs-web과 scripts/documentation-links.mts를 대체) | package.json, docs/.vitepress, scripts/docs-web, scripts/documentation-links.mts, config/rebuild.json | `make rebuild-check`, `make layout-check` | [ ] |
| C16.9 | PHP extension을 phpize로 빌드한다 (scripts/php-extension-builder.mts, build-crudui-php-extension.mts, build-ordered-json-php-extension.mts, tool-resolution.mts를 대체). kit이 component 저장소의 S10을 정할 때까지 보류 | packages/php-ext, scripts, config/rebuild.json | `make rebuild-check` | [ ] |
| C16.10 | scripts의 명령은 kit이 export하는 process-group runner로 실행한다 (scripts/run-command.mts를 대체). kit export를 기다린다 | scripts, config/rebuild.json | `make rebuild-check` | [ ] |
| C16.11 | scripts는 JSON을 scripts/values.mts가 아니라 ajv schema로 읽는다 (21개 파일이 호출) | scripts, tests/build, config/rebuild.json | `make rebuild-check` | [ ] |
| C16.12 | Tailwind stylesheet는 crudui.css를 components layer로 가져오는 CSS 기본 import이다 (write-tailwind-styles.mjs를 대체) | packages/generator/ts/styles, packages/generator/ts/scripts, docs, config/rebuild.json | `make rebuild-check` | [ ] |
| C16.13 | contracts/unicode-properties.json은 @unicode/unicode-16.0.0에서 얻는다 (scripts/generate-unicode-properties.mts와 contracts/unicode를 대체) | contracts, scripts, config/rebuild.json | `node node_modules/@polyspec/kit/dist/run-tests.mjs node -- tests/build/unicode-properties.test.mts`, `make rebuild-check` | [ ] |
| C16.14 | config/duplication.json은 생성된 Unicode table과 test를 각각의 이유와 함께 제외한다 | config/duplication.json | `make duplication-check` | [o] |
