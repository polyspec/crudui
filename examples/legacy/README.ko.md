# 레거시 예제

[English](README.md).

이 예제는 레거시 명세와 명시적인 레거시 라이브러리 진입점을 사용합니다.
[현재 예제](../README.ko.md)와 분리되어 있습니다.

- `demo-app`, `playground`, `limepie-bootstrap`: React 애플리케이션.
- `node-api`, `php-api`, `go-api`, `rust-api`: 레거시 검증 API.
- `shared-specs`: 공통 레거시 명세.
- `limepie-original`, `limepie-compare`, `limepie-validate-test`: 레거시 렌더링 검사.
- `*-usage.*`, `basic-form.yml`, `complex-form.yml`: 레거시 사용 예제.

`docker-compose.yml`은 레거시 서비스를 정의합니다. 빌드 컨텍스트는 저장소
루트입니다. 외부 소스 입력은 경로를 명시해야 합니다. 이 파일은 현재 폼 비교
환경을 정의하지 않습니다.
