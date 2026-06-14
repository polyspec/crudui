//! v2 정규 모델 — `FieldSpec` 및 부속 타입(serde `Deserialize`/`Serialize`).
//!
//! 단일 진실은 SPEC-V2.md(헌법) + 정규 모델 JSON이다. 이 모듈은 그 모델을
//! 기계화한다 — top-level 키, 역할 슬롯(validate/design/behavior/options),
//! 종속 격리 버킷(type→options, multiple/lang/items→그 키 하위), design 노드맵,
//! 조건맵(기본키 true), 합성($ref/$patch)을 Rust 타입으로 고정한다.
//!
//! 이건 v2 신규다. v1(`crate::types`)은 안정 확보까지 병행 유지하며 건드리지
//! 않는다(SPEC-V2 R7). v2 소비자는 이 모듈만 본다.
//!
//! ## 강제(스키마 = 타입)
//! - top-level `deny_unknown_fields`: 정규 v2 키만 1급이다. 그 외 모든 키는
//!   거부된다(additionalProperties:false). 정규 v2 키만 인식키로 등재한다 —
//!   레거시 이름(`multiple_max`/`lang:append`/`sortable*` 등)과 매직 토큰
//!   (`*`/`:`)은 인식키가 아니다. 레거시는 번역기용 absorbs_legacy 참조일 뿐
//!   이며(R2 이중화·R4 매직토큰 금지), 인식키와 섞지 않는다.
//! - 금지 메타키 전역 차단: 정규 모델 `forbidden_meta_keys`
//!   (`display_switch`/`display_target`/`if`/`when`/`show_if`/`_`/`seqtokey`/
//!   `__13hex__`/`$after`/`$before`/`$merge`/`$remove`/`xclass`/`xstyle`/
//!   `x{key}`)는 최상위뿐 아니라 **열린 버킷(options 등) 본문 한 칸 아래에서도**
//!   거부된다. 열린 버킷은 `additionalProperties:true` 가 아니라
//!   `propertyNames:{not:{enum:[...금지...]}}` 의미론을 따른다 — 확장은 허용
//!   하되 금지키만 전역 차단. `ExtraMap`(플래튼 흡수 슬롯)이 역직렬화 시
//!   금지키를 만나면 에러를 낸다.
//! - 역할 슬롯·구조 차원은 다형이다: `false`(끔) | `{객체}`(설정) | `true`
//!   (기본, `{}`의 축약) — `Polymorphic<T>` 로 인코딩.
//! - 종속 키는 1급이 아니라 대상 하위로 격리한다(SPEC-V2 §3 C).
//!
//! ## `x{key}`(주석) 처리
//! `x` 로 시작하는 임의 주석 키(`x{key}`)는 메타스키마 계층이 canonical 스펙을
//! 검증하기 **전에** x-strip 한다는 전제다. 이 모델(=canonical 검증기)에 도달한
//! 시점에는 주석이 이미 제거됐어야 하므로, 남아 있으면 거부한다(이유: canonical
//! 단계에서는 주석이 존재할 수 없음). `xclass`/`xstyle` 는 명시 금지키로도 등재.
//!
//! ## round-trip
//! 4언어가 같은 v2 JSON을 파싱→재직렬화해 동일해야 한다. 선언 순서는
//! `serde_json` `preserve_order`(맵/조건맵/properties) 로 보존하고, 다형 슬롯·
//! 구조키(false|{}|true)는 `Polymorphic<T>`(untagged)로 역직렬화까지 왕복한다.
//! Marshal-only 반쪽 구현 금지 — `Serialize`+`Deserialize` 양방향. 인접
//! 테스트가 round-trip 동치를 강제한다.

use serde::de::{self, Deserializer, MapAccess, Visitor};
use serde::ser::{SerializeMap, Serializer};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fmt;

/// 금지 메타키(정규 모델 `forbidden_meta_keys`). 최상위 + 열린 버킷 본문 한 칸
/// 아래에서 전역 차단한다. `x{key}`(주석)는 접두사 규칙으로 별도 검사한다.
pub const FORBIDDEN_META_KEYS: &[&str] = &[
    "display_switch",
    "display_target",
    "if",
    "when",
    "show_if",
    "_",
    "seqtokey",
    "__13hex__",
    "$after",
    "$before",
    "$merge",
    "$remove",
    "xclass",
    "xstyle",
];

/// 키가 전역 금지 대상이면 true. 명시 금지키이거나 `x{key}` 주석 접두사
/// (단, 정규 v2 키 자체는 제외 — 현재 정규 키 중 `x` 시작은 없다).
fn is_forbidden_key(key: &str) -> bool {
    if FORBIDDEN_META_KEYS.contains(&key) {
        return true;
    }
    // x{key} 주석: canonical 단계엔 존재 불가(x-strip 전제). 남아 있으면 거부.
    // 정규 v2 키에 `x` 시작 키가 없으므로 접두사만으로 안전하게 판별한다.
    key.len() > 1 && key.starts_with('x')
}

