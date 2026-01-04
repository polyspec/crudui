# 필드 키 패턴 문서

폼 시스템에서 사용되는 복잡한 필드 키 패턴에 대한 문서입니다.

## 개요

`__{13}__` 패턴은 다음 용도로 사용됩니다:

1. 배열 아이템의 고유 식별
2. 폼 데이터와 스펙 필드 매칭
3. 정렬 가능한 배열에서 순서 보존

## 키 패턴 종류

| 패턴 | 설명 | 예시 |
|------|------|------|
| `field` | 단순 필드 | `username` |
| `field[]` | 배열 필드 (인덱스 없음) | `tags[]` |
| `field[0]` | 인덱스 배열 | `items[0]`, `items[1]` |
| `field[__abc123def45__]` | 고유 키 배열 (13자 랜덤 ID) | `files[__a1b2c3d4e5f6g__]` |
| `group[__key__][subfield]` | 고유 키를 가진 중첩 필드 | `users[__xyz789__][name]` |

## 1. 고유 키가 필요한 이유

### 문제점: 인덱스 기반 배열의 한계

인덱스 기반 배열(`field[0]`, `field[1]`)은 다음 상황에서 문제가 발생합니다:

```
초기 상태:
items[0] = "첫번째"
items[1] = "두번째"
items[2] = "세번째"

items[1] 삭제 후:
items[0] = "첫번째"
items[1] = "세번째"  ← 인덱스가 변경됨!
```

이로 인해:
- React의 컴포넌트 재사용이 비효율적
- 드래그 앤 드롭 정렬 시 상태 불일치
- 유효성 검증 에러 매핑 오류

### 해결책: 고유 키 사용

```
초기 상태:
items[__abc123__] = "첫번째"
items[__def456__] = "두번째"
items[__ghi789__] = "세번째"

items[__def456__] 삭제 후:
items[__abc123__] = "첫번째"
items[__ghi789__] = "세번째"  ← 키가 유지됨!
```

## 2. 키 생성 알고리즘

### 13자 랜덤 ID 생성

```javascript
function generateUniqueKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let i = 0; i < 13; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `__${key}__`;
}
```

### 키 형식 규칙

- 전체 길이: 17자 (`__` + 13자 + `__`)
- 허용 문자: 영문 소문자 (a-z), 숫자 (0-9)
- 접두사/접미사: 이중 언더스코어 (`__`)

### 키 추출 정규식

```javascript
const KEY_PATTERN = /__([a-z0-9]{13})__/g;

// 예시
const fieldName = 'users[__abc123def45gh__][email]';
const matches = fieldName.match(KEY_PATTERN);
// 결과: ['__abc123def45gh__']
```

## 3. 유효성 검증 시 키 매칭

### 스펙 필드와 데이터 매칭

스펙에서 정의된 필드 패턴과 실제 데이터의 키를 매칭하는 과정입니다.

```javascript
// 스펙 정의
{
  name: 'contacts',
  multiple: true,
  fields: [
    { name: 'email', type: 'email' },
    { name: 'phone', type: 'tel' }
  ]
}

// 실제 폼 데이터
{
  'contacts[__abc123def45gh__][email]': 'user@example.com',
  'contacts[__abc123def45gh__][phone]': '010-1234-5678',
  'contacts[__xyz789012345__][email]': 'other@example.com',
  'contacts[__xyz789012345__][phone]': '010-8765-4321'
}
```

### 매칭 알고리즘

```javascript
function matchFieldToSpec(fieldName, specName) {
  // 고유 키를 와일드카드로 변환
  const normalizedField = fieldName.replace(/__[a-z0-9]{13}__/g, '*');
  const normalizedSpec = specName.replace(/\[\]/g, '[*]');

  return normalizedField === normalizedSpec;
}

// 예시
matchFieldToSpec('users[__abc123def45gh__][name]', 'users[][name]');
// 결과: true
```

