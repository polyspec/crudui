/**
 * Generates shared CRUDUI list-render fixtures for three frameworks (SPEC §9).
 *
 * The read sister of tests/fixtures/form-render/generate.ts. It produces
 * `cases.json`: one case per list render scenario. Each case is
 * `{ name, note, spec, rows, options?, expected_html?, expectError? }`. The
 * `expected_html` is the NORMALIZED output of the React CRUDUI LIST reference
 * generator (`renderList`) — never hand-written. The Vue/Svelte CRUDUI list
 * generators must reproduce the SAME `expected_html` after the shared normalizer
 * (tests/fixtures/form-render/normalize.mjs — reused verbatim, SPEC §9 plan).
 *
 * DB-agnostic (SPEC §9): `rows` are INJECTED in the fixture; search/sort/
 * pagination are DECLARED only. The renderer never touches a DB.
 *
 * Do not edit `cases.json` by hand — regenerate:
 *   node_modules/.bin/tsx tests/fixtures/list-render/generate.ts \
 *     > tests/fixtures/list-render/cases.json
 */

import {
  renderList,
  type RenderListOptions,
} from '../../../packages/generator-react/src/index';
// @ts-expect-error — JS normalizer shared across the CRUDUI fixture harness.
import { normalizeHtml } from '../form-render/normalize.mjs';
// @ts-expect-error — shared JS preload link helper.
import { withoutPreloadLinks } from '../preload-links.mjs';

