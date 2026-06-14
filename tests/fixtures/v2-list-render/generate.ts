/**
 * v2 list-render shared fixture generator (3-framework parity gate, SPEC-V2 §9).
 *
 * The read sister of tests/fixtures/v2-render/generate.ts. It produces
 * `cases.json`: one case per list render scenario. Each case is
 * `{ name, note, spec, rows, options?, expected_html?, expectError? }`. The
 * `expected_html` is the NORMALIZED output of the React v2 LIST reference
 * generator (`renderListV2`) — never hand-written. The Vue/Svelte v2 list
 * generators must reproduce the SAME `expected_html` after the shared normalizer
 * (tests/fixtures/v2-render/normalize.mjs — reused verbatim, SPEC §9 plan).
 *
 * DB-agnostic (SPEC §9): `rows` are INJECTED in the fixture; search/sort/
 * pagination are DECLARED only. The renderer never touches a DB.
 *
 * Do not edit `cases.json` by hand — regenerate:
 *   node_modules/.bin/tsx tests/fixtures/v2-list-render/generate.ts \
 *     > tests/fixtures/v2-list-render/cases.json
 */

import {
  renderListV2,
  type RenderListOptions,
} from '../../../packages/generator-react/src/v2/index';
// @ts-expect-error — JS normalizer shared across the v2 fixture harness.
import { normalizeHtml } from '../v2-render/normalize.mjs';

interface ListFixtureCase {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  options?: RenderListOptions;
  expected_html?: string;
  expectError?: { code: string };
}

/** Two representative people rows reused across catalog scenarios. */
const PEOPLE = [
  {
    id: 1,
    name: 'Ada',
    status: 'active',
    joined: '2026-01-02T09:00:00',
    score: 1234567.5,
    admin: 1,
    avatar: '/img/ada.png',
  },
  {
    id: 2,
    name: 'Lin',
    status: 'blocked',
    joined: '2026-03-15T12:00:00',
    score: 42,
    admin: 0,
    avatar: '/img/lin.png',
  },
];

