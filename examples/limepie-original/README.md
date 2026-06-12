# limepie-original — 실제 Limepie PHP 폼 생성 데모

실제 `yejune/limepie` PHP 라이브러리로 폼을 렌더링하는 컨테이너 데모다 (포트 8015).
`docker-compose.yml` 의 `limepie-original` 서비스로 실행한다.

```bash
cd examples
docker compose up limepie-original
# http://localhost:8015
```

## 배선 (docker-compose 마운트)

| 컨테이너 경로 | 호스트 소스 | 비고 |
| --- | --- | --- |
| `/var/www/vendor` | `packages/generator-legacy/limepie/vendor` | composer vendor (symfony/yaml, ics-parser) |
| `/var/www/vendor/yejune/limepie` | `/Users/max/ai/gui/limepie` | 로컬 limepie 소스 체크아웃. **yejune/limepie a47ccba 핀 — tools/limepie-baseline/README.md 참조** |
| `/var/www/html/index.php` | `examples/limepie-original/public/index.php` | 데모 엔트리포인트 |
| `/var/www/specs` | `examples/shared-specs` | 스펙 단일 소스 — 이 디렉터리에 specs 사본을 두지 마라 |
| `/var/www/html/assets/*` | `examples/limepie-original/assets/*` | css/js 자산 |

- 스펙은 `examples/shared-specs` 에서만 마운트한다. 과거 `examples/limepie-original/specs`
  사본은 shared-specs 와 중복이라 삭제되었다.
- `public/index.php` 는 vendored autoload 에 Limepie PSR-4 매핑이 없으므로
  `tools/limepie-baseline/render.php` 와 동일한 방식으로 마운트된 소스 트리에서
  Limepie 클래스를 직접 오토로드한다.

## 기준 출력 (golden HTML)

이 데모의 화면 출력을 기준 출력으로 캡처하지 마라. 렌더러 비교용 기준 출력
(`tests/fixtures/golden-html/*.html`)은 **`tools/limepie-baseline` 파이프라인으로만
재생성**한다 — 절차와 핀(커밋 `a47ccba`), 비결정 토큰 정규화 규칙은
`tools/limepie-baseline/README.md` 를 따르라.

과거 이 디렉터리에 있던 `src/FormGenerator.php`("Limepie 와 동일 출력" 주장 standalone
포트)는 `public/index.php` 가 사용하지 않는 죽은 코드였고 실제 Limepie 출력과도
불일치하여 삭제되었다. 동일 출력 검증이 필요하면 tools/limepie-baseline 을 사용하라.