/// 다형 슬롯/차원: `false`(끔/없음) | `{객체}`(설정) | `true`(기본, `{}`의 축약).
///
/// SPEC-V2 §2 G2 — 역할 슬롯(validate/design/behavior/options)과 구조 차원
/// (multiple/lang)이 모두 이 세 모양을 취한다. `behavior: false` 로 합성 상속을
/// 무효화한다. `untagged` 로 역직렬화·직렬화 양방향 왕복.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Polymorphic<T> {
    /// `false`(끔) 또는 `true`(`{}` 축약). 부울 한 토큰.
    Toggle(bool),
    /// `{객체}` — 명시 설정.
    Config(T),
}

/// 조건맵: 선언 순서 맵 `{ <표현식 키>: <값>, ..., true: <기본값> }`.
///
/// 정규 모델 `condition_map` — 키(조건식)를 선언 순서대로 평가해 첫 truthy의 값을
/// 반환한다. 아무것도 안 맞으면 `true` 키(있으면)의 값, 없으면 null. 기본키는 항상
/// 참인 리터럴 `true`(R4 위반인 `_` 같은 관례 기호 금지). 각 키는
/// EXPRESSION-GRAMMAR §2 표현식이며, 조건맵은 엔진을 반복 호출하는 얇은 래퍼다.
/// 선언 순서는 serde_json `preserve_order` 로 보존된다(`DEFAULT_KEY` = `"true"`).
pub type ConditionMap = Map<String, Value>;

/// 조건맵 기본키. 항상 참인 리터럴 `true` — 매직 기호(`_`) 금지(R4).
pub const DEFAULT_KEY: &str = "true";

/// 평가되는 값: 단일 표현식(문자열/리터럴) | 조건맵 | 정적 값.
///
/// SPEC-V2 §2 G1 — 모든 평가값은 표현식 또는 조건맵이다. 별도 `if`/`when`/
/// `show_if` 키는 없다. 단일 표현식 `"...?...:..."` 은 조건맵의 축약(동일 의미론).
/// 평가는 EXPRESSION-GRAMMAR 엔진이 수행하고, 이 타입은 입력 형태만 고정한다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ConditionValue {
    /// 다분기: 선언 순서 조건맵(`true` 기본키).
    Map(ConditionMap),
    /// 단순: 표현식 문자열 또는 부울/숫자/널 리터럴(임의 정적 값 포함).
    Single(Value),
}

/// 콘텐츠(label/description/help/placeholder…): 단일 문자열 | 언어맵.
///
/// SPEC-V2 §2 G3 — 콘텐츠 번역. 언어별이면 언어맵 `{ ko: …, en: … }`(스펙
/// 작성자의 번역). 입력 다국어(필드 값이 언어별)는 별도 축이며 `lang` 슬롯이다.
/// 빈 콘텐츠는 생략하거나 `null` — `null` 은 없는 것과 동일하므로 `Option<Content>`
/// 의 `None`(필드 부재)으로 역직렬화되어 렌더·검증에 무영향이다(G3). 언어맵의 빈
/// 슬롯도 `null` 허용(`Value::Null`) — 표시·검증에 무관한 빈 라벨.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Content {
    /// 단일 언어 문자열.
    Text(String),
    /// 언어맵 `{ ko: …, en: … }`(G3 콘텐츠 번역). 빈 슬롯은 `Value::Null` 허용.
    Lang(Map<String, Value>),
}

/// 열린 버킷의 흡수 맵 — 명시 sub_keys 외 확장 키를 선언 순서로 담는다.
///
/// 열린 버킷(options 등)은 `additionalProperties:true` 가 아니라
/// `propertyNames:{not:{enum:[...금지...]}}` 의미론을 따른다(SPEC 엄수): 확장은
/// 허용하되 금지 메타키(`forbidden_meta_keys` + `x{key}`)는 한 칸 아래에서도
/// 거부한다. `#[serde(flatten)]` 으로 슬롯·버킷의 잔여 키를 흡수하며, 역직렬화 시
/// 금지키를 만나면 즉시 에러를 낸다(반쪽 게이트 금지 — 전역 차단).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ExtraMap(pub Map<String, Value>);

impl ExtraMap {
    /// 내부 맵 참조.
    pub fn as_map(&self) -> &Map<String, Value> {
        &self.0
    }
}

impl<'de> Deserialize<'de> for ExtraMap {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct ExtraVisitor;