/** The fixture matrix (one entry per §9 list scenario). */
const SCENARIOS: ListFixtureCase[] = [
  // --- basic columns + the §9.2 cell catalog (date/number/badge/choice/link/bool) ---
  {
    name: 'basic-columns',
    note: 'plain text columns + i18n headers; two injected rows → table body.',
    spec: {
      columns: {
        name: { field: '.name', label: { ko: '이름', en: 'Name' } },
        status: { field: '.status', label: { ko: '상태', en: 'Status' } },
      },
    },
    rows: PEOPLE,
    options: { language: 'en' },
  },
  {
    name: 'format-date',
    note: 'date format → pattern applied to the cell value (§9.2).',
    spec: {
      columns: { joined: { field: '.joined', label: 'Joined', format: { type: 'date', pattern: 'YYYY-MM-DD' } } },
    },
    rows: PEOPLE,
    options: { language: 'en' },
  },
  {
    name: 'format-number',
    note: 'number format → decimals + thousands + i18n prefix affix (§9.2).',
    spec: {
      columns: {
        score: {
          field: '.score',
          label: 'Score',
          format: { type: 'number', decimals: 2, thousands: true, prefix: { en: '$' } },
        },
      },
    },
    rows: PEOPLE,
    options: { language: 'en' },
  },
  {
    name: 'format-badge',
    note: 'badge format → span.badge.badge-<variant> from the value→variant map (§9.2).',
    spec: {
      columns: {
        status: {
          field: '.status',
          label: 'Status',
          format: { type: 'badge', map: { active: 'success', blocked: 'danger' } },
        },
      },
    },
    rows: PEOPLE,
    options: { language: 'en' },
  },
  {
    name: 'format-choice-label',
    note: 'choice-label format → static code→label lookup (§9.2).',
    spec: {
      columns: {
        grade: { field: '.grade', label: 'Grade', format: { type: 'choice-label', items: { A: 'Apple', B: 'Banana' } } },
      },
    },
    rows: [{ grade: 'A' }, { grade: 'B' }],
    options: { language: 'en' },
  },
  {
    name: 'format-link',
    note: 'link format → <a> with .field-interpolated href + target (§9.2).',
    spec: {
      columns: {
        name: { field: '.name', label: 'Name', format: { type: 'link', href: '/user/.id', target: '_blank' } },
      },
    },
    rows: PEOPLE,
    options: { language: 'en' },
  },
  {
    name: 'format-bool',
    note: 'bool format as=check → glyph host carrying the i18n label (§9.2).',
    spec: {
      columns: {
        admin: { field: '.admin', label: 'Admin', format: { type: 'bool', true: 'Yes', false: 'No', as: 'check' } },
      },
    },
    rows: PEOPLE,
    options: { language: 'en' },
  },
  {
    name: 'format-image',
    note: 'image format → <img> with src + interpolated alt + size (§9.2).',
    spec: {
      columns: {
        avatar: { field: '.avatar', label: 'Avatar', format: { type: 'image', width: 40, height: 40, alt: 'avatar .name' } },
      },
    },
    rows: PEOPLE,
    options: { language: 'en' },
  },
  {
    name: 'format-html',
    note: 'html format → the ONE sanctioned raw passthrough (verbatim, no wrapper) (§9.2).',
    spec: { columns: { bio: { field: '.bio', label: 'Bio', format: { type: 'html' } } } },
    rows: [{ bio: '<b data-x="1">bold</b>' }],
    options: { language: 'en' },
  },

  // --- conditional column visibility (expression, G1) ---
  {
    name: 'column-show-expr-hidden',
    note: "design.show '.admin' falsy → the column is dropped from header AND every row (G1).",
    spec: {
      columns: {
        name: { field: '.name', label: 'Name' },
        secret: { field: '.secret', label: 'Secret', design: { show: '.admin' } },
      },
    },
    rows: [{ name: 'Ada', secret: 'TOPSECRET' }],
    options: { language: 'en', data: { admin: false } },
  },
  {
    name: 'column-show-expr-visible',
    note: "design.show '.admin' truthy → the column is kept (G1).",
    spec: {
      columns: {
        name: { field: '.name', label: 'Name' },
        secret: { field: '.secret', label: 'Secret', design: { show: '.admin' } },
      },
    },
    rows: [{ name: 'Ada', secret: 'visible' }],
    options: { language: 'en', data: { admin: true } },
  },

  // --- i18n headers (ko vs en) over the SAME spec ---
  {
    name: 'i18n-header-ko',
    note: 'i18n header resolves to ko under language:ko.',
    spec: {
      columns: {
        name: { field: '.name', label: { ko: '이름', en: 'Name' } },
        status: { field: '.status', label: { ko: '상태', en: 'Status' } },
      },
    },
    rows: PEOPLE,
    options: { language: 'ko' },
  },
  {
    name: 'i18n-header-en',
    note: 'i18n header resolves to en under language:en (same spec as -ko).',
    spec: {
      columns: {
        name: { field: '.name', label: { ko: '이름', en: 'Name' } },
        status: { field: '.status', label: { ko: '상태', en: 'Status' } },
      },
    },
    rows: PEOPLE,
    options: { language: 'en' },
  },

  // --- sort display (declared only — read-only marker, DB applies the real ORDER BY) ---
  {
    name: 'sort-display',
    note: 'sortable column + declared sort → data-sortable + data-sort-dir on the matching <th>.',
    spec: {
      columns: {
        name: { field: '.name', label: 'Name', sortable: true },
        status: { field: '.status', label: 'Status' },
      },
      sort: { field: '.name', dir: 'asc' },
    },
    rows: PEOPLE,
    options: { language: 'en' },
  },

  // --- pagination display (declared + injected meta; DB-agnostic) ---
  {
    name: 'pagination-display',
    note: 'pagination declared + injected page/total meta → <nav class=list-pagination> data attrs.',
    spec: {
      columns: { name: { field: '.name', label: 'Name' } },
      pagination: { per_page: 20, mode: 'pages' },
    },
    rows: PEOPLE,
    options: { language: 'en', pageMeta: { page: 2, total: 99 } },
  },

  // --- design appearance on a column header (resolveDesign reuse) ---
  {
    name: 'design-column-class-style',
    note: 'column design class/style reaches the <th> verbatim (form-spec design reuse).',
    spec: {
      columns: { name: { field: '.name', label: 'Name', design: { class: 'text-right', style: 'width: 40%' } } },
    },
    rows: PEOPLE,
    options: { language: 'en' },
  },

  // --- empty content ---
  {
    name: 'empty-message',
    note: 'no rows → the translated empty message, no <table>.',
    spec: { columns: { name: { field: '.name', label: 'Name' } }, empty: { ko: '데이터 없음', en: 'No data' } },
    rows: [],
    options: { language: 'en' },
  },

  // --- actions toolbar (behavior reuse: link format + bare behavior script) ---
  {
    name: 'actions-toolbar',
    note: 'link-format action → <a>; bare behavior action → <button> with the verbatim on* script.',
    spec: {
      columns: { name: { field: '.name', label: 'Name' } },
      actions: {
        edit: { label: { en: 'Edit' }, format: { type: 'link', href: '/edit' } },
        remove: 'confirmDelete(this)',
      },
    },
    rows: [{ name: 'Ada' }],
    options: { language: 'en' },
  },

  // --- card layout ---
  {
    name: 'card-layout',
    note: 'card layout → one .list-card article per row with label:value pairs, no <table>.',
    spec: {
      columns: {
        name: { field: '.name', label: { en: 'Name' } },
        status: { field: '.status', label: { en: 'Status' }, format: { type: 'badge', map: { active: 'success', blocked: 'danger' } } },
      },
    },
    rows: PEOPLE,
    options: { language: 'en', layout: 'card' },
  },

  // --- compose: $ref base + $patch overlay on the columns map (shared engine) ---
  {
    name: 'compose-ref-patch',
    note: '$ref base columns + $patch overlay (the SAME compose engine as form-spec).',
    spec: {
      columns: {
        $ref: 'base-columns.yml',
        $patch: { extra: { field: '.extra', label: 'Extra' } },
      },
    },
    rows: [{ id: 7, extra: 'E' }],
    options: {
      language: 'en',
      files: { 'base-columns.yml': { properties: { id: { field: '.id', label: 'ID', sortable: true } } } },
    },
  },

  // --- error lane: unresolved $ref is a LOAD ERROR (never a silent table) ---
  {
    name: 'unresolved-ref-error',
    note: 'unresolved $ref → ComposeLoadError (render FAILS, never valid).',
    spec: { columns: { $ref: 'missing.yml' } },
    rows: [],
    options: { files: {} },
    expectError: { code: 'REF_FILE_NOT_FOUND' },
  },
];

/**
 * Strip React 19's SSR resource-hint hoists (`<link rel="preload" as="image">`
 * emitted for an `<img src>`). These are a React-renderer artifact, not list
 * markup — Vue/Svelte SSR do not emit them, so they would break the cross-
 * framework parity. Same category as the normalizer's comment-strip rule: chrome
 * that is not load-bearing across frameworks is removed before comparison.
 */
function stripReactFloats(html: string): string {
  return html.replace(/<link\b[^>]*\brel="preload"[^>]*>/g, '');
}

function build(): ListFixtureCase[] {
  return SCENARIOS.map((c) => {
    if (c.expectError) {
      const { expected_html: _omit, ...rest } = c;
      void _omit;
      return rest;
    }
    const raw = stripReactFloats(renderListV2(c.spec, c.rows, c.options ?? {}));
    return { ...c, expected_html: normalizeHtml(raw) };
  });
}

process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
