<!-- doc-id: rebuild-build-stamp -->
<!-- source-sha256: 84b244bbf60c1bcaeb8a27f5bd3fb8f989fd485aa0656ee23cd64659c67af287 -->
# 재구현 기록: build-stamp

[English](build-stamp.md)

판정: **맞는 도구 없음**입니다. crudui가 자체 구현을 유지합니다. 2026-10-20에 측정했습니다.

## 대상

- `scripts/require-current-build.mts`
- `scripts/repeat-build.mts`
- `scripts/package-outputs.mts`

## 요구 사항

여러 명령(native generator suite, form suite, package install check, contract test)이 같은 workspace package build를 필요로 합니다.
source와 output의 digest가 working tree와 더는 맞지 않을 때만 build를 실행하므로 한 번의 검증이 package를 한 번만 build합니다.
두 번째 검사는 package를 두 번 build하여, 바이트가 다르거나 한쪽 build에만 없거나 한쪽 build에만 나타나는 모든 output 파일과
함께 실패합니다(reproducible build). 두 검사 모두 같은 run의 output만 읽습니다.

## 평가한 도구

| 도구 | 상태 | 판정 |
|---|---|---|
| make | 설치됨 | 수정 시각으로 판단합니다. checkout이나 복원된 파일은 바이트를 바꾸지 않고 시각을 바꾸는데, 이 검사는 digest를 읽습니다 |
| `tsc --build` (incremental) | 설치됨 | TypeScript project만 압니다. package는 tsup, API Extractor, Vue와 Svelte 도구로 build합니다 |
| Nx, Turborepo | 설치되지 않음 | 각 task의 입력을 hash하여 output을 cache하므로 package 7개 위에 build system을 추가하게 됩니다. 둘 다 두 번 build하여 바이트를 비교하지는 않습니다 |
| diffoscope | 설치되지 않음 | 두 output을 깊이 비교합니다. 아무것도 build하지 않으며 mise 도구 목록에 없습니다 |

## 맞는 도구가 없는 이유

stamp는 서로 다른 도구로 build한 package 7개의 source와 output digest입니다. 쓸 수 있는 도구는 시각으로 판단하거나 저장소 전체에
build system을 추가하며, 같은 tree의 두 build를 비교하는 것은 없습니다.

## 재시도 조건

package를 incremental mode가 있는 하나의 도구로 build하게 되거나 kit이 build stamp를 제공하면 다시 검토합니다.