        impl<'de> Visitor<'de> for ExtraVisitor {
            type Value = ExtraMap;

            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("a map of extension keys (no forbidden meta keys)")
            }

            fn visit_map<M>(self, mut access: M) -> Result<ExtraMap, M::Error>
            where
                M: MapAccess<'de>,
            {
                let mut out = Map::new();
                while let Some(key) = access.next_key::<String>()? {
                    if is_forbidden_key(&key) {
                        return Err(de::Error::custom(format!(
                            "forbidden meta key '{key}' rejected in open bucket (propertyNames not-enum)"
                        )));
                    }
                    let value: Value = access.next_value()?;
                    out.insert(key, value);
                }
                Ok(ExtraMap(out))
            }
        }

        deserializer.deserialize_map(ExtraVisitor)
    }
}

impl Serialize for ExtraMap {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (k, v) in &self.0 {
            map.serialize_entry(k, v)?;
        }
        map.end()
    }
}

/// v2 정규 필드 모델.
///
/// top-level 키만 1급이다(SPEC-V2 §3 B): 구조·정체성 + 콘텐츠 + 역할 슬롯.
/// 1급 자격 없는 세부는 전부 대상 하위로 격리한다(§3 C). `$ref`/`$patch` 는
/// 합성 진입점이며 파서가 가장 먼저 펼친다(§5).
///
/// `deny_unknown_fields` 가 정규 v2 키 외의 모든 최상위 키(금지 메타키·레거시
/// 이름·매직 토큰·`x{key}` 주석)를 거부한다.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FieldSpec {
    // ---- 합성 (SPEC-V2 §5, 파서가 가장 먼저 펼침) ----
    /// `$ref` — 베이스 상속(파일/경로). 미해결 `$ref` 는 로드 불가.
    #[serde(rename = "$ref", default, skip_serializing_if = "Option::is_none")]
    pub ref_: Option<Value>,

    /// `$patch` — 변경(add/remove/replace, JSON Patch식). 깊은 경로 설정 지원
    /// (예: `"field.validate.required": ".other"`).
    #[serde(rename = "$patch", default, skip_serializing_if = "Option::is_none")]
    pub patch: Option<Value>,

    // ---- 구조·정체성 (top-level) ----
    /// 정체성 — 필드 타입(email/group/multiple 등). `options` 슬롯의 정의 주체.
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub field_type: Option<String>,

    /// 구조/식별 — 필드 이름(직렬화 키). 명시적·의미적(R4).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// 구조 — 기본값(경로 미해결 시 평가기가 참조, EXPRESSION-GRAMMAR §5 Path).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<Value>,

    /// 구조 — 자식 필드 맵(group/오브젝트). `$ref`/`$patch` 합성 진입점이 여기서
    /// 펼쳐진다. 선언 순서는 preserve_order 로 보존된다.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub properties: Option<Map<String, Value>>,

    /// 구조 — 선택지 소스. 정적 배열 | 동적 `{model,method,table,relations}`.
    /// 종속 격리 버킷이자 1급(SPEC-V2 §3 C 동적 선택지 소스).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub items: Option<Items>,

    /// 구조 — 반복 행(`true`=인덱스 배열+숨긴 id, G4). 종속 격리 버킷이자 1급.
    /// 다형: `false` | `{multiple 종속 키}` | `true`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multiple: Option<Polymorphic<MultipleSpec>>,

    /// 구조 — 입력 다국어 차원(필드 값이 언어별, G3). 종속 격리 버킷이자 1급.
    /// 다형: `false` | `{lang 종속 키}` | `true`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lang: Option<Polymorphic<LangSpec>>,

    // ---- 콘텐츠 (top-level) ----
    /// 콘텐츠 — 필드 라벨(다국어 시 언어맵, G3). 수식 대상 곁이라 최상위.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<Content>,

    /// 콘텐츠 — 설명(다국어 가능).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<Content>,

    /// 콘텐츠 — 자리표시(다국어 가능).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<Content>,

    /// 콘텐츠 — 입력 앞 텍스트(텍스트 자체. design.prepend 노드 외형과 구분).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prepend: Option<Content>,

    /// 콘텐츠 — 입력 뒤 텍스트.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub append: Option<Content>,

    /// 콘텐츠 — 도움말(다국어 가능).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub help: Option<Content>,

    // ---- 역할 슬롯 (top-level, 다형) ----
    /// 역할 슬롯 — 검증(SPEC-V2 §3 공통 역할 분배). 값은 표현식/조건맵일 수 있어
    /// 조건부 검증을 별도 키 없이 표현(예: `required: ".subscribe"`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub validate: Option<Polymorphic<ValidateSlot>>,

    /// 역할 슬롯 — 보임새 = 표시(show) + DOM 노드별 외형 맵.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub design: Option<Polymorphic<DesignSlot>>,

    /// 역할 슬롯 — 동작(불투명 스크립트, 표현식 엔진 미경유). `false` 로 합성 상속
    /// 무효화.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub behavior: Option<Polymorphic<BehaviorSlot>>,

    /// 역할 슬롯 — 타입 종속(그 타입이 정의·검증, 코어 불관여).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<Polymorphic<OptionsSlot>>,
}

