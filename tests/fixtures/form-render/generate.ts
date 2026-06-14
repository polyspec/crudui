/**
 * form-render shared fixture generator (4-language / 3-framework parity gate).
 *
 * Produces `cases.json`: one case per render scenario from the CRUDUI analysis
 * `fixture_ideas`. Each case is `{ name, note, spec, data?, options?,
 * expected_html, expectError? }`. The `expected_html` is the NORMALIZED output
 * of the React CRUDUI reference generator (renderForm) — never hand-written. The
 * Vue/Svelte CRUDUI generators must reproduce the same `expected_html` after the
 * shared normalizer (normalize.mjs).
 *
 * Do not edit `cases.json` by hand — regenerate:
 *   node_modules/.bin/tsx tests/fixtures/form-render/generate.ts > tests/fixtures/form-render/cases.json
 */

import {
  renderForm,
  ComposeLoadError,
  type RenderFormOptions,
} from '../../../packages/generator-react/src/index';
// @ts-expect-error — JS normalizer shared across the fixture harness.
import { normalizeHtml } from './normalize.mjs';

interface FixtureCase {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  data?: Record<string, unknown>;
  options?: Omit<RenderFormOptions, 'data'>;
  expected_html?: string;
  expectError?: { code: string };
}

/** The fixture matrix (one entry per `fixture_ideas` scenario). */
const SCENARIOS: FixtureCase[] = [
  {
    name: 'design-show-expr-truthy',
    note: "design.show '.subscribe' truthy → input shown (visible envelope).",
    spec: {
      type: 'group',
      properties: {
        email: { type: 'email', label: { ko: '이메일', en: 'Email' }, design: { show: '.subscribe' } },
      },
    },
    data: { subscribe: 1 },
    options: { language: 'ko' },
  },
  {
    name: 'design-show-expr-falsy',
    note: "design.show '.subscribe' falsy → wrapper carries display:none, DOM kept (legacy non-removal contract).",
    spec: {
      type: 'group',
      properties: {
        email: { type: 'email', label: { ko: '이메일', en: 'Email' }, design: { show: '.subscribe' } },
      },
    },
    data: { subscribe: 0 },
    options: { language: 'ko' },
  },
  {
    name: 'design-show-condmap-admin',
    note: "design.show condition map { '.role == \"admin\"': true, true: false } → admin shows; resolveConditionMap declaration order, true fallback last.",
    spec: {
      type: 'group',
      properties: {
        panel: {
          type: 'text',
          design: { show: { '.role == "admin"': true, true: false } },
        },
      },
    },
    data: { role: 'admin' },
  },
  {
    name: 'design-show-condmap-non-admin',
    note: 'Same condition-map show; non-admin → true fallback (false) → wrapper display:none, DOM kept.',
    spec: {
      type: 'group',
      properties: {
        panel: {
          type: 'text',
          design: { show: { '.role == "admin"': true, true: false } },
        },
      },
    },
    data: { role: 'user' },
  },
  {
    name: 'design-class-condmap-main',
    note: "design.class condition map on the main node → input class is the evaluated branch (eval forbidden; parseCondition path).",
    spec: {
      type: 'group',
      properties: {
        status: {
          type: 'text',
          design: { class: { '.status == "active"': 'text-success', true: 'muted' } },
        },
      },
    },
    data: { status: 'active' },
  },
  {
    name: 'design-class-ternary',
    note: "design.class ternary '.vip ? gold : plain' → tryEvaluateTernary value-return; regex-misread guard.",
    spec: {
      type: 'group',
      properties: {
        tier: { type: 'text', design: { class: '.vip ? gold : plain' } },
      },
    },
    data: { vip: true },
  },
  {
    name: 'design-node-map-4nodes',
    note: 'design 4-node map (label/wrapper/group N/A on leaf/prepend) → each node carries its class; R8 key-visible target.',
    spec: {
      type: 'group',
      properties: {
        amount: {
          type: 'text',
          label: { ko: '금액' },
          prepend: { ko: '₩' },
          design: {
            label: { class: 'fw-bold' },
            wrapper: { class: 'mb-3' },
            prepend: { class: 'text-muted' },
          },
        },
      },
    },
    options: { language: 'ko' },
  },
  {
    name: 'design-false-slot-off',
    note: 'design:false → slot off: no appearance, default envelope (show stays true).',
    spec: {
      type: 'group',
      properties: {
        plain: { type: 'text', label: { ko: '기본' }, design: false },
      },
    },
    options: { language: 'ko' },
  },
  {
    name: 'group-class-condmap-has-data',
    note: "legacy group_class exist/empty → design.group.class condition map { '.items': has-data, true: empty } → .form-group class branches on data.",
    spec: {
      type: 'group',
      properties: {
        block: {
          type: 'group',
          label: { ko: '블록' },
          design: { group: { class: { '.block.items': 'has-data', true: 'empty' } } },
          properties: {
            items: { type: 'text', label: { ko: '항목' } },
          },
        },
      },
    },
    data: { block: { items: 'x' } },
    options: { language: 'ko' },
  },
  {
    name: 'group-class-condmap-empty',
    note: 'Same group.class condition map; no data → empty branch.',
    spec: {
      type: 'group',
      properties: {
        block: {
          type: 'group',
          label: { ko: '블록' },
          design: { group: { class: { '.block.items': 'has-data', true: 'empty' } } },
          properties: {
            items: { type: 'text', label: { ko: '항목' } },
          },
        },
      },
    },
    data: {},
    options: { language: 'ko' },
  },
  {
    name: 'multiple-leaf-two-rows',
    note: 'multiple:true + 2 data rows → 2 input-group-wrapper (2nd clone-element), plus/minus buttons.',
    spec: {
      type: 'group',
      properties: {
        tags: { type: 'text', label: { ko: '태그' }, multiple: true },
      },
    },
    data: { tags: ['a', 'b'] },
    options: { language: 'ko' },
  },
  {
    name: 'multiple-leaf-empty-placeholder',
    note: 'multiple:true + empty data → a single placeholder row.',
    spec: {
      type: 'group',
      properties: {
        tags: { type: 'text', label: { ko: '태그' }, multiple: true },
      },
    },
    data: {},
    options: { language: 'ko' },
  },
  {
    name: 'multiple-settings-bucket',
    note: 'multiple:{ max:5, sortable:true, copy:true } → data-multiple-max, move-up/down, copy + btn-delete (canonical keys only).',
    spec: {
      type: 'group',
      properties: {
        rows: { type: 'text', label: { ko: '행' }, multiple: { max: 5, sortable: true, copy: true } },
      },
    },
    data: { rows: ['x'] },
    options: { language: 'ko' },
  },
  {
    name: 'multiple-group-rows',
    note: 'type:group + multiple:true + 1 row → form-group per row + row buttons (no __13hex__ position id leakage; data id is the row key).',
    spec: {
      type: 'group',
      properties: {
        people: {
          type: 'group',
          label: { ko: '사람' },
          multiple: true,
          properties: {
            name: { type: 'text', label: { ko: '이름' } },
          },
        },
      },
    },
    data: { people: { p1: { name: 'Kim' } } },
    options: { language: 'ko' },
  },
  {
    name: 'lang-default-langs',
    note: 'lang:true → default ko/en/ja/zh language children, each a lang-code prepend span. Content label translation stays separate.',
    spec: {
      type: 'group',
      properties: {
        title: { type: 'text', label: { ko: '제목', en: 'Title' }, lang: true },
      },
    },
    options: { language: 'ko' },
  },
  {
    name: 'lang-settings-only-frame-off',
    note: 'lang:{ only:[ko,en], title:{ko:언어팩}, frame:false } → 2 languages, frame off (p-0 border-0), title applied.',
    spec: {
      type: 'group',
      properties: {
        body: {
          type: 'text',
          label: { ko: '본문' },
          lang: { only: ['ko', 'en'], title: { ko: '언어팩' }, frame: false },
        },
      },
    },
    options: { language: 'ko' },
  },
  {
    name: 'group-nested-properties',
    note: 'type:group + properties:{a,b} → form-group envelope with 2 recursive children.',
    spec: {
      type: 'group',
      properties: {
        addr: {
          type: 'group',
          label: { ko: '주소' },
          properties: {
            city: { type: 'text', label: { ko: '도시' } },
            zip: { type: 'text', label: { ko: '우편번호' } },
          },
        },
      },
    },
    options: { language: 'ko' },
  },
  {
    name: 'compose-ref-patch',
    note: '$ref base + deep-path $patch → composed single spec rendered (compose runs first). Verifies the email field inherited from Base and the patched design.',
    spec: {
      type: 'group',
      properties: {
        $ref: 'Base.yml',
        $patch: { 'email.design.class': 'patched' },
      },
    },
    options: {
      files: {
        'Base.yml': {
          properties: {
            email: { type: 'email', label: { ko: '이메일' } },
          },
        },
      },
      language: 'ko',
    },
  },
  {
    name: 'compose-ref-unresolved-load-error',
    note: 'Unresolved $ref → ComposeLoadError (render FAILS; not valid:true). The fixture records the error code, no expected_html.',
    spec: {
      type: 'group',
      properties: {
        $ref: 'Missing.yml',
      },
    },
    expectError: { code: 'REF_FILE_NOT_FOUND' },
  },
  {
    name: 'content-langmap-with-show',
    note: 'label LangMap {ko,en} + language=ko → h6 text 이메일; design.show expression applies independently (content axis vs appearance axis).',
    spec: {
      type: 'group',
      properties: {
        email: { type: 'email', label: { ko: '이메일', en: 'Email' }, design: { show: '.subscribe' } },
      },
    },
    data: { subscribe: 1 },
    options: { language: 'ko' },
  },
  {
    name: 'content-langmap-en',
    note: 'Same spec, language=en → h6 text Email (content translation switches with language).',
    spec: {
      type: 'group',
      properties: {
        email: { type: 'email', label: { ko: '이메일', en: 'Email' }, design: { show: '.subscribe' } },
      },
    },
    data: { subscribe: 1 },
    options: { language: 'en' },
  },
  {
    name: 'behavior-opaque-passthrough',
    note: 'behavior:{onchange:foo()} → onchange attr verbatim (expr engine NOT applied). design.show alone goes through expr — the contrast case.',
    spec: {
      type: 'group',
      properties: {
        field: { type: 'text', behavior: { onchange: 'foo()' }, design: { show: '.x' } },
      },
    },
    data: { x: 1 },
  },
];

function build(): FixtureCase[] {
  return SCENARIOS.map((c) => {
    if (c.expectError) {
      // Confirm the error actually throws with the recorded code.
      let thrown: unknown;
      try {
        renderForm(c.spec, { ...(c.options ?? {}), data: c.data });
      } catch (e) {
        thrown = e;
      }
      if (!(thrown instanceof ComposeLoadError)) {
        throw new Error(`${c.name}: expected ComposeLoadError, got ${String(thrown)}`);
      }
      if (thrown.code !== c.expectError.code) {
        throw new Error(`${c.name}: expected code ${c.expectError.code}, got ${thrown.code}`);
      }
      return { name: c.name, note: c.note, spec: c.spec, data: c.data, options: c.options, expectError: c.expectError };
    }
    const html = renderForm(c.spec, { ...(c.options ?? {}), data: c.data });
    const expected_html = normalizeHtml(html);
    return { name: c.name, note: c.note, spec: c.spec, data: c.data, options: c.options, expected_html };
  });
}

// eslint-disable-next-line no-console
console.log(JSON.stringify(build(), null, 2));
