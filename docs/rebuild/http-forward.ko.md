<!-- doc-id: rebuild-http-forward -->
<!-- source-sha256: 8b48192a6e72ec1d97f5268e50c63a83bfa09ea1328306599d20e552eef6dc63 -->
# 재구현 기록: HTTP 전달

[English](http-forward.md)

판정: **맞는 도구 없음**. Form comparison은 Node.js HTTP 및 stream API adapter를 유지한다. 2026-10-26에 평가했다.

## 대상

- `examples/form-comparison/src/forward.mjs`

## 요구 사항

Public server는 선언된 localhost port와 path로 요청을 전달하고 method와 body를 보존하며 target Host header를 설정하고
양방향 연결 전용 header를 제거한다. Upstream 응답 전 오류는 status 502와 server 식별자를 가진 JSON으로 응답한다.
Client가 upload를 중단하면 upstream 요청도 중단한다.

Upstream은 upload 전체를 읽기 전에 413으로 응답할 수 있다. 이 응답 후 adapter는 upload 전달을 중단하고 남은 client
byte를 읽으며 upstream 쓰기가 실패해도 응답을 보존한다. 연결 header는 각 연결에 속하므로 Connection이 지정한 header를
다른 연결로 전달하지 않는다.

## 평가한 도구

| 도구 | 평가 | 결과 |
|---|---|---|
| Node.js `http.request`와 stream `pipe`, `unpipe`, `resume` | 요청 연결 header도 제거한 현재 adapter | 전달 unit case 4개 모두 통과하며 조기 응답 case는 upload 40회를 검사한다 |
| `http-proxy` 1.18.1 | Public `web` API, target path와 host option, 기존 502 응답을 사용하는 최소 adapter | 4개 중 2개 통과. 조기 응답 case는 413 응답 25개, EPIPE 오류 14개, ECONNRESET 오류 1개를 받으며 응답 연결 header assertion도 실패한다 |
| 필수 응답 처리를 추가한 `http-proxy` 1.18.1 | 요청별 proxy 상태, proxyReq와 proxyRes handler, 요청 header 제거, upload unpipe와 drain, 응답 header 제거, 응답 후 오류 처리를 추가한 adapter | 4개 모두 통과하지만 모든 application 규칙을 유지하고 proxy instance와 event 조정을 추가한다 |

비교는 `examples/form-comparison/src/forward.test.mjs`를 사용한다. 조기 응답 40회, 양방향 header 및 path·Host·method·body,
구조화된 502 응답, upload 취소를 검사한다. 최소 adapter의 개수는 이 측정 실행의 결과이며 기대 분포가 아니다.
두 후보는 추적 source 밖에서 실행한다.

## 맞는 도구가 없는 이유

기존 adapter는 설명 주석 8줄을 포함해 41줄이다. 통과하는 package adapter는 그 설명 주석 없이 39줄이며 http-proxy,
eventemitter3, follow-redirects, requires-port package 4개를 설치한다. Package가 조기 응답과 연결 header 규칙을 제공하지
않으므로 도입해도 그 규칙을 유지하고 event 조정을 추가한다. 현재 adapter는 HTTP parsing, framing, streaming과
backpressure를 Node.js에 맡기며 application에 필요한 target과 응답 정책만 구현한다.

## 재시도 조건

관리되는 proxy package의 public API가 조기 응답 upload drain과 연결 header 제거를 제공하거나 application이 선언된
localhost HTTP target 하나 이상의 proxy 기능을 요구할 때 다시 검토한다.
