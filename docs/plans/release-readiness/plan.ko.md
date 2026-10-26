<!-- doc-id: plan-release-readiness -->
<!-- source-sha256: c47a0832ca5787294cf6cb60d1d6c1bd7e456d3d982597d18cfd28130a71c2b7 -->
# 로컬 release candidate 준비

[English](plan.md)

## 준비 순서

[Checklist](checklist.ko.md)는 현재 로컬 candidate를 CI 전에 준비합니다. C18.1은 로컬 통합, source 의존성과 consumer 검증을
완료하는 동안 활성 상태입니다. CI 결과나 별도 허가는 이 작업의 선행 조건이 아닙니다. 준비를 완료하기 전에 완료된 모든 개발
branch를 로컬 `main`에 반영합니다. 준비는 현재 source snapshot과 현재 sibling checkout을 사용하며 tag를 생성하거나 이전
release를 checkout하거나 과거 OrderedJSON archive로 검증하지 않습니다.

## 현재 결정

- C16.8: C18.2가 현재 parser 결정을 완료합니다. 새 stable과 next VitePress distribution에는 영향받는 parser가 남아 있고
  직접 관리하는 현재 markdown-it 15.0.3 parser에는 수정이 있습니다. 이 candidate는 기존 renderer를 유지합니다. Rebuild
  record의 유지보수 검토 조건은 현재 candidate 결정을 미루지 않습니다.
- C16.173: C18.3은 widget-script exception 없이 현재 React와 React DOM을 지원하며 script 실행과 server hydration 검증을
  유지합니다.
- C16.45, C16.170과 C16.171: Native package manager가 현재 로컬 source를 해석합니다. Root Composer 선언과 lock은 현재
  sibling package를 선택하며 중복 archive compatibility profile은 로컬 준비에 포함하지 않습니다.
- C16.169: 현재 advisory 검토로 적용할 finding을 판단합니다. 철회된 advisory는 version bump를 요구하지 않으며 현재 의존성
  graph의 보안 검증을 면제하지도 않습니다.
- C18.4는 현재 npm 의존성과 지원하는 Svelte peer를 준비합니다. C18.5는 version 0.0.8 선언과 native lock을 정렬합니다.
  C18.6은 PHP source-only helper test와 extension runtime test를 분리합니다.

## 수용한 결정

C16.13은 C16.13-1이 구현합니다. C16.29-1은 forwarding을 수정하고 현재 adapter를 유지하는 application 요구사항을
기록합니다. C16.65는 부적절한 용어 제한을 제거합니다. C16.172는 다른 저장소의 정확한 선언과 일치시키지 않고 Composer가
제약을 선택하게 합니다. 이 결정은 현재 source 의존성, package와 consumer 검사를 제거하지 않습니다.

## 완료

준비한 source commit, 검토일, 평가한 version, native package-manager 결과와 consumer 결과를 기록합니다. 로컬 candidate
artifact가 필요하면 현재 병합된 source snapshot에서 만들고 같은 실행에서 만든 artifact만 소비합니다. 남은 로컬 수정은
소유 검사로 검증하고 완료된 모든 개발 branch를 로컬 `main`에 반영합니다. C18.1은 이 준비와 로컬 검증이 끝나야 완료됩니다.

CI 성공은 이후 publication의 조건이며 로컬 준비를 우회 상태로 남길 이유가 아닙니다. 이후 변경은 해당 소유 검증과 결과
commit의 publication 검사를 필요로 합니다. 향후 유지보수 검토 조건과 이 candidate에서 완료한 결정은 구분합니다.
