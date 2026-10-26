<!-- doc-id: plan-release-readiness -->
<!-- source-sha256: 1dc698a8dd186f21d81c91df4febe1992ed8d0c227781e3c42ef31d767405097 -->
# Release candidate 재검토

[English](plan.md)

## 의존성과 실행 시점

[Checklist](checklist.ko.md)는 candidate commit의 `ci-passed`와 `push-gate`가 성공한 뒤 publication 전에 활성화한다.
C18.1은 이 의존성이 충족될 때까지 우회 상태다. 개발 검토는 이 단계를 완료하지 않는다.
Maintainer가 `TAG`로 candidate tag를 제공하며 이 plan은 tag를 만들지 않는다.

## 조건부 결정

- C16.8: 현재 stable VitePress distribution을 조회하고 내장 parser와 보안 수정을 비교한다. 적합한 수정 distribution을
  채택하거나 rebuild record에 현재 근거를 기록하고 renderer를 유지한다.
- C16.173: C18.3은 widget-script exception 없이 React와 React DOM 19.3.1을 지원한다. Candidate 검증은 의존성
  version이 바뀌면 script 실행과 server hydration 검사를 유지한다.
- C16.45, C16.170과 C16.171: 개발 링크 없이 추적 의존성 선언과 candidate archive를 검증한다. 의존성 관리자가 published
  version을 해석하고 consumer smoke 명령이 통과해야 한다.
- C16.169: Advisory data를 갱신한다. 철회된 advisory는 update를 요구하지 않지만 candidate의 새 보안 finding 검사를
  면제하지 않는다.

## 수용한 결정

C16.13은 C16.13-1이 구현한다. C16.29-1은 forwarding을 수정하고 현재 adapter 유지 근거를 기록하며 rebuild record는 도구
비교가 달라지는 조건을 설명한다. C16.65는 부적절한 용어 제한을 제거한다. C16.172는 다른 저장소의 정확한 PHPUnit 제약과
일치를 요구하지 않으며 Composer가 선언한 제약 내에서 선택한다. 이 결정은 candidate 의존성과 archive 검사를 제거하지 않는다.

## 완료

같은 실행에서 `make release-assets TAG="$TAG"`로 candidate archive를 만들고 `make release-consumer TAG="$TAG"`를 실행한다.
Consumer 검증은 이전 실행의 archive를 읽지 않는다. Publication tag의 workflow는 proof 뒤 자동 공개하므로 해당 tag를
push하기 전에 C18.1을 완료한다.

Candidate commit, 검토일, 평가한 version, 유지한 결정과 consumer 결과를 기록한다. 실행 가능한 변경은 publication 전에
소유 검사와 함께 구현한다. Candidate가 바뀌면 해당 commit의 필수 CI 결과를 확보한다. 선택적 대체를 계속 막는 조건은 현재
근거와 새 재검토 조건을 기록하며 이전에 철회했다는 이유만으로 영구 결정이라고 설명하지 않는다.