### 에러 메시지 매핑

```javascript
// 서버 유효성 검증 에러
const errors = {
  'contacts[0][email]': '유효하지 않은 이메일입니다.'
};

// 클라이언트 키로 변환
function mapErrorToClientKey(serverKey, clientKeys) {
  const pattern = serverKey.replace(/\[(\d+)\]/g, '[__[a-z0-9]{13}__]');
  const regex = new RegExp(pattern);

  return clientKeys.find(key => regex.test(key));
}
```

## 4. 정렬 가능/다중 필드에서의 동작

### sortable 옵션과 고유 키

`sortable: true` 설정 시 드래그 앤 드롭으로 순서를 변경할 수 있습니다.

```javascript
// 스펙 정의
{
  name: 'gallery',
  type: 'file',
  multiple: true,
  sortable: true
}

// 정렬 전
{
  'gallery[__aaa__]': { order: 0, file: 'img1.jpg' },
  'gallery[__bbb__]': { order: 1, file: 'img2.jpg' },
  'gallery[__ccc__]': { order: 2, file: 'img3.jpg' }
}

// 드래그로 __ccc__를 맨 앞으로 이동
{
  'gallery[__ccc__]': { order: 0, file: 'img3.jpg' },  // 키 유지, 순서만 변경
  'gallery[__aaa__]': { order: 1, file: 'img1.jpg' },
  'gallery[__bbb__]': { order: 2, file: 'img2.jpg' }
}
```

### multiple 옵션과 키 관리

```javascript
// 아이템 추가
function addItem(items) {
  const newKey = generateUniqueKey();
  return {
    ...items,
    [newKey]: { value: '', order: Object.keys(items).length }
  };
}

// 아이템 삭제
function removeItem(items, keyToRemove) {
  const { [keyToRemove]: removed, ...rest } = items;
  // 순서 재계산
  return reorderItems(rest);
}

// 순서 재계산
function reorderItems(items) {
  const sorted = Object.entries(items)
    .sort(([, a], [, b]) => a.order - b.order);

  return Object.fromEntries(
    sorted.map(([key, value], index) => [key, { ...value, order: index }])
  );
}
```

### 서버 제출 시 키 처리

```javascript
// 클라이언트 데이터 (고유 키 포함)
const clientData = {
  'items[__abc123__]': 'A',
  'items[__def456__]': 'B',
  'items[__ghi789__]': 'C'
};

// 서버 전송용 변환 (인덱스 기반)
function convertToServerFormat(data) {
  const result = {};
  const grouped = {};

  for (const [key, value] of Object.entries(data)) {
    const baseKey = key.replace(/__[a-z0-9]{13}__/, '');
    if (!grouped[baseKey]) grouped[baseKey] = [];
    grouped[baseKey].push(value);
  }

  for (const [key, values] of Object.entries(grouped)) {
    values.forEach((value, index) => {
      result[key.replace('[]', `[${index}]`)] = value;
    });
  }

  return result;
}

// 결과
{
  'items[0]': 'A',
  'items[1]': 'B',
  'items[2]': 'C'
}
```

## 5. 조건 표현식에서의 키 해석

### 조건부 필드 표시

```javascript
// 스펙 정의
{
  name: 'address',
  multiple: true,
  fields: [
    { name: 'type', type: 'select', options: ['home', 'work', 'other'] },
    {
      name: 'description',
      type: 'text',
      condition: 'type === "other"'  // 같은 그룹 내 필드 참조
    }
  ]
}
```

### 컨텍스트 기반 키 해석

조건 표현식에서 필드를 참조할 때, 현재 컨텍스트의 고유 키를 사용하여 해석합니다.

