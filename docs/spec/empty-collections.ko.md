# 빈 반복 컬렉션

[English](empty-collections.md).

`bindForm`은 명시적인 빈 객체에 대해 중첩 컬렉션을 포함한 반복 그룹과 단일
필드에서 행 0개를 생성합니다. 데이터가 없으면 `__0000000000000__` 키를 가진
초기 행 하나를 생성합니다. 값이 있지만 키 기반 객체가 아닌 컬렉션 데이터는
배열과 null을 포함해 `INVALID_FORM_INPUT` 오류와
`Repeated data must be a keyed object: {path}` 메시지로 실패합니다. `{path}`는 행
키를 포함한 전체 데이터 경로입니다. 모든 데이터 형태 거부는
[폼 런타임](form-runtime.ko.md)에서 정의합니다.
빈 컬렉션은 `crudui-node__footer`에, `multiple.controls`가 `outline`이면 구조 맵에
`add-row` 컨트롤(`data-crudui-action="add-row"`) 하나를 출력합니다. 컨트롤은 화면
문구 표의 접근성 레이블을 사용하고 값을 제출하지 않으며, `multiple.max`가 행을
허용하지 않으면 비활성입니다. 공용 브라우저 바인딩이 컨트롤의 컬렉션에 새 행을
삽입합니다. 노드 문법은 [폼 마크업](form-markup.ko.md)에서 정의합니다. `design.show`는 행 개수와 별도로 표시 여부를 결정합니다.
컬렉션을 숨겨도 데이터를 유지하며 숨겨진 행의 이름 있는 컨트롤은 네이티브 제출에
포함합니다.

편집 세션은 [폼 런타임](form-runtime.ko.md)에 정의한 키 기반 객체를 사용하며
명시적인 빈 객체는 행 0개를 생성합니다.
검증과 배포 상태는 [기능 상태](../features.ko.md)에 기록합니다.