// ============================================================================
// 역할 슬롯 (SPEC-V2 §3 공통 역할 분배) — 모두 다형 sub_keys.
// 슬롯은 다형이라 명시 안 한 키도 허용해야 한다(미래 위젯·미흡수 키). 슬롯 본문은
// deny_unknown_fields 를 걸지 않고 명시 sub_keys 만 1급화하며 나머지는 ExtraMap
// 으로 흡수한다 — ExtraMap 이 금지 메타키를 한 칸 아래에서도 전역 차단한다.
// ============================================================================

/// `validate` 슬롯 — 검증 규칙. 값은 표현식/조건맵일 수 있어 조건부 검증을 별도
/// 키 없이 표현한다(다형, SPEC-V2 §3). sub_keys 외 규칙은 `extra` 로 흡수.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct ValidateSlot {
    /// 필수. 표현식이면 조건부 필수(예: `".subscribe"`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<ConditionValue>,
    /// 이메일 형식.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<ConditionValue>,
    /// 일치 대상(경로/표현식).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r#match: Option<ConditionValue>,
    /// 명시 sub_keys 외 검증 규칙(다형 흡수, 금지키 전역 차단).
    #[serde(flatten)]
    pub extra: ExtraMap,
}

/// `design` 슬롯 — 보임새 = 표시 조건(show) + DOM 노드별 외형 맵.
///
/// 어느 노드 스타일인지 키로 드러난다(R8). 레거시 `element_class`/`label_class`/
/// `group_class`/`input_class`/`wrapper_class`/`prepend_class` 를 흡수.
/// 노드맵: show/class/style/label/wrapper/group/prepend(정규 모델 `design_node_map`).
/// 명시 노드맵 외 확장 노드는 `extra` 로 흡수(금지키 전역 차단).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct DesignSlot {
    /// 표시 조건(표현식/조건맵). 노드가 아니라 표시 여부.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub show: Option<ConditionValue>,
    /// 주 노드(입력) class(표현식/조건맵).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub class: Option<ConditionValue>,
    /// 주 노드(입력) style(표현식/조건맵).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<ConditionValue>,
    /// label 노드 외형(class/style).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<DesignNode>,
    /// wrapper 노드 외형(class/style).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrapper: Option<DesignNode>,
    /// group 노드 외형(class/style).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<DesignNode>,
    /// prepend 노드 외형(class/style).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prepend: Option<DesignNode>,
    /// 명시 노드맵 외 확장(다형 흡수, 금지키 전역 차단).
    #[serde(flatten)]
    pub extra: ExtraMap,
}

/// DOM 노드별 외형(class/style). design 노드맵의 비주(非主) 노드 항목.
///
/// class/style 외 키도 silent drop 하지 않고 `extra` 로 흡수해 round-trip 을 보존
/// 한다(R1: 타입은 보존, 차단은 재귀 forbidden-scan 이 담당). `ExtraMap` 은 다른
/// 슬롯·버킷과 동일하게 한 칸 아래 금지 메타키를 역직렬화 시 차단하되, class/style
/// 외 정상 확장 키(text 등)는 보존한다.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct DesignNode {
    /// 노드 class(표현식/조건맵).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub class: Option<ConditionValue>,
    /// 노드 style(표현식/조건맵).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<ConditionValue>,
    /// class/style 외 노드 키(흡수 — round-trip 보존, 금지키 전역 차단).
    #[serde(flatten)]
    pub extra: ExtraMap,
}

/// `behavior` 슬롯 — 모든 타입 공통 동작 스크립트. 불투명 클라 JS로 전달되며
/// 표현식 엔진을 거치지 않는다(SPEC-V2 §4). `false` 로 합성 상속 무효화. 동작
/// 라벨은 `behavior.{action}.label`. sub_keys 외 동작은 `extra` 로 흡수.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct BehaviorSlot {
    /// 변경 시 스크립트(불투명).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub onchange: Option<Value>,
    /// 클릭 시 스크립트(불투명).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub onclick: Option<Value>,
    /// 로드 시 스크립트(불투명).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub onload: Option<Value>,
    /// 명시 sub_keys 외 동작(다형 흡수, 금지키 전역 차단).
    #[serde(flatten)]
    pub extra: ExtraMap,
}

