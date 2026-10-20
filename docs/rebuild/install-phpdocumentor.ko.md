<!-- doc-id: rebuild-install-phpdocumentor -->
<!-- source-sha256: 10a255a39e4bcf2d2503779768551aeef00a5c1235f21856ac2e6757dd05f74e -->
# 재구현 기록: install-phpdocumentor

[English](install-phpdocumentor.md)

판정: **맞는 도구 없음**입니다. crudui가 자체 구현을 유지합니다. 2026-10-20에 측정했습니다.

## 대상

- `scripts/install-phpdocumentor.mts`

## 요구 사항

`scripts/gen-api-docs.mts`는 pin한 phpDocumentor release를 실행합니다. 이 도구는 release asset의 SHA-256과 함께
`var/tools/phpdocumentor`에 설치되므로 모든 run이 같은 release로 문서를 만듭니다.

## 평가한 도구

| 도구 | 상태 | 판정 |
|---|---|---|
| mise | 2026.10.8 | `mise registry`에는 `php`만 있고 phpDocumentor나 Phive entry가 없습니다(`mise registry`를 `php`, `phive`, `phpdoc`로 걸러 봄) |
| `composer require phpdocumentor/phpdocumentor` | composer 2.10.3 | 빈 project에서 `--dry-run`으로 측정했습니다. 모든 version이 security advisory로 차단된 release(symfony/validator ~2.2, league/commonmark ^1.5, league/flysystem ^1.0)에 의존하므로 설치 가능한 version이 없습니다 |
| Phive | 설치되지 않음 | mise registry에 없으므로 toolchain에 없습니다 |

## 맞는 도구가 없는 이유

toolchain은 phpDocumentor를 설치하지 않고, Composer는 저장소의 advisory 차단을 끄지 않고는 설치하지 못합니다. digest를 검사한
release phar가 남은 유일한 지원 방법입니다.

## 재시도 조건

mise가 phpDocumentor를 제공하거나 phpDocumentor release가 advisory 정책 아래 Composer로 설치되면 다시 검토합니다.
