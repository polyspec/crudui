<!-- doc-id: rebuild-documentation-web -->
<!-- source-sha256: 82156ccd3dbaae5f101551d33ae2abef47d8b1c1c28513088d638f8873217a73 -->
# 재구현 기록: documentation web

[English](documentation-web.md)

판정: **검토한 release 중 맞는 도구 없음**입니다. CRUDUI는 검사된 Markdown renderer와 documentation server를 유지합니다.
2026-10-26에 검토했습니다.

## 대상

- `scripts/docs-web/build.mts`
- `scripts/docs-web/cli.mts`
- `scripts/docs-web/paths.mts`
- `scripts/docs-web/server.mts`
- `scripts/docs-web/watch.mts`
- `scripts/documentation-links.mts`

## 요구 사항

문서 명령은 Markdown과 생성된 API reference를 빌드하고 local target과 fragment를 검증하며 HTML route와 heading identifier를
유지합니다. 검사된 deployment prefix 아래에서 같은 output을 제공합니다. Build는 잘못된 heading, 없는 repository target,
symbolic link와 생성된 page를 대체하는 public file을 거부합니다. 같은 입력은 같은 output을 만듭니다. Development server는
file-system event를 받고 rebuild 실패를 보고합니다.

Site renderer는 GHSA-gfr2-rv44-r23c의 수정이 있는 Markdown parser를 사용해야 합니다. Root Markdown dependency와 다른 도구의
distribution 안에 내장된 parser는 각각 관리됩니다.

## 평가한 도구

| 도구 | 평가 | 결과 |
|---|---|---|
| VitePress 1.6.4 | npm stable release를 npm으로 설치하고 배포된 Node chunk를 검사했습니다 | 내장 reference parser는 continuation line을 string에 더하고 매번 그 string을 검사합니다. 수정된 label bound와 position 기반 continuation 처리가 없습니다. Root markdown-it package의 update나 override는 이 내장 구현을 대체하지 않습니다. |
| VitePress 2.0.0-alpha.21 | npm next release의 정확한 archive를 검사했습니다 | 배포된 Node chunk에 같은 무제한 reference parser 구현이 있습니다. Prerelease도 이 문제를 해결하지 않습니다. |
| 기존 Markdown renderer | 기존 build, link와 development-server unit test | Root markdown-it package를 직접 import하므로 도구의 distribution을 편집하지 않고 root manifest와 lock에서 검토한 수정 parser를 선택할 수 있습니다. |

VitePress는 필요한 route 규칙, base 설정, navigation, static asset과 development server를 제공합니다. 배포 parser에 보안 수정이
포함되면 적합한 대체 도구입니다. 현재는 내장 parser 때문에 검토한 두 release를 채택할 수 없습니다. VitePress dependency나
부분 전환은 남기지 않습니다.

## 근거

[Security advisory](https://github.com/advisories/GHSA-gfr2-rv44-r23c)는 markdown-it의
`>=14.1.0 <14.3.3`과 `>=15.0.0 <15.0.3`을 영향받는 version으로 명시합니다.
[Parser fix](https://github.com/markdown-it/markdown-it/commit/48fbc46)는 반복 string 누적을 position 기반 처리로 대체하고
reference label 길이를 제한합니다. 검사한 release archive는 `npm pack vitepress@1.6.4`와
`npm pack vitepress@2.0.0-alpha.21`로 받았습니다. 이 근거는 source 비교이며 exploit 시간 측정이나 VitePress site-build 결과를
주장하지 않습니다.

## 재시도 조건

Stable VitePress release가 reference parsing 수정을 포함한 parser를 배포하거나 수정 release를 선택할 수 있는 지원된 parser
dependency를 제공하면 대체를 다시 검토합니다. Renderer를 교체할 때 문서의 route와 입력 거부 test를 유지합니다.
