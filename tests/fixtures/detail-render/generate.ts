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
};

const SCENARIOS: DetailFixtureCase[] = [
  {
    name: 'basic-fields',
    note: 'plain text fields with translated labels; values are escaped.',
    spec: {
      fields: {
        name: { field: '.name', label: { ko: '이름', en: 'Name' } },
        status: { field: '.status', label: { ko: '상태', en: 'Status' } },
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
        name: { field: '.name', label: { ko: '이름', en: 'Name' } },
        status: { field: '.status', label: { ko: '상태', en: 'Status' } },
      },
    },
    record: ADA,
    options: { language: 'ko' },
  },
  {
    name: 'format-date',
    note: 'date format applies the declared pattern.',
    spec: { fields: { joined: { field: '.joined', label: 'Joined', format: { type: 'date', pattern: 'YYYY-MM-DD' } } } },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'format-number',
    note: 'number format with decimals, thousands and a translated prefix.',
    spec: {
      fields: {
        score: { field: '.score', label: 'Score', format: { type: 'number', decimals: 2, thousands: true, prefix: { en: '$' } } },
      },
    },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'format-badge',
    note: 'badge format maps the value to a variant.',
    spec: {
      fields: { status: { field: '.status', label: 'Status', format: { type: 'badge', map: { active: 'success' } } } },
    },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'format-choice-label',
    note: 'choice-label format looks the value up in the declared items.',
    spec: { fields: { grade: { field: '.grade', label: 'Grade', format: { type: 'choice-label', items: { A: 'Apple' } } } } },
    record: { grade: 'A' },
    options: { language: 'en' },
  },
  {
    name: 'format-link',
    note: 'link format interpolates the href from the record.',
    spec: { fields: { name: { field: '.name', label: 'Name', format: { type: 'link', href: '/user/.id', target: '_blank' } } } },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'format-bool',
    note: 'bool format as check, icon and text.',
    spec: {
      fields: {
        check: { field: '.admin', label: 'Check', format: { type: 'bool', as: 'check', labels: { true: 'Yes', false: 'No' } } },
        icon: { field: '.admin', label: 'Icon', format: { type: 'bool', as: 'icon', labels: { true: 'Yes', false: 'No' } } },
        text: { field: '.admin', label: 'Text', format: { type: 'bool', labels: { true: 'Yes', false: 'No' } } },
      },
    },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'format-image',
    note: 'image format with width and height.',
    spec: { fields: { avatar: { field: '.avatar', label: 'Avatar', format: { type: 'image', width: 40, height: 40, alt: '.name' } } } },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'format-html',
    note: 'html format writes the declared markup without escaping.',
    spec: { fields: { notes: { field: '.notes', label: 'Notes', format: { type: 'html' } } } },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'missing-value',
    note: 'a field whose path is absent from the record renders an empty cell.',
    spec: { fields: { missing: { field: '.missing', label: 'Missing' } } },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'design-wrapper-and-cell',
    note: 'the detail design styles the container and a field design styles its cell.',
    spec: {
      design: { wrapper: { class: 'card', style: 'padding:4px' } },
      fields: { name: { field: '.name', label: 'Name', design: { main: { class: 'strong', style: 'color:red' } } } },
    },
    record: ADA,
    options: { language: 'en' },
  },
  {
    name: 'condition-hidden-field',
    note: 'a field hidden by its condition is not rendered.',
    spec: {
      fields: {
        name: { field: '.name', label: 'Name' },
        secret: { field: '.status', label: 'Secret', design: { show: false } },
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
    options: { language: 'en', files: { 'shared.json': { properties: { name: { field: '.name', label: 'Name' } } } } },
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
    name: 'reject-non-object-record',
    note: 'a record that is not an object is rejected.',
    spec: { fields: { name: { field: '.name', label: 'Name' } } },
    record: [] as unknown as Record<string, unknown>,
    expectError: { code: 'INVALID_FORM_INPUT', message: 'Detail record must be an object' },
  },
];

const cases = SCENARIOS.map((scenario) => {
  if (scenario.expectError) return scenario;
  const html = renderDetail(scenario.spec, scenario.record ?? {}, scenario.options ?? {});
  return { ...scenario, expected_html: normalizeHtml(html) };
});

process.stdout.write(`${JSON.stringify(cases, null, 2)}\n`);
