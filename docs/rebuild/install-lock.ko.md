<!-- doc-id: rebuild-install-lock -->
<!-- source-sha256: eee802fd026258a970fed81123f7ebf1511a7b333e9d12289de57ee0e1112d79 -->
# 재구현 기록: install-lock

[English](install-lock.md)

판정: **맞는 도구 없음**입니다. crudui가 자체 구현을 유지합니다. 2026-10-20에 측정했습니다.

## 대상

- `scripts/install-lock.mts`

## 요구 사항

`npm run test:packages`는 packed package(`file:` tarball)를 자기 project에 `npm ci`로 설치하며, `make install`이 채운 npm cache를
offline으로 씁니다. 그 project의 lock은 root `package-lock.json`에서 얻습니다. 각 registry package는 npm이 dependent의 위치에서
resolve하는 entry이므로 모든 run이 같은 release를 설치하고, install project는 registry에 대해 range를 resolve하지 않습니다.

## 평가한 도구

| 도구 | 상태 | 판정 |
|---|---|---|
| `npm install --package-lock-only` | npm 12 | manifest의 range를 registry에 대해 resolve하므로 release가 root lock과 다를 수 있습니다 |
| root lock을 쓰는 `npm ci` | npm 12 | root workspace를 설치합니다. install project는 root가 다르고 packed tarball을 가집니다 |
| `npm pack` | npm 12 | tarball을 만들며, 그 tarball에 의존하는 project의 lock은 만들지 않습니다 |

## 맞는 도구가 없는 이유

npm에는 root lock의 entry에서 두 번째 project의 lock을 얻는 명령이 없습니다. lock을 쓰는 명령은 registry에 대해 resolve합니다.

## 재시도 조건

npm이 registry 없이 다른 lock에서 lock을 얻게 되면 다시 검토합니다.