```javascript
function resolveCondition(condition, currentKey, formData) {
  // 현재 아이템의 키 추출
  const keyMatch = currentKey.match(/__[a-z0-9]{13}__/);
  const itemKey = keyMatch ? keyMatch[0] : null;

  // 조건에서 참조하는 필드명 추출
  const fieldRefs = condition.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g);

  // 컨텍스트에 맞는 값으로 치환
  let resolvedCondition = condition;
  for (const fieldRef of fieldRefs) {
    const fullKey = itemKey
      ? `${getParentPath(currentKey)}[${itemKey}][${fieldRef}]`
      : fieldRef;
    const value = formData[fullKey];
    resolvedCondition = resolvedCondition.replace(
      new RegExp(`\\b${fieldRef}\\b`),
      JSON.stringify(value)
    );
  }

  return eval(resolvedCondition);
}
```

### 중첩 그룹에서의 조건 해석

```javascript
// 스펙 정의
{
  name: 'orders',
  multiple: true,
  fields: [
    {
      name: 'items',
      multiple: true,
      fields: [
        { name: 'quantity', type: 'number' },
        {
          name: 'bulk_discount',
          type: 'checkbox',
          condition: 'quantity >= 10'  // 같은 items 그룹 내의 quantity 참조
        }
      ]
    }
  ]
}

// 폼 데이터
{
  'orders[__order1__][items][__item1__][quantity]': 5,
  'orders[__order1__][items][__item1__][bulk_discount]': false,
  'orders[__order1__][items][__item2__][quantity]': 15,
  'orders[__order1__][items][__item2__][bulk_discount]': true  // quantity >= 10 이므로 표시
}
```

### 상위 컨텍스트 참조

```javascript
// 상위 그룹의 필드를 참조하는 경우
{
  name: 'company',
  fields: [
    { name: 'has_branches', type: 'checkbox' },
    {
      name: 'branches',
      multiple: true,
      condition: '$parent.has_branches === true',  // 상위 필드 참조
      fields: [
        { name: 'name', type: 'text' },
        { name: 'address', type: 'text' }
      ]
    }
  ]
}
```

```javascript
function resolveParentReference(condition, currentKey, formData) {
  // $parent 접두사 처리
  const parentPattern = /\$parent\.([a-zA-Z_][a-zA-Z0-9_]*)/g;

  return condition.replace(parentPattern, (match, fieldName) => {
    const parentPath = getParentPath(currentKey, 2);  // 2단계 상위
    const parentKey = `${parentPath}[${fieldName}]`;
    const value = formData[parentKey];
    return JSON.stringify(value);
  });
}
```

## 부록: 유틸리티 함수

### 키 관련 헬퍼 함수

```javascript
// 고유 키 여부 확인
function isUniqueKey(key) {
  return /__[a-z0-9]{13}__/.test(key);
}

// 필드 경로에서 고유 키들 추출
function extractUniqueKeys(fieldPath) {
  const matches = fieldPath.match(/__[a-z0-9]{13}__/g);
  return matches || [];
}

// 고유 키를 인덱스로 변환
function uniqueKeysToIndices(fieldPath, keyToIndexMap) {
  return fieldPath.replace(/__[a-z0-9]{13}__/g, (key) => {
    return keyToIndexMap[key] ?? key;
  });
}

// 부모 경로 추출
function getParentPath(fieldPath, levels = 1) {
  const parts = fieldPath.split(/\[(?=[^\]]*\])/);
  return parts.slice(0, -levels).join('[');
}

// 필드명에서 베이스 이름 추출
function getBaseName(fieldPath) {
  return fieldPath.replace(/\[.*\]/g, '');
}
```

## 참고 사항

- 고유 키는 세션 동안에만 유효하며, 서버 저장 시 인덱스 기반으로 변환됩니다.
- 키 충돌 확률은 36^13 (약 1.7 × 10^20) 분의 1로 실질적으로 무시할 수 있습니다.
- React 컴포넌트의 `key` prop으로 고유 키를 직접 사용하여 최적의 렌더링 성능을 얻을 수 있습니다.