interface ListFixtureCase {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  options?: RenderListOptions;
  expected_html?: string;
  expectError?: { code: string; message?: string };
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
    note: 'pagination declared + supplied page and total → <nav class=list-pagination> data attrs.',
    spec: {
      columns: { name: { field: '.name', label: 'Name' } },
      pagination: { per_page: 20, mode: 'pages' },
    },
    rows: PEOPLE,
    options: { language: 'en', page: 2, total: 99 },
  },
  {
    name: 'pagination-empty-first-page',
    note: 'page 1 with total 0 is valid, and the largest safe integer page is accepted.',
    spec: {
      columns: { name: { field: '.name', label: 'Name' } },
      pagination: true,
    },
    rows: [],
    options: { language: 'en', page: 9007199254740991, total: 0 },
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

  // An unresolved $ref returns a load error instead of a table.
  {
    name: 'unresolved-ref-error',
    note: 'unresolved $ref → ComposeLoadError (render FAILS, never valid).',
    spec: { columns: { $ref: 'missing.yml' } },
    rows: [],
    options: { files: {} },
    expectError: { code: 'REF_FILE_NOT_FOUND' },
  },
  // List input: every runtime rejects the same invalid input with the same message.
  {
    name: 'reject-array-specification',
    note: 'a specification that is not an object is rejected.',
    spec: [] as unknown as Record<string, unknown>,
    rows: [],
    expectError: { code: 'INVALID_FORM_INPUT', message: 'List specification must be an object' },
  },
  {
    name: 'reject-string-specification',
    note: 'a string specification is rejected.',
    spec: 'list' as unknown as Record<string, unknown>,
    rows: [],
    expectError: { code: 'INVALID_FORM_INPUT', message: 'List specification must be an object' },
  },
  {
    name: 'reject-object-rows',
    note: 'rows that are not an array are rejected.',
    spec: { columns: { name: { field: '.name' } } },
    rows: {} as unknown as Array<Record<string, unknown>>,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'List rows must be an array' },
  },
  {
    name: 'reject-scalar-row',
    note: 'a row that is not an object is rejected.',
    spec: { columns: { name: { field: '.name' } } },
    rows: [1] as unknown as Array<Record<string, unknown>>,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'List rows must be objects' },
  },
  {
    name: 'reject-array-row',
    note: 'a row that is an array is rejected.',
    spec: { columns: { name: { field: '.name' } } },
    rows: [[]] as unknown as Array<Record<string, unknown>>,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'List rows must be objects' },
  },
  {
    name: 'reject-array-context',
    note: 'a data option that is not an object is rejected.',
    spec: { columns: { name: { field: '.name' } } },
    rows: [],
    options: { data: [] } as unknown as RenderListOptions,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'List context must be an object' },
  },
  {
    name: 'reject-context-before-page',
    note: 'the data rule is checked before the page rule.',
    spec: { columns: { name: { field: '.name' } } },
    rows: [],
    options: { data: [], page: 0 } as unknown as RenderListOptions,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'List context must be an object' },
  },
  {
    name: 'reject-string-page',
    note: 'a page that is not a number is rejected.',
    spec: { columns: { name: { field: '.name' } } },
    rows: [],
    options: { page: '2' } as unknown as RenderListOptions,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'List page must be a positive integer' },
  },
  {
    name: 'reject-zero-page',
    note: 'a page below 1 is rejected, before the total and layout rules.',
    spec: { columns: { name: { field: '.name' } } },
    rows: [],
    options: { page: 0, total: -1, layout: 'grid' } as unknown as RenderListOptions,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'List page must be a positive integer' },
  },
  {
    name: 'reject-fractional-page',
    note: 'a page that is not an integer is rejected.',
    spec: { columns: { name: { field: '.name' } } },
    rows: [],
    options: { page: 1.5 },
    expectError: { code: 'INVALID_FORM_INPUT', message: 'List page must be a positive integer' },
  },
  {
    name: 'reject-unsafe-page',
    note: 'a page above the largest safe integer is rejected.',
    spec: { columns: { name: { field: '.name' } } },
    rows: [],
    options: { page: 9007199254740992 },
    expectError: { code: 'INVALID_FORM_INPUT', message: 'List page must be a positive integer' },
  },
  {
    name: 'reject-negative-total',
    note: 'a total below 0 is rejected, before the layout rule.',
    spec: { columns: { name: { field: '.name' } } },
    rows: [],
    options: { total: -1, layout: 'grid' } as unknown as RenderListOptions,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'List total must be a nonnegative integer' },
  },
  {
    name: 'reject-fractional-total',
    note: 'a total that is not an integer is rejected.',
    spec: { columns: { name: { field: '.name' } } },
    rows: [],
    options: { total: 2.5 },
    expectError: { code: 'INVALID_FORM_INPUT', message: 'List total must be a nonnegative integer' },
  },
  {
    name: 'reject-boolean-total',
    note: 'a total that is not a number is rejected.',
    spec: { columns: { name: { field: '.name' } } },
    rows: [],
    options: { total: true } as unknown as RenderListOptions,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'List total must be a nonnegative integer' },
  },
  {
    name: 'reject-unknown-layout',
    note: 'a layout other than table or card is rejected.',
    spec: { columns: { name: { field: '.name' } } },
    rows: [],
    options: { layout: 'grid' } as unknown as RenderListOptions,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'List layout must be table or card' },
  },
  {
    name: 'reject-number-layout',
    note: 'a layout that is not a string is rejected.',
    spec: { columns: { name: { field: '.name' } } },
    rows: [],
    options: { layout: 5 } as unknown as RenderListOptions,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'List layout must be table or card' },
  },
  {
    name: 'layout-null-selects-table',
    note: 'a null layout selects the table layout, as an absent layout does.',
    spec: { columns: { name: { field: '.name', label: 'Name' } } },
    rows: PEOPLE,
    options: { language: 'en', layout: null } as unknown as RenderListOptions,
  },
];

function build(): ListFixtureCase[] {
  return SCENARIOS.map((c) => {
    if (c.expectError) {
      const { expected_html: _omit, ...rest } = c;
      void _omit;
      return rest;
    }
    const raw = withoutPreloadLinks(renderList(c.spec, c.rows, c.options ?? {}));
    return { ...c, expected_html: normalizeHtml(raw) };
  });
}

process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
