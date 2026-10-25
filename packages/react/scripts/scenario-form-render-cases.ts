/**
 * The form rendering scenarios of the CRUDUI analysis `fixture_ideas`: one spec, its data and
 * options per scenario, or the composition error code it fails with. generate-form-render-cases.mts
 * renders each one with the React reference generator into tests/fixtures/form-render/cases.json.
 */
import type { BindFormOptions, CompileFormOptions } from '@polyspec/crudui-generator-core';

/** One scenario: a form spec with its data and options, or the composition error it fails with. */
export interface ScenarioCase {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  data?: Record<string, unknown>;
  options?: BindFormOptions & CompileFormOptions;
  expectError?: { code: string; message: string };
}

/** An email field that the `subscribe` data member shows or hides. */
const emailShownBySubscribe = {
  type: 'group',
  properties: {
    email: { type: 'email', label: { ko: '이메일', en: 'Email' }, design: { show: '.subscribe' } },
  },
};

/** A group whose `design.group.class` condition map selects a class by the `items` value. */
const groupClassByItems = {
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
};

/** A collection of named rows that a `visible` text member shows or hides by its show condition. */
const collectionShownByVisible = {
  type: 'group',
  properties: {
    visible: { type: 'text', label: { en: 'Visible' } },
    items: { type: 'group', label: { en: 'Items' }, multiple: true, design: { show: '.visible' }, properties: { name: { type: 'text', label: { en: 'Name' } } } },
  },
};

