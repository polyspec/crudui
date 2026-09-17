/**
 * Generates the shared CRUDUI detail-render fixtures.
 *
 * The read sister of tests/fixtures/list-render/generate.ts. It produces `cases.json`: one case
 * per detail render scenario, `{ name, note, spec, record, options?, expected_html?,
 * expectError? }`. The `expected_html` is the NORMALIZED output of the React reference renderer
 * (`renderDetail`) — never hand-written. Every other renderer must reproduce it after the
 * shared normalizer, and every native generator must reproduce the raw bytes.
 *
 * The record is INJECTED in the fixture; a detail never reads application data.
 *
 * Do not edit `cases.json` by hand — regenerate:
 *   node_modules/.bin/tsx tests/fixtures/detail-render/generate.ts \
 *     > tests/fixtures/detail-render/cases.json
 */

import { renderDetail, type BuildDetailOptions } from '../../../packages/generator-react/src/index';
// @ts-expect-error — JS normalizer shared across the CRUDUI fixture harness.
import { normalizeHtml } from '../form-render/normalize.mjs';
// @ts-expect-error — shared JS preload link helper.
import { withoutPreloadLinks } from '../preload-links.mjs';

interface DetailFixtureCase {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  record?: Record<string, unknown>;
  options?: BuildDetailOptions;
  expected_html?: string;
  expectError?: { code: string; message: string };
}

/** One person record reused across scenarios. */
const ADA = {
  id: 7,
  name: '<Ada & Lin>',
  status: 'active',
  joined: '2026-01-02T09:00:00',
  score: 1234567.5,
  admin: 1,
  avatar: '/img/ada.png',
  notes: '<b>bold</b>',
  jointablename: { id: 107 },
  join: { join: { name: '<Ada & Lin>' } },
};

