# CRUDUI JSON Schema
<!-- doc-id: schema-readme -->
<!-- source-sha256: 0005688d7e597e3c4cc73513b0b7940374c893d9e4f089e788e0036d7d0833d0 -->

[English](README.md).

[`crudui.schema.json`](crudui.schema.json)은 JSON Schema draft-07로 폼과 목록
선언 형태를 정의합니다. 루트는 `Field`를 참조하며 `List`는 `#/definitions/List`에
있습니다. 스키마는 소스로 관리합니다.

[`form-template.schema.json`](form-template.schema.json)은 `compileForm`이 쓰는 컴파일된
폼 템플릿의 JSON을 정의합니다. `@polyspec/crudui-generator-core`의 `decodeFormTemplate`이
파싱한 템플릿을 이 스키마로 검사합니다. [폼 런타임](../../docs/spec/form-runtime.ko.md)을
참고합니다.

```bash
make docs-schema
```

명령은 소스와 기대 결과를 변경하지 않고 스키마를 컴파일하고 공유 고정 데이터를
검증합니다. [스키마 검증](../../docs/operations/schema-validation.ko.md)을 참고합니다.

YAML 편집기에서 CRUDUI 선언에 이 스키마를 사용하도록 설정합니다.

```yaml
# yaml-language-server: $schema=../../contracts/schema/crudui.schema.json
type: group
properties:
  email:
    type: email
    validate:
      required: true
      email: true
```

합성과 표현식 평가는 별도 런타임 동작입니다. JSON Schema는 선언 형태를 검사하고
검증기는 해당 선언에 따라 제출 데이터를 검사합니다.
[스키마 계약](../../docs/spec/schema.ko.md)에 정의합니다.
