# Execution checklist

[English](execution-checklist.md).

이 문서는 CRUDUI의 계획된 작업과 각 작업의 verification command, 상태를 담는다. contract는 [specification](../spec/form-markup.ko.md)에, feature별 상태는 [feature status](../features.ko.md)에, 실제 변경은 [changelog](../../CHANGELOG.ko.md)에 있다.

## 사용법

- Task ID 형식은 `C<wave>.<number>`다. branch는 `{type}/{shortname}-C<wave>.<number>`, worktree는 `crudui-{shortname}-C<wave>.<number>`다(AGENTS).
- 모든 작업 행의 마지막 열은 상태다(AGENTS). `[ ]` 대기, `[~]` 진행 중, `[o]` 완료, `[!]` 원인과 재시도 조건을 적은 일시 우회. 커밋된 tree에서 verification이 통과한 뒤에만 `[o]`로 바꾼다.
- 작업은 specification을 먼저 바꾸고, failing test를 더하고, 그다음 implementation을 바꾼다.
- wave는 의존으로 적은 wave가 끝나면 시작한다.

## Wave 1 — 좁은 viewport를 위한 stylesheet와 stylesheet의 Tailwind 버전

의존: 없음. `@crudui/generator-core/crudui.css`는 CRUDUI block의 유일한 stylesheet이고, 좁은 viewport를 위한 rule이 없다. form, list, detail을 phone 폭으로 여는 test도 없다. Tailwind CSS로 꾸미는 page는 CRUDUI style을 그 Tailwind build와 theme으로 build할 수 없다. CRUDUI는 고유 stylesheet와 Tailwind 버전을 함께 내고, 설치하는 쪽이 둘 중 하나를 고른다.

| ID | 작업 | Verification | 상태 |
|---|---|---|---|
| C1.1 | 좁은 viewport를 명세한다. 공유 fixture의 모든 block은 viewport 폭 360 CSS pixel과 1280 pixel에서 page의 가로 overflow 없이 렌더되고, 모든 control과 action은 viewport 안에 있다 | `make docs-check` | [o] |
| C1.2 | 공유 fixture에 대한 좁은 viewport browser case를 더하고, `crudui.css`가 overflow하는 곳에서 실패하는지 확인한 뒤 `crudui.css`를 고친다 | browser case, `make docs-check` | [ ] |
| C1.3 | Tailwind 버전을 명세한다. `@crudui/generator-core/crudui.tailwind.css`는 같은 `crudui-*` class를 `@apply`와 같은 `--crudui-*` custom property로 꾸미는 Tailwind CSS 4 source이고, Tailwind build로 compile된다. markup은 바뀌지 않고, compile한 결과는 두 폭에서 공유 fixture의 모든 element에 `crudui.css`와 같은 computed style을 준다 | `make docs-check` | [ ] |
| C1.4 | `crudui.tailwind.css`를 쓰고, 최신 stable Tailwind CSS로 compile해 두 폭에서 computed style을 `crudui.css`와 비교하는 case를 더한다. source가 없을 때 case가 실패하는지 확인한다 | 비교 case | [ ] |
| C1.5 | package export, feature status, operations 문서, changelog, full test suite | full test suite, `make docs-check` | [ ] |