/// `options` 슬롯 — 타입 종속 설정. 그 타입이 정의·검증하고 코어는 불관여 — 새
/// 위젯이 와도 코어 불변. 컨테이너 타입 chrome과 타입 종속 스크립트/콜백도 여기.
///
/// 종속 격리: 대상이 스칼라(`type`)이므로 전용 슬롯(`options`)에 캡슐화한다(정규
/// 모델 `dependency_buckets` target=type). sub_keys 는 흡수된 레거시 옵션의 명시
/// 항목이며, 미래 위젯 옵션은 `extra` 로 흡수한다(다형, 금지키 전역 차단).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct OptionsSlot {
    /// 키워드 최소 길이.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keyword_min_length: Option<Value>,
    /// 마커 드래그 가능.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub marker_draggable: Option<Value>,
    /// 지도 줌.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub zoom: Option<Value>,
    /// 지오메트리 타입.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry_type: Option<Value>,
    /// 최대 태그 수.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_tags: Option<Value>,
    /// 체크박스 라벨.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checkbox_label: Option<Value>,
    /// on 라벨.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub on_label: Option<Value>,
    /// 컨테이너 chrome — 접힘.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collapse: Option<Value>,
    /// 컨테이너 chrome — 펼침.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expend: Option<Value>,
    /// 컨테이너 chrome — 총계 표시.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub view_total: Option<Value>,
    /// 컨테이너 chrome — 스테퍼.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stepper: Option<Value>,
    /// 빈 상태 메시지.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blank_message: Option<Value>,
    /// 타입 종속 콜백(예: select2).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub callback: Option<Value>,
    /// 타입 종속 이벤트(예: datetime 설정).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event: Option<Value>,
    /// 명시 sub_keys 외 타입 옵션(다형 흡수 — 코어 불관여, 금지키 전역 차단).
    #[serde(flatten)]
    pub extra: ExtraMap,
}

// ============================================================================
// 종속 격리 버킷 (SPEC-V2 §3 C) — 구조 대상의 하위.
// 정규 v2 키만 sub_key 로 등재한다. 레거시 이름(multiple_max·lang:append·
// sortable* 등)·매직 토큰은 인식키가 아니다 — 번역기 absorbs_legacy 가
// 레거시→정규 매핑을 담당하고, 이 모델은 정규 키만 안다.
// ============================================================================

/// `multiple` 종속 — 반복 격리 버킷(정규 모델 target=multiple).
///
/// 정규 sub_keys: `max`/`copy`/`sortable`/`onclick`. 레거시 `multiple_max`→`max`,
/// `add_buttons`/`remove_list_button`/`list_button_text`→`copy`, `sortable*`→
/// `sortable`, `multiple_button_onclick`→`onclick` 는 번역기 absorbs_legacy 의
/// 책임이며 인식키가 아니다. sub_keys 외 확장은 `extra` 로 흡수(금지키 전역 차단).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct MultipleSpec {
    /// 최대 행 수.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<Value>,
    /// 행 복제/추가·삭제 버튼(레거시 add_buttons/remove_list_button/list_button_text 흡수처).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub copy: Option<Value>,
    /// 정렬 가능.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sortable: Option<Value>,
    /// 버튼 클릭 동작(반복 종속).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub onclick: Option<Value>,
    /// 명시 sub_keys 외 반복 종속(흡수, 금지키 전역 차단).
    #[serde(flatten)]
    pub extra: ExtraMap,
}

/// `lang` 종속 — 다국어 입력 격리 버킷(정규 모델 target=lang).
///
/// 정규 sub_keys: `mode`/`only`/`name`/`key`/`frame`/`title`/`group_class`. 레거시
/// `lang:append`→`mode`, `langs`→`only`, `lang_name`→`name`, `lang_key`→`key`,
/// `remove_lang_frame`→`frame`, `remove_lang_title`→`title`, `lang_group_class`→
/// `group_class` 는 번역기 absorbs_legacy 의 책임이며 인식키가 아니다(매직 토큰
/// `:` 금지). sub_keys 외 확장은 `extra` 로 흡수(금지키 전역 차단).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct LangSpec {
    /// 모드(레거시 `lang:append` 흡수처).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<Value>,
    /// 양형(SPEC §3 C): 언어 allowlist `[ko, en]`(string[]) 또는 언어별 오버라이드
    /// 맵 `{ja: {validate: …}}`. allowlist 는 표시 언어 한정, 오버라이드 맵은 언어별
    /// 역할 슬롯(validate/design/behavior/options) 재정의. `Value` 로 보관해 양형이
    /// 모두 round-trip 한다. 레거시 langs allowlist·언어별 langs 맵 양형 흡수.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub only: Option<Value>,
    /// 언어 차원 이름.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<Value>,
    /// 언어 차원 키.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<Value>,
    /// 언어 그룹 프레임.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frame: Option<Value>,
    /// 언어 그룹 타이틀.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<Value>,
    /// 언어 그룹 class.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_class: Option<Value>,
    /// 명시 sub_keys 외 다국어 입력 종속(흡수, 금지키 전역 차단).
    #[serde(flatten)]
    pub extra: ExtraMap,
}