const SCENARIOS: DetailFixtureCase[] = [
  {
    name: 'text-with-nul',
    note: 'a NUL character in a label and in a value is written like any other character.',
    spec: { fields: { v: { field: 'v', label: 'A\u0000B' } } },
    record: { v: 'x\u0000y' },
    options: { language: 'en' },
  },
  {
    name: 'basic-fields',
    note: 'plain text fields with translated labels; values are escaped.',
    spec: {
      fields: {
        name: { field: 'name', label: { ko: '이름', en: 'Name' } },
        status: { field: 'status', label: { ko: '상태', en: 'Status' } },
      },
    },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'basic-fields-korean',
    note: 'the same declaration in Korean selects the Korean labels.',
    spec: {
      fields: {
        name: { field: 'name', label: { ko: '이름', en: 'Name' } },
        status: { field: 'status', label: { ko: '상태', en: 'Status' } },
      },
    },
    record: ADA,
    options: { language: 'ko' },
  },
  {
    name: 'format-date',
    note: 'date format applies the declared pattern.',
    spec: { fields: { joined: { field: 'joined', label: 'Joined', format: { type: 'date', pattern: 'YYYY-MM-DD' } } } },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'format-number',
    note: 'number format with decimals, thousands and a translated prefix.',
    spec: {
      fields: {
        score: { field: 'score', label: 'Score', format: { type: 'number', decimals: 2, thousands: true, prefix: { en: '$' } } },
      },
    },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'format-badge',
    note: 'badge format maps the value to a variant.',
    spec: {
      fields: { status: { field: 'status', label: 'Status', format: { type: 'badge', map: { active: 'success' } } } },
    },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'format-choice-label',
    note: 'choice-label format looks the value up in the declared items.',
    spec: { fields: { grade: { field: 'grade', label: 'Grade', format: { type: 'choice-label', items: { A: 'Apple' } } } } },
    record: { grade: 'A' },
    options: { language: 'en' },
  },
  {
    name: 'format-link',
    note: 'link format interpolates explicit tokens and preserves literal domain and extension text.',
    spec: { fields: { name: { field: 'name', label: 'Name', format: { type: 'link', href: 'https://example.com/users/{=jointablename.id}/{=join.join.name}.pdf', target: '_blank' } } } },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'format-bool',
    note: 'bool format as check, icon and text.',
    spec: {
      fields: {
        check: { field: 'admin', label: 'Check', format: { type: 'bool', as: 'check', labels: { true: 'Yes', false: 'No' } } },
        icon: { field: 'admin', label: 'Icon', format: { type: 'bool', as: 'icon', labels: { true: 'Yes', false: 'No' } } },
        text: { field: 'admin', label: 'Text', format: { type: 'bool', labels: { true: 'Yes', false: 'No' } } },
      },
    },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'format-image',
    note: 'image format interpolates an explicit alt token and preserves a literal extension.',
    spec: { fields: { avatar: { field: 'avatar', label: 'Avatar', format: { type: 'image', width: 40, height: 40, alt: '{=name}.png' } } } },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'format-image-empty-size',
    note: 'a declared null width and height write empty size attributes.',
    spec: { fields: { avatar: { field: 'avatar', label: 'Avatar', format: { type: 'image', width: null, height: null } } } },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'format-text-truncate-code-points',
    note: 'truncate counts Unicode code points, keeps the integer part of the limit and applies only a number.',
    spec: {
      fields: {
        emoji: { field: 'emoji', label: 'Emoji', format: { type: 'text', truncate: 2 } },
        hangul: { field: 'hangul', label: 'Hangul', format: { type: 'text', truncate: 3 } },
        fraction: { field: 'plain', label: 'Fraction', format: { type: 'text', truncate: 2.9 } },
        below: { field: 'short', label: 'Below', format: { type: 'text', truncate: 0.5 } },
        text: { field: 'plain', label: 'Text', format: { type: 'text', truncate: '2' } },
      },
    },
    record: { emoji: 'a😀bc', hangul: '가나다라마', plain: 'abcd', short: 'abc' },
    options: { language: 'en' },
  },
  {
    name: 'reject-number-decimals-above-range',
    note: 'decimals above 100 are rejected.',
    spec: { fields: { n: { field: 'n', label: 'N', format: { type: 'number', decimals: 101 } } } },
    record: { n: 1 },
    expectError: { code: 'INVALID_FORM_INPUT', message: 'Number decimals must be between 0 and 100' },
  },
  {
    name: 'reject-number-decimals-below-range',
    note: 'negative decimals are rejected.',
    spec: { fields: { n: { field: 'n', label: 'N', format: { type: 'number', decimals: -1 } } } },
    record: { n: 1 },
    expectError: { code: 'INVALID_FORM_INPUT', message: 'Number decimals must be between 0 and 100' },
  },
  {
    name: 'format-html',
    note: 'html format writes the declared markup without escaping.',
    spec: { fields: { notes: { field: 'notes', label: 'Notes', format: { type: 'html' } } } },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'missing-value',
    note: 'a field whose path is absent from the record renders an empty cell.',
    spec: { fields: { missing: { field: 'missing', label: 'Missing' } } },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'design-wrapper-and-cell',
    note: 'the detail design styles the container and a field design styles its cell.',
    spec: {
      design: { wrapper: { class: 'card', style: 'padding:4px' } },
      fields: { name: { field: 'name', label: 'Name', design: { class: 'strong', style: 'color:red' } } },
    },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'condition-hidden-field',
    note: 'a field hidden by its condition is not rendered.',
    spec: {
      fields: {
        name: { field: 'name', label: 'Name' },
        secret: { field: 'status', label: 'Secret', design: { show: false } },
      },
    },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'composed-fields',
    note: 'fields resolved from a referenced file.',
    spec: { fields: { $ref: 'shared.json' } },
    record: ADA,
    options: { language: 'en', files: { 'shared.json': { properties: { name: { field: 'name', label: 'Name' } } } } },
  },
  {
    name: 'empty-fields',
    note: 'a declaration with no fields renders an empty container.',
    spec: { fields: {} },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'reject-non-object-specification',
    note: 'a declaration that is not an object is rejected.',
    spec: [] as unknown as Record<string, unknown>,
    record: ADA,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'Detail specification must be an object' },
  },
  {
    name: 'reject-missing-fields',
    note: 'a declaration without fields is rejected.',
    spec: {},
    record: ADA,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'Detail specification must declare fields' },
  },
  {
    name: 'content-values',
    note: 'content is a string or a language map with non-empty string entries; any other value is empty text.',
    spec: {
      fields: {
        prefixNumberEntry: { field: 'n', label: 'P', format: { type: 'number', prefix: { en: 7, ko: 'K' } } },
        prefixObjectEntry: { field: 'n', label: 'O', format: { type: 'number', prefix: { en: { x: 1 } } } },
        prefixNumber: { field: 'n', label: 'N', format: { type: 'number', prefix: 0 } },
        boolLabelNumberEntry: { field: 'yes', label: 'B', format: { type: 'bool', true: { en: 3 } } },
        choiceNumber: { field: 'a', label: 'C', format: { type: 'choice-label', items: { a: 3 } } },
        choiceNumberEntry: { field: 'b', label: 'D', format: { type: 'choice-label', items: { b: { en: 3, ko: '가' } } } },
        choiceList: { field: 'a', label: 'E', format: { type: 'choice-label', items: { a: ['x'] } } },
        badgeNumberEntry: { field: 'a', label: 'G', format: { type: 'badge', map: { a: { en: 3 } } } },
        linkTextZero: { field: 'name', label: 'L0', format: { type: 'link', href: '/u', text: 0 } },
        linkTextFalse: { field: 'name', label: 'LF', format: { type: 'link', href: '/u', text: false } },
        linkTextEmpty: { field: 'name', label: 'LE', format: { type: 'link', href: '/u', text: '' } },
        linkTextNumberEntry: { field: 'name', label: 'LN', format: { type: 'link', href: '/u', text: { en: 3 } } },
        altList: { field: 'img', label: 'I', format: { type: 'image', alt: ['x'] } },
      },
    } as unknown as Record<string, unknown>,
    record: { n: 5, yes: true, a: 'a', b: 'b', name: 'Ada', img: 'data:image/png;base64,AA==' },
    options: { language: 'en' },
  },
  {
    name: 'list-options-ignored',
    note: 'the list-only page, total and layout options are neither checked nor used by a detail.',
    spec: { fields: { name: { field: 'name', label: 'Name' } } },
    record: ADA,
    options: { page: 0, total: -1, layout: 'grid' } as unknown as BuildDetailOptions,
  },
  {
    name: 'reject-specification-before-record',
    note: 'the specification rule is checked before the record rule.',
    spec: [] as unknown as Record<string, unknown>,
    record: [] as unknown as Record<string, unknown>,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'Detail specification must be an object' },
  },
  {
    name: 'reject-record-before-fields',
    note: 'argument shapes are checked before the declaration: the record rule precedes the fields rule.',
    spec: {},
    record: [] as unknown as Record<string, unknown>,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'Detail record must be an object' },
  },
  {
    name: 'reject-record-before-context',
    note: 'the record rule is checked before the context rule.',
    spec: { fields: { name: { field: 'name', label: 'Name' } } },
    record: [] as unknown as Record<string, unknown>,
    options: { data: [] } as unknown as BuildDetailOptions,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'Detail record must be an object' },
  },
  {
    name: 'reject-field-design-node-key',
    note: 'a design node key that the schema does not list is rejected at its field path.',
    spec: { fields: { name: { field: 'name', label: 'Name', design: { label: { text: 'x' } } } } },
    record: ADA,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'Invalid design.label.text at fields.name: unknown key' },
  },
  {
    name: 'reject-detail-design-node-value',
    note: "the detail's own design node must be an object.",
    spec: { design: { wrapper: 'box' }, fields: { name: { field: 'name', label: 'Name' } } },
    record: ADA,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'Invalid design.wrapper at detail: expected an object' },
  },
  {
    name: 'reject-array-context',
    note: 'a data option that is not an object is rejected.',
    spec: { fields: { name: { field: 'name', label: 'Name' } } },
    record: ADA,
    options: { data: [] } as unknown as BuildDetailOptions,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'Detail context must be an object' },
  },
  {
    name: 'reject-non-object-record',
    note: 'a record that is not an object is rejected.',
    spec: { fields: { name: { field: 'name', label: 'Name' } } },
    record: [] as unknown as Record<string, unknown>,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'Detail record must be an object' },
  },
];

const cases = SCENARIOS.map((scenario) => {
  if (scenario.expectError) return scenario;
  const html = withoutPreloadLinks(renderDetail(scenario.spec, scenario.record ?? {}, scenario.options ?? {}));
  return { ...scenario, expected_html: normalizeHtml(html) };
});

process.stdout.write(`${JSON.stringify(cases, null, 2)}\n`);
