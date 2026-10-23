/**
 * Form rendering cases of the choices that a field takes from a repeated group of the same form
 * (docs/spec/schema.md, Choices from a repeated group): the options are the rows of the group in
 * data order, and compilation refuses a group source that breaks its rules. The expected HTML is
 * written by hand from the specification and the form markup; never regenerated from a renderer.
 */
import { EMPTY_COLLECTION, GROUP_ROWS, rows } from './written-form-render-cases';

const BODY_END = '</div><div class="crudui-form__footer">';

/** A form of the variants collection `collection` with `node` after it in the body. */
const withNode = (collection: string, node: string) => collection.replace(BODY_END, `${node}${BODY_END}`);

/** The node of a labelled field at `path` whose body is `widget`. */
const node = (path: string, label: string, widget: string, labelFor: boolean) =>
  `<div class="crudui-node crudui-node--field" data-field-path="${path}"><div class="crudui-node__header">${labelFor ? `<label class="crudui-node__label" for="crudui:${path}">${label}</label>` : `<span class="crudui-node__label">${label}</span>`}</div><div class="crudui-node__body">${widget}</div></div>`;

const select = (options: string) => node('pick', 'Pick',
  `<div class="crudui-widget"><select class="valid-target crudui-input crudui-input--select" data-default="" data-name="pick" data-rule-name="pick" id="crudui:pick" name="pick">${options}</select></div>`, true);

const box = (value: string, label: string, index: number, checked: boolean) =>
  `<input autocomplete="off"${checked ? ' checked=""' : ''} class="valid-target crudui-choices__input" data-name="picks" data-rule-name="picks" id="crudui:picks:${index}" name="picks[]" type="checkbox" value="${value}"><label class="crudui-choices__label" for="crudui:picks:${index}"><span>${label}</span></label>`;

/** The row `key` of the variants collection, numbered `number`, with its name and price text. */
const ROW_START = '<div class="crudui-node crudui-node--row" data-crudui-row-key="__opt_b2__">';
const ROW_TEMPLATE = GROUP_ROWS.slice(GROUP_ROWS.indexOf(ROW_START), GROUP_ROWS.indexOf('<div class="crudui-node crudui-node--row" data-crudui-row-key="__opt_a1__">'));
const row = (key: string, number: number, name: string, price: string) => ROW_TEMPLATE
  .split('__opt_b2__').join(key)
  .replace('<span class="crudui-node__number">1</span>', `<span class="crudui-node__number">${number}</span>`)
  .replace('value="Blue"', `value="${name}"`)
  .replace('value="2"', `value="${price}"`);

/** The variants collection of four rows: Blue, a blank name, Blue again and the number 5. */
const FOUR_ROWS = GROUP_ROWS.slice(0, GROUP_ROWS.indexOf(ROW_START)).replace('Rows: 2', 'Rows: 4') +
  row('x1', 1, 'Blue', '2') + row('x2', 2, ' ', '3') + row('x3', 3, 'Blue', '4') + row('x4', 4, '5', '') +
  GROUP_ROWS.slice(GROUP_ROWS.indexOf('</div></div></div><div class="crudui-form__footer">'));

const variantsWith = (field: Record<string, unknown>) => {
  const spec = rows('only');
  return { ...spec, properties: { ...spec.properties, ...field } };
};

const SOURCE_FROM = 'Invalid items.from at pick: expected {group}.*.{field} for a field of a repeated group outside repeated groups';

const sourceError = (name: string, note: string, pick: Record<string, unknown>, message: string) =>
  ({ name, note, spec: variantsWith({ pick: { label: 'Pick', ...pick } }), options: { language: 'en' }, expectError: { code: 'INVALID_FORM_INPUT', message } });

export const GROUP_SOURCE_CASES = [
  {
    name: 'group-source-select-rows',
    note: 'A select field lists the rows of the variants group in data order: the name is the option value and the price, a number, its label as canonical text.',
    spec: variantsWith({ pick: { type: 'select', label: 'Pick', items: { from: 'variants.*.name', label: 'price' } } }),
    data: { variants: { __opt_b2__: { name: 'Blue', price: 2 }, __opt_a1__: { name: 'Red', price: 1 } }, pick: 'Red' },
    options: { language: 'en' },
    expected_html: withNode(GROUP_ROWS, select('<option value="Blue">2</option><option selected="" value="Red">1</option>')),
  },
  {
    name: 'group-source-multichoice-skips-rows',
    note: 'A row with a blank value and a row that repeats an earlier value give no choice; a number value gives its canonical text, and an empty label falls back to the value.',
    spec: variantsWith({ picks: { type: 'multichoice', label: 'Picks', items: { from: 'variants.*.name', label: 'price' } } }),
    data: { variants: { x1: { name: 'Blue', price: 2 }, x2: { name: ' ', price: 3 }, x3: { name: 'Blue', price: 4 }, x4: { name: 5, price: '' } }, picks: ['5'] },
    options: { language: 'en' },
    expected_html: withNode(FOUR_ROWS, node('picks', 'Picks', `<div class="crudui-choices crudui-choices--multiple">${box('Blue', '2', 0, false)}${box('5', '5', 1, true)}</div>`, false)),
  },
  {
    name: 'group-source-without-rows',
    note: 'A group without data has no choices, so the select lists them as it lists an empty choice list: with the one empty option that an empty select writes.',
    spec: variantsWith({ pick: { type: 'select', label: 'Pick', items: { from: 'variants.*.name' } } }),
    data: {},
    options: { language: 'en' },
    expected_html: withNode(EMPTY_COLLECTION, select('<option value="">select</option>')),
  },
  sourceError('group-source-unknown-member', 'A group source has only from and label; members are checked in declaration order before the field.',
    { type: 'text', items: { from: 5, value: 'name' } }, 'Invalid items.value at pick: unknown key'),
  sourceError('group-source-text-field', 'Only a choice field without lang takes a group source.',
    { type: 'text', items: { from: 'variants.*.name' } }, 'Invalid items.from at pick: expected a choice field without lang'),
  sourceError('group-source-from-without-rows', 'from names the rows of the group with *.',
    { type: 'select', items: { from: 'variants.name' } }, SOURCE_FROM),
  sourceError('group-source-from-missing-field', 'The field of from is a direct child of the group.',
    { type: 'select', items: { from: 'variants.*.code' } }, SOURCE_FROM),
  sourceError('group-source-label-missing', 'label names a direct child field of the group.',
    { type: 'select', items: { from: 'variants.*.name', label: 'title' } },
    'Invalid items.label at pick: expected the name of a direct child field of the group without multiple, properties or lang'),
];

/** The requirements each case tests. */
export const GROUP_SOURCE_REQUIREMENTS: Record<string, readonly string[]> = {
  'group-source-select-rows': ['CUSC-061', 'CUSC-062', 'CUSC-063'],
  'group-source-multichoice-skips-rows': ['CUSC-061', 'CUSC-062', 'CUSC-063'],
  'group-source-without-rows': ['CUSC-063'],
  'group-source-unknown-member': ['CUSC-064'],
  'group-source-text-field': ['CUSC-065'],
  'group-source-from-without-rows': ['CUSC-066'],
  'group-source-from-missing-field': ['CUSC-066'],
  'group-source-label-missing': ['CUSC-067'],
};