/// `items` — 선택지 소스(다형, 정규 모델 target=items). 정적 배열 | 정적
/// value→label 맵(G3) | 동적 `{model, method, table, relations}` 소스. 종속 격리
/// 버킷이자 1급.
///
/// 정적 value→label 맵(SPEC §2 G3)은 key 가 옵션 값(멤버십 대상), 값이 표시용
/// 라벨(string | LangMap | null)이다 — 라벨은 표시용이라 멤버십에 무관, 빈(null)
/// 라벨은 무영향. 동적 소스와 구분은 key 집합으로 한다: 모든 key 가 동적 소스 key
/// (`model`/`method`/`table`/`relations`)이면 동적, 아니면 정적 value→label 맵.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum Items {
    /// 동적 소스 `{model, method, table, relations}`.
    Dynamic(ItemsSource),
    /// 정적 배열 | 정적 value→label 맵(선언 순서 선택지, G3).
    Static(Value),
}

/// items 동적 소스 key 집합. 객체의 모든 key 가 이 집합이면 동적 소스, 아니면 정적
/// value→label 맵으로 라우팅한다(untagged 의 Dynamic-우선 오분류 방지).
const ITEMS_DYNAMIC_KEYS: &[&str] = &["model", "method", "table", "relations"];

impl<'de> Deserialize<'de> for Items {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;
        match &value {
            // 배열은 정적 선택지.
            Value::Array(_) => Ok(Items::Static(value)),
            // 객체: 모든 key 가 동적 소스 key 면 동적, 아니면 정적 value→label 맵.
            Value::Object(map) => {
                let all_dynamic = !map.is_empty()
                    && map.keys().all(|k| ITEMS_DYNAMIC_KEYS.contains(&k.as_str()));
                if all_dynamic {
                    let source = ItemsSource::deserialize(value).map_err(de::Error::custom)?;
                    Ok(Items::Dynamic(source))
                } else {
                    // 정적 value→label 맵(G3): key=값, value=라벨(string|LangMap|null).
                    Ok(Items::Static(value))
                }
            }
            // 그 외(문자열 등)는 정적으로 보존.
            _ => Ok(Items::Static(value)),
        }
    }
}

