#!/usr/bin/env bash
#
# Limepie 기준 HTML 픽스처 일괄 재생성.
#
# Usage:
#   bash tools/limepie-baseline/generate-all.sh
#
# Env:
#   LIMEPIE_SRC  Source checkout path (required).
#                반드시 핀 커밋 a47ccba 상태여야 한다. 다른 커밋으로 생성하지 마라.
#
# 출력: tests/fixtures/reference-html/<name>.html
# 기준 픽스처를 손으로 수정하지 마라 — 이 스크립트로만 재생성하라.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RENDER="$ROOT/tools/limepie-baseline/render.php"
OUT="$ROOT/tests/fixtures/reference-html"
: "${LIMEPIE_SRC:?Set LIMEPIE_SRC to the source checkout directory}"
export LIMEPIE_SRC

PIN="a47ccba7e318ae1d364c034b1d7c5b0de8a564bb"
HEAD_NOW="$(git -C "$LIMEPIE_SRC" rev-parse HEAD)"

if [ "$HEAD_NOW" != "$PIN" ]; then
    echo "ERROR: LIMEPIE_SRC($LIMEPIE_SRC) HEAD=$HEAD_NOW != pin $PIN" >&2
    echo "핀 커밋이 아닌 Limepie로 기준을 생성하지 마라." >&2
    exit 1
fi

mkdir -p "$OUT"

# --- examples/legacy/shared-specs/*.yml : 빈 데이터 렌더 ---------------------------
for s in product-form contact order-form registration user-registration multiple-test; do
    php "$RENDER" "$ROOT/examples/legacy/shared-specs/$s.yml" > "$OUT/$s.html"
    echo "ok: $s.html ($(wc -c < "$OUT/$s.html" | tr -d ' ') bytes)"
done

# --- tests/fixtures/specs/ProductNft.yml ------------------------------------
# ProductNft.yml 은 YAML 중복 키를 2곳 포함한다 (legacy ext-yaml 은 last-wins 로
# 허용, symfony/yaml v8 은 ParseException). 스펙 파일은 수정하지 않는다 — 임시
# 사본에서 "지는 쪽"(앞선 중복) 줄만 제거해 ext-yaml 파싱 결과와 동일한 트리를
# 만든 뒤 렌더한다.
#   * 222-224행: is_sale.description 1차 정의 (3줄, 225-226행의 2차 정의가 이김)
#   * 891행:     display_target_condition_class 의 중복 `1: ""` (값 동일)
# 스펙이 바뀌어 줄 번호가 어긋나면 아래 가드가 중단시킨다. 가드 우회 금지 —
# 중복 키 위치를 다시 확인하고 이 스크립트를 갱신하라.
NFT="$ROOT/tests/fixtures/specs/ProductNft.yml"

guard() {
    local lineno="$1" expected="$2"
    local actual
    actual="$(sed -n "${lineno}p" "$NFT")"
    if [ "$actual" != "$expected" ]; then
        echo "ERROR: ProductNft.yml ${lineno}행이 예상과 다름." >&2
        echo "  expected: $expected" >&2
        echo "  actual  : $actual" >&2
        echo "중복 키 dedup 줄 번호를 재확인하고 generate-all.sh 를 갱신하라." >&2
        exit 1
    fi
}

guard 222 '                description: |'
guard 225 '                description: |'
guard 891 '            1: ""'

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp "$ROOT/tests/fixtures/specs/OptionMultiplexable.yml" "$TMP/"
sed -e '222,224d' -e '891d' "$NFT" > "$TMP/ProductNft.yml"
php "$RENDER" "$TMP/ProductNft.yml" > "$OUT/ProductNft.html"
echo "ok: ProductNft.html ($(wc -c < "$OUT/ProductNft.html" | tr -d ' ') bytes)"

# --- tests/fixtures/specs/OptionMultiplexable.yml ---------------------------
# host 의존 fragment (ProductNft 의 $ref 대상). 단독 렌더는 legacy Limepie
# 자체가 실패한다: display_target=common.is_quantity 조회가 루트 스펙에 없어
# Exception('#1 not found key common.is_quantity'). 단독 기준을 조작해 만들지
# 마라 — 이 fragment 의 기준 커버리지는 ProductNft.html 안의 포함 렌더다.
# 미래에 단독 렌더가 가능해지면 자동으로 픽스처가 생성된다.
if php "$RENDER" "$ROOT/tests/fixtures/specs/OptionMultiplexable.yml" > "$TMP/OptionMultiplexable.html" 2> "$TMP/option.err"; then
    mv "$TMP/OptionMultiplexable.html" "$OUT/OptionMultiplexable.html"
    echo "ok: OptionMultiplexable.html ($(wc -c < "$OUT/OptionMultiplexable.html" | tr -d ' ') bytes) -- 단독 렌더 성공. README 의 known-failure 항목을 갱신하라."
else
    echo "skip: OptionMultiplexable.html — 단독 렌더 실패 (예상된 동작):"
    sed -n 1p "$TMP/option.err"
fi

echo "done."