/** The fixture matrix (one entry per `fixture_ideas` scenario). */
export const SCENARIOS: ScenarioCase[] = [
  {
    name: 'text-with-nul',
    note: 'a NUL character in a label, a placeholder and a value is written like any other character.',
    spec: {
      type: 'group',
      properties: {
        name: { type: 'text', label: 'A\u0000B', placeholder: 'p\u0000q' },
      },
    },
    data: { name: 'x\u0000y' },
    options: { language: 'en' },
  },
  {
    name: 'design-show-expr-truthy',
    note: "design.show '.subscribe' truthy → input shown (visible envelope).",
    spec: emailShownBySubscribe,
    data: { subscribe: 1 },
    options: { language: 'ko' },
  },
  {
    name: 'design-show-expr-falsy',
    note: "design.show '.subscribe' falsy → node carries the hidden attribute, DOM kept (non-removal contract).",
    spec: emailShownBySubscribe,
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
    note: 'Same condition-map show; non-admin → true fallback (false) → node hidden attribute, DOM kept.',
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
    note: "A ternary selects a quoted class-name string.",
    spec: {
      type: 'group',
      properties: {
        tier: { type: 'text', design: { class: ".vip ? 'gold' : 'plain'" } },
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
    note: 'design:false → slot off: no appearance, default node markup (show stays true).',
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
    note: "The design.group.class condition map selects has-data or empty according to the items value.",
    spec: groupClassByItems,
    data: { block: { items: 'x' } },
    options: { language: 'ko' },
  },
  {
    name: 'group-class-condmap-empty',
    note: 'Same group.class condition map; no data → empty branch.',
    spec: groupClassByItems,
    data: {},
    options: { language: 'ko' },
  },
  {
    name: 'multiple-leaf-two-rows',
    note: 'multiple:true + 2 keyed rows → collection node with 2 row nodes, each with add-row and remove-row controls.',
    spec: {
      type: 'group',
      properties: {
        tags: { type: 'text', label: { ko: '태그' }, multiple: true },
      },
    },
    data: { tags: { tag_a: 'a', tag_b: 'b' } },
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
    note: 'multiple:{ max:5, sortable:true, copy:true } → move-up/move-down, add-row, copy-row and remove-row controls with computed disabled states (canonical keys only).',
    spec: {
      type: 'group',
      properties: {
        rows: { type: 'text', label: { ko: '행' }, multiple: { max: 5, sortable: true, copy: true } },
      },
    },
    data: { rows: { row_x: 'x' } },
    options: { language: 'ko' },
  },
  {
    name: 'multiple-group-rows',
    note: 'type:group + multiple:true + 1 row → collapsible row node with number, controls and child nodes (no position id leakage; the row key is the identity).',
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
    note: 'lang:true → default ko/en/ja/zh lang-item nodes, each labelled with its code. Content label translation stays separate.',
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
    note: 'type:group + properties:{a,b} → group node with 2 recursive child nodes.',
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
    note: 'Unresolved $ref → ComposeLoadError (render FAILS; not valid:true). The fixture records the error code and message, no expected_html.',
    spec: {
      type: 'group',
      properties: {
        $ref: 'Missing.yml',
      },
    },
    expectError: { code: 'REF_FILE_NOT_FOUND', message: '$ref file not found: Missing.yml' },
  },
  {
    name: 'content-langmap-with-show',
    note: 'label LangMap {ko,en} + language=ko → label text 이메일; design.show expression applies independently (content axis vs appearance axis).',
    spec: emailShownBySubscribe,
    data: { subscribe: 1 },
    options: { language: 'ko' },
  },
  {
    name: 'content-langmap-en',
    note: 'Same spec, language=en → label text Email (content translation switches with language).',
    spec: emailShownBySubscribe,
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
  {
    name: 'multiple-nested-depth-three',
    note: 'Three collections nested in one another: one recursive node renders every depth, each row keeps its own key and number (CUMK-059, CUMK-058).',
    spec: {
      type: 'group',
      properties: {
        teams: {
          type: 'group',
          label: { en: 'Team' },
          multiple: true,
          properties: {
            members: {
              type: 'group',
              label: { en: 'Member' },
              multiple: true,
              properties: {
                tags: {
                  type: 'group',
                  label: { en: 'Tag' },
                  multiple: true,
                  properties: { name: { type: 'text', label: { en: 'Name' } } },
                },
              },
            },
          },
        },
      },
    },
    data: {
      teams: {
        __0000000000001__: {
          members: { __0000000000002__: { tags: { __0000000000003__: { name: 'Core' } } } },
        },
      },
    },
    options: { language: 'en' },
  },
  {
    name: 'multiple-max-reached-disables-add',
    note: 'With two rows at multiple.max 2 the add-row and copy-row controls are unavailable and marked aria-disabled, so no third row can be added (CUMK-060, CUMK-036).',
    spec: {
      type: 'group',
      properties: {
        rows: { type: 'text', label: { en: 'Row' }, multiple: { max: 2, copy: true } },
      },
    },
    data: { rows: { __0000000000001__: 'a', __0000000000002__: 'b' } },
    options: { language: 'en' },
  },
  {
    name: 'key-prefix-option-names',
    note: 'The keyPrefix option is the first segment of every control name, of the text and the repeated rows alike (CURT-025).',
    spec: {
      type: 'group',
      properties: {
        name: { type: 'text', label: { en: 'Name' } },
        tags: { type: 'text', label: { en: 'Tag' }, multiple: true },
      },
    },
    data: { name: 'Ada', tags: { __0000000000001__: 'x' } },
    options: { language: 'en', keyPrefix: 'form' },
  },
  {
    name: 'scalar-multiple-empty-object-has-no-rows',
    note: 'An explicit empty object for a repeated scalar field gives zero rows, and renders the add control (CUEC-001, CUEC-004).',
    spec: { type: 'group', properties: { tags: { type: 'text', multiple: true, label: { en: 'Tags' } } } },
    data: { tags: {} },
    options: { language: 'en' },
  },
  {
    name: 'collection-shown-by-condition',
    note: 'A collection whose show condition holds renders its rows (CUEC-006).',
    spec: collectionShownByVisible,
    data: { visible: 'yes', items: { __0000000000001__: { name: 'Alpha' } } },
    options: { language: 'en' },
  },
  {
    name: 'collection-hidden-by-condition',
    note: 'A collection whose show condition fails is hidden, and its row is still rendered with its data (CUEC-006).',
    spec: collectionShownByVisible,
    data: { visible: '', items: { __0000000000001__: { name: 'Alpha' } } },
    options: { language: 'en' },
  },
  {
    name: 'nested-empty-collections-keep-sibling-order',
    note: 'An explicit empty collection nested in a row has no rows, and sibling rows keep their keys and data order, the nested empty collection of the first and third rows included (CUEC-001, CURP-027).',
    spec: {
      type: 'group',
      properties: {
        items: {
          type: 'group',
          multiple: true,
          properties: {
            name: { type: 'text' },
            children: { type: 'group', multiple: true, properties: { name: { type: 'text' } } },
          },
        },
      },
    },
    data: {
      items: {
        __0000000000005__: { name: 'Five', children: {} },
        __0000000000007__: { name: 'Seven', children: { __0000000000001__: { name: 'Child' } } },
        __0000000000001__: { name: 'One', children: {} },
      },
    },
    options: { language: 'en' },
  },
  {
    name: 'stacked-layout-group',
    note: 'A group that declares design.layout stacked lays its label above its controls, like a form without a declaration (CUSC-016).',
    spec: {
      type: 'group',
      properties: {
        profile: {
          type: 'group',
          label: 'Profile',
          design: { layout: 'stacked' },
          properties: { name: { type: 'text', label: 'Name' } },
        },
      },
    },
    options: { language: 'en' },
  },
  {
    name: 'multiple-controls-header',
    note: 'multiple.controls header places the row controls in the header of each row (CUSC-046, the default position).',
    spec: {
      type: 'group',
      properties: {
        rows: { type: 'text', label: { en: 'Row' }, multiple: { controls: 'header', copy: true } },
      },
    },
    data: { rows: { __0000000000001__: 'a', __0000000000002__: 'b' } },
    options: { language: 'en' },
  },
  {
    name: 'multiple-controls-footer',
    note: 'multiple.controls footer places the row controls in the footer of each row (CUSC-046).',
    spec: {
      type: 'group',
      properties: {
        rows: { type: 'text', label: { en: 'Row' }, multiple: { controls: 'footer', copy: true } },
      },
    },
    data: { rows: { __0000000000001__: 'a', __0000000000002__: 'b' } },
    options: { language: 'en' },
  },
  {
    name: 'multiple-controls-outline',
    note: 'multiple.controls outline moves the row controls to the structure map and leaves none in the form (CUSC-046).',
    spec: {
      type: 'group',
      properties: {
        rows: { type: 'text', label: { en: 'Row' }, multiple: { controls: 'outline', copy: true } },
      },
    },
    data: { rows: { __0000000000001__: 'a', __0000000000002__: 'b' } },
    options: { language: 'en' },
  },
  {
    name: 'multiple-min-reached-disables-remove',
    note: 'With two rows at multiple.min 2 the remove-row controls are unavailable and marked aria-disabled, and add-row stays available (CUSC-043, CUMK-035).',
    spec: {
      type: 'group',
      properties: {
        rows: { type: 'text', label: { en: 'Row' }, multiple: { min: 2 } },
      },
    },
    data: { rows: { __0000000000001__: 'a', __0000000000002__: 'b' } },
    options: { language: 'en' },
  },
  {
    name: 'lang-values-keep-language-whatever-display',
    note: 'Each language input shows the value written for its language, whatever the display language: the Korean value is not copied to the English input (CUSC-039).',
    spec: {
      type: 'group',
      properties: {
        title: { type: 'text', label: { ko: '제목', en: 'Title' }, lang: true },
      },
    },
    data: { title: { ko: '원문 제목', en: 'Source title' } },
    options: { language: 'en' },
  },
];