/// `items` 동적 소스(SPEC-V2 §3 C 동적 선택지 소스). 레거시에 흩어졌던 소스
/// 디스크립터를 `items` 하위로 모음. 정규 sub_keys: `model`/`method`/`table`/
/// `relations`. sub_keys 외는 `extra` 로 흡수(금지키 전역 차단).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct ItemsSource {
    /// 데이터 모델/소스.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<Value>,
    /// 호출 메서드.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub method: Option<Value>,
    /// 테이블.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub table: Option<Value>,
    /// 관계.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relations: Option<Value>,
    /// 명시 sub_keys 외 소스 디스크립터(흡수, 금지키 전역 차단).
    #[serde(flatten)]
    pub extra: ExtraMap,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(s: &str) -> FieldSpec {
        serde_json::from_str(s).expect("valid v2 field spec")
    }

    #[test]
    fn minimal_type_only() {
        let f = parse(r#"{ "type": "email" }"#);
        assert_eq!(f.field_type.as_deref(), Some("email"));
    }

    #[test]
    fn slot_polymorphic_toggle() {
        // behavior: false 로 합성 상속 무효화 (G2).
        let f = parse(r#"{ "type": "text", "behavior": false }"#);
        assert_eq!(f.behavior, Some(Polymorphic::Toggle(false)));

        // validate: true == {} 축약 (G2).
        let f = parse(r#"{ "type": "text", "validate": true }"#);
        assert_eq!(f.validate, Some(Polymorphic::Toggle(true)));
    }

    #[test]
    fn slot_polymorphic_config() {
        let f = parse(
            r#"{ "type": "email",
                 "validate": { "required": ".subscribe", "email": true } }"#,
        );
        match f.validate {
            Some(Polymorphic::Config(v)) => {
                assert_eq!(
                    v.required,
                    Some(ConditionValue::Single(Value::String(".subscribe".into())))
                );
                assert_eq!(v.email, Some(ConditionValue::Single(Value::Bool(true))));
            }
            other => panic!("expected validate config, got {other:?}"),
        }
    }

    #[test]
    fn design_node_map() {
        let f = parse(
            r#"{ "type": "text",
                 "design": {
                   "show": ".subscribe",
                   "class": { ".vip": "gold", "true": "plain" },
                   "label": { "class": "lbl" }
                 } }"#,
        );
        match f.design {
            Some(Polymorphic::Config(d)) => {
                assert!(d.show.is_some());
                // 조건맵: 선언 순서 + true 기본키.
                match d.class {
                    Some(ConditionValue::Map(m)) => {
                        let keys: Vec<&String> = m.keys().collect();
                        assert_eq!(keys, vec![".vip", DEFAULT_KEY]);
                    }
                    other => panic!("expected class condition map, got {other:?}"),
                }
                assert_eq!(
                    d.label.and_then(|n| n.class),
                    Some(ConditionValue::Single(Value::String("lbl".into())))
                );
            }
            other => panic!("expected design config, got {other:?}"),
        }
    }

    #[test]
    fn type_dependency_isolated_to_options() {
        let f = parse(r#"{ "type": "checkbox", "options": { "checkbox_label": "agree" } }"#);
        match f.options {
            Some(Polymorphic::Config(o)) => {
                assert_eq!(o.checkbox_label, Some(Value::String("agree".into())))
            }
            other => panic!("expected options config, got {other:?}"),
        }
    }

    #[test]
    fn multiple_dependency_isolated_under_multiple() {
        let f = parse(r#"{ "type": "group", "multiple": { "max": 5, "sortable": true } }"#);
        match f.multiple {
            Some(Polymorphic::Config(m)) => assert_eq!(m.max, Some(Value::from(5))),
            other => panic!("expected multiple config, got {other:?}"),
        }
    }

    #[test]
    fn lang_dependency_isolated_under_lang() {
        let f = parse(r#"{ "type": "text", "lang": { "mode": "append", "only": ["ko","en"] } }"#);
        match f.lang {
            Some(Polymorphic::Config(l)) => {
                assert_eq!(l.mode, Some(Value::String("append".into())))
            }
            other => panic!("expected lang config, got {other:?}"),
        }
    }

    #[test]
    fn items_dynamic_source() {
        let f = parse(r#"{ "type": "select", "items": { "model": "User", "method": "all" } }"#);
        match f.items {
            Some(Items::Dynamic(s)) => assert_eq!(s.model, Some(Value::String("User".into()))),
            other => panic!("expected dynamic items, got {other:?}"),
        }
    }

    #[test]
    fn items_static_array() {
        let f = parse(r#"{ "type": "select", "items": ["a","b"] }"#);
        assert!(matches!(f.items, Some(Items::Static(_))));
    }

    #[test]
    fn label_language_map() {
        let f = parse(r#"{ "type": "text", "label": { "ko": "이메일", "en": "Email" } }"#);
        assert!(matches!(f.label, Some(Content::Lang(_))));
    }

    #[test]
    fn composition_ref_and_patch() {
        let f = parse(
            r#"{ "$ref": "Base.yml",
                 "$patch": { "field.validate.required": ".other" } }"#,
        );
        assert!(f.ref_.is_some());
        assert!(f.patch.is_some());
    }

    // 정규 v2 키 외 최상위 키(금지 메타키·레거시 이름·매직 토큰·x{key})는 모델에
    // 자리가 없다 — top-level deny_unknown_fields 가 거부.
    #[test]
    fn forbidden_meta_keys_rejected_top_level() {
        let mut keys: Vec<String> = FORBIDDEN_META_KEYS.iter().map(|s| s.to_string()).collect();
        keys.push("xclassname".to_string()); // x{key} 주석
        // 레거시 이름·매직 토큰도 정규 키가 아니므로 최상위에서 거부돼야 한다.
        keys.push("multiple_max".to_string());
        keys.push("langs".to_string());
        for k in keys {
            let json = format!(r#"{{ "type": "text", "{k}": true }}"#);
            let r: Result<FieldSpec, _> = serde_json::from_str(&json);
            assert!(r.is_err(), "forbidden/non-canonical top key must be rejected: {k}");
        }
    }

    // 금지 메타키는 열린 버킷(options/validate/...) 본문 한 칸 아래에서도 거부.
    // propertyNames:{not:{enum:[...]}} 의미론 — 확장은 허용, 금지키만 전역 차단.
    #[test]
    fn forbidden_meta_keys_rejected_one_level_below() {
        for k in FORBIDDEN_META_KEYS {
            // options 슬롯(열린 버킷) 본문
            let json = format!(r#"{{ "type": "text", "options": {{ "{k}": true }} }}"#);
            let r: Result<FieldSpec, _> = serde_json::from_str(&json);
            assert!(r.is_err(), "forbidden key in options bucket must be rejected: {k}");

            // multiple 종속 버킷 본문
            let json = format!(r#"{{ "type": "group", "multiple": {{ "{k}": true }} }}"#);
            let r: Result<FieldSpec, _> = serde_json::from_str(&json);
            assert!(r.is_err(), "forbidden key in multiple bucket must be rejected: {k}");
        }
        // x{key} 주석도 버킷 한 칸 아래에서 거부(canonical 단계엔 존재 불가).
        let json = r#"{ "type": "text", "options": { "xnote": "comment" } }"#;
        let r: Result<FieldSpec, _> = serde_json::from_str(json);
        assert!(r.is_err(), "x{{key}} comment in bucket must be rejected");
    }

    // 열린 버킷은 미래 위젯 확장 키를 허용한다(propertyNames not-enum: 금지키만 막음).
    #[test]
    fn open_bucket_allows_extension_keys() {
        let f = parse(r#"{ "type": "widget", "options": { "future_widget_opt": 42 } }"#);
        match f.options {
            Some(Polymorphic::Config(o)) => {
                assert_eq!(o.extra.as_map().get("future_widget_opt"), Some(&Value::from(42)));
            }
            other => panic!("expected options config, got {other:?}"),
        }
    }

    // round-trip: 파싱→재직렬화→재파싱이 동일 Value 여야 한다(선언 순서 보존 포함).
    #[test]
    fn round_trip_preserves_value_and_order() {
        let inputs = [
            r#"{"type":"email","name":"e","validate":{"required":".subscribe","email":true}}"#,
            r#"{"type":"text","design":{"show":".s","class":{".vip":"gold","true":"plain"},"label":{"class":"lbl"}}}"#,
            r#"{"type":"group","multiple":{"max":5,"sortable":true},"properties":{"a":{"type":"text"},"b":{"type":"email"}}}"#,
            r#"{"type":"select","items":{"model":"User","method":"all"},"label":{"ko":"선택","en":"Select"}}"#,
            r#"{"type":"text","behavior":false,"lang":true}"#,
            r#"{"$ref":"Base.yml","$patch":{"field.validate.required":".other"}}"#,
            r#"{"type":"widget","options":{"future_widget_opt":42,"max_tags":3}}"#,
        ];
        for src in inputs {
            let original: Value = serde_json::from_str(src).unwrap();
            let spec: FieldSpec = serde_json::from_value(original.clone()).unwrap();
            let reser = serde_json::to_value(&spec).unwrap();
            assert_eq!(reser, original, "round-trip mismatch for: {src}");
            // 재파싱도 동치(이중 왕복 안정성).
            let spec2: FieldSpec = serde_json::from_value(reser).unwrap();
            assert_eq!(spec, spec2, "double round-trip mismatch for: {src}");
        }
    }

    // DesignNode 가 class/style 외 키를 silent drop 하지 않고 보존(round-trip).
    // 이월 수정: 이전엔 extra 슬롯이 없어 text 등 비-class/style 키가 사라졌다.
    #[test]
    fn design_node_preserves_extra_keys_round_trip() {
        // label 노드에 class/style 외 키(text)가 섞여 있어도 round-trip 보존.
        let src = r#"{"type":"text","design":{"label":{"class":"lbl","text":"Name","style":"x"}}}"#;
        let original: Value = serde_json::from_str(src).unwrap();
        let spec: FieldSpec = serde_json::from_value(original.clone()).unwrap();

        // 타입 레벨에서 text 가 extra 로 보존됐는지 직접 확인.
        match &spec.design {
            Some(Polymorphic::Config(d)) => {
                let node = d.label.as_ref().expect("label node");
                assert_eq!(
                    node.extra.as_map().get("text"),
                    Some(&Value::String("Name".into())),
                    "DesignNode dropped non-class/style key 'text'"
                );
            }
            other => panic!("expected design config, got {other:?}"),
        }

        // 재직렬화가 입력과 동일해야 한다(선언 순서 포함, drop 없음).
        let reser = serde_json::to_value(&spec).unwrap();
        assert_eq!(reser, original, "DesignNode round-trip dropped/reordered keys");
    }

    // 조건맵 선언 순서가 직렬화 후에도 보존돼야 한다(preserve_order).
    #[test]
    fn condition_map_order_preserved_through_serialize() {
        let src = r#"{"type":"text","design":{"class":{".a":"1",".b":"2","true":"d"}}}"#;
        let spec: FieldSpec = serde_json::from_str(src).unwrap();
        let out = serde_json::to_string(&spec).unwrap();
        assert!(out.contains(r#"".a":"1",".b":"2","true":"d""#), "order lost: {out}");
    }
}
