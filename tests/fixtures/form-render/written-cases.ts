/**
 * Form rendering cases whose expected HTML is written from the specification: data-only
 * collections (docs/spec/schema.md, docs/spec/empty-collections.md, docs/spec/form-markup.md),
 * a hidden group that keeps its values (docs/spec/form-runtime.md), and fields that stay visible
 * because their design.show does not resolve to false (docs/spec/validation-rules.md, Evaluation),
 * and design.class and design.style strings that do not parse completely as expressions and
 * are therefore literal text (docs/spec/expressions.md).
 *
 * The HTML is the normalized markup the specification defines: rows of a `multiple: only`
 * collection have no row controls, an empty one renders its header and an empty body without
 * an add-row control, missing data is zero rows, and row keys come from the data verbatim.
 * Written by hand; never regenerated from a renderer.
 */

const G = (properties: Record<string, unknown>) => ({ type: 'group', properties });
const rows = (multiple: unknown) => G({
  variants: {
    type: 'group', label: 'Variants', multiple,
    properties: { name: { type: 'text', label: 'Name' }, price: { type: 'number', label: 'Price' } },
  },
});

const GROUP_ROWS = '<div class="crudui-form"><div class="crudui-form__body"><div class="crudui-node crudui-node--collection" data-field-path="variants"><div class="crudui-node__header"><span class="crudui-node__label">Variants</span><span class="crudui-node__count">Rows: 2</span></div><div class="crudui-node__body"><div class="crudui-node crudui-node--row" data-crudui-row-key="__opt_b2__"><div class="crudui-node__header"><button aria-controls="crudui:variants.__opt_b2__:body" aria-expanded="true" aria-label="Expand or collapse" class="crudui-action" data-crudui-action="toggle-row" type="button"></button><span class="crudui-node__label">Variants</span><span class="crudui-node__number">1</span><span class="crudui-node__summary" hidden="">Collapsed</span></div><div class="crudui-node__body" id="crudui:variants.__opt_b2__:body"><div class="crudui-node crudui-node--field" data-field-path="variants.__opt_b2__.name"><div class="crudui-node__header"><label class="crudui-node__label" for="crudui:variants.__opt_b2__.name">Name</label></div><div class="crudui-node__body"><div class="crudui-widget"><input class="valid-target crudui-input" data-default="" data-name="name" data-rule-name="variants[][name]" id="crudui:variants.__opt_b2__.name" name="variants[__opt_b2__][name]" type="text" value="Blue"></div></div></div><div class="crudui-node crudui-node--field" data-field-path="variants.__opt_b2__.price"><div class="crudui-node__header"><label class="crudui-node__label" for="crudui:variants.__opt_b2__.price">Price</label></div><div class="crudui-node__body"><div class="crudui-widget"><input class="valid-target crudui-input" data-default="" data-name="price" data-rule-name="variants[][price]" id="crudui:variants.__opt_b2__.price" name="variants[__opt_b2__][price]" step="any" type="number" value="2"></div></div></div></div></div><div class="crudui-node crudui-node--row" data-crudui-row-key="__opt_a1__"><div class="crudui-node__header"><button aria-controls="crudui:variants.__opt_a1__:body" aria-expanded="true" aria-label="Expand or collapse" class="crudui-action" data-crudui-action="toggle-row" type="button"></button><span class="crudui-node__label">Variants</span><span class="crudui-node__number">2</span><span class="crudui-node__summary" hidden="">Collapsed</span></div><div class="crudui-node__body" id="crudui:variants.__opt_a1__:body"><div class="crudui-node crudui-node--field" data-field-path="variants.__opt_a1__.name"><div class="crudui-node__header"><label class="crudui-node__label" for="crudui:variants.__opt_a1__.name">Name</label></div><div class="crudui-node__body"><div class="crudui-widget"><input class="valid-target crudui-input" data-default="" data-name="name" data-rule-name="variants[][name]" id="crudui:variants.__opt_a1__.name" name="variants[__opt_a1__][name]" type="text" value="Red"></div></div></div><div class="crudui-node crudui-node--field" data-field-path="variants.__opt_a1__.price"><div class="crudui-node__header"><label class="crudui-node__label" for="crudui:variants.__opt_a1__.price">Price</label></div><div class="crudui-node__body"><div class="crudui-widget"><input class="valid-target crudui-input" data-default="" data-name="price" data-rule-name="variants[][price]" id="crudui:variants.__opt_a1__.price" name="variants[__opt_a1__][price]" step="any" type="number" value="1"></div></div></div></div></div></div></div></div><div class="crudui-form__footer"><div aria-label="Form actions" class="crudui-controls" role="group"><button class="crudui-action crudui-action--text" type="submit">Save</button></div></div></div>';
const TITLED_STICKY_ROWS = '<div class="crudui-form"><div class="crudui-form__body"><div class="crudui-node crudui-node--collection" data-field-path="variants"><div class="crudui-node__header"><span class="crudui-node__label">Variants</span><span class="crudui-node__count">Rows: 2</span></div><div class="crudui-node__body"><div class="crudui-node crudui-node--row crudui-node--sticky" data-crudui-row-key="__opt_a1__" style="--crudui-sticky-depth: 0"><div class="crudui-node__header-container"><div class="crudui-node__header"><button aria-controls="crudui:variants.__opt_a1__:body" aria-expanded="true" aria-label="Expand or collapse" class="crudui-action" data-crudui-action="toggle-row" type="button"></button><span class="crudui-node__label">Variants</span><span class="crudui-node__number">1</span><span class="crudui-node__title">Red</span><span class="crudui-node__summary" hidden="">Collapsed</span></div></div><div class="crudui-node__body" id="crudui:variants.__opt_a1__:body"><div class="crudui-node crudui-node--field" data-field-path="variants.__opt_a1__.name"><div class="crudui-node__header"><label class="crudui-node__label" for="crudui:variants.__opt_a1__.name">Name</label></div><div class="crudui-node__body"><div class="crudui-widget"><input class="valid-target crudui-input" data-default="" data-name="name" data-rule-name="variants[][name]" id="crudui:variants.__opt_a1__.name" name="variants[__opt_a1__][name]" type="text" value="Red"></div></div></div></div></div><div class="crudui-node crudui-node--row crudui-node--sticky" data-crudui-row-key="__opt_b2__" style="--crudui-sticky-depth: 0"><div class="crudui-node__header-container"><div class="crudui-node__header"><button aria-controls="crudui:variants.__opt_b2__:body" aria-expanded="true" aria-label="Expand or collapse" class="crudui-action" data-crudui-action="toggle-row" type="button"></button><span class="crudui-node__label">Variants</span><span class="crudui-node__number">2</span><span class="crudui-node__title">(untitled)</span><span class="crudui-node__summary" hidden="">Collapsed</span></div></div><div class="crudui-node__body" id="crudui:variants.__opt_b2__:body"><div class="crudui-node crudui-node--field" data-field-path="variants.__opt_b2__.name"><div class="crudui-node__header"><label class="crudui-node__label" for="crudui:variants.__opt_b2__.name">Name</label></div><div class="crudui-node__body"><div class="crudui-widget"><input class="valid-target crudui-input" data-default="" data-name="name" data-rule-name="variants[][name]" id="crudui:variants.__opt_b2__.name" name="variants[__opt_b2__][name]" type="text" value=""></div></div></div></div></div></div></div></div><div class="crudui-form__footer"><div aria-label="Form actions" class="crudui-controls" role="group"><button class="crudui-action crudui-action--text" type="submit">Save</button></div></div></div>';
const EMPTY_COLLECTION = '<div class="crudui-form"><div class="crudui-form__body"><div class="crudui-node crudui-node--collection" data-field-path="variants"><div class="crudui-node__header"><span class="crudui-node__label">Variants</span><span class="crudui-node__count">Rows: 0</span></div><div class="crudui-node__body"></div></div></div><div class="crudui-form__footer"><div aria-label="Form actions" class="crudui-controls" role="group"><button class="crudui-action crudui-action--text" type="submit">Save</button></div></div></div>';
const SCALAR_ROWS = '<div class="crudui-form"><div class="crudui-form__body"><div class="crudui-node crudui-node--collection" data-field-path="tags"><div class="crudui-node__header"><span class="crudui-node__label">Tags</span><span class="crudui-node__count">Rows: 2</span></div><div class="crudui-node__body"><div class="crudui-node crudui-node--row" data-crudui-row-key="__opt_a1__"><div class="crudui-node__header"><span class="crudui-node__label">Tags</span><span class="crudui-node__number">1</span></div><div class="crudui-node__body"><div class="crudui-widget"><input class="valid-target crudui-input" data-default="" data-name="tags[]" data-rule-name="tags[]" id="crudui:tags.__opt_a1__" name="tags[__opt_a1__]" type="text" value="x"></div></div></div><div class="crudui-node crudui-node--row" data-crudui-row-key="__opt_b2__"><div class="crudui-node__header"><span class="crudui-node__label">Tags</span><span class="crudui-node__number">2</span></div><div class="crudui-node__body"><div class="crudui-widget"><input class="valid-target crudui-input" data-default="" data-name="tags[]" data-rule-name="tags[]" id="crudui:tags.__opt_b2__" name="tags[__opt_b2__]" type="text" value="y"></div></div></div></div></div></div><div class="crudui-form__footer"><div aria-label="Form actions" class="crudui-controls" role="group"><button class="crudui-action crudui-action--text" type="submit">Save</button></div></div></div>';
const HIDDEN_GROUP = '<div class="crudui-form"><div class="crudui-form__body"><div class="crudui-node crudui-node--field" data-field-path="is_display"><div class="crudui-node__header"><label class="crudui-node__label" for="crudui:is_display">Display</label></div><div class="crudui-node__body"><div class="crudui-widget"><input class="valid-target crudui-input" data-default="" data-name="is_display" data-rule-name="is_display" id="crudui:is_display" name="is_display" type="text" value="0"></div></div></div><div class="crudui-node crudui-node--group" data-field-path="display" hidden=""><div class="crudui-node__header"><span class="crudui-node__label">Details</span></div><div class="crudui-node__body"><div class="crudui-node crudui-node--field" data-field-path="display.code"><div class="crudui-node__header"><label class="crudui-node__label" for="crudui:display.code">Code</label></div><div class="crudui-node__body"><div class="crudui-widget"><input class="valid-target crudui-input" data-default="" data-name="code" data-rule-name="display[code]" id="crudui:display.code" name="display[code]" type="text" value="abc1"></div></div></div><div class="crudui-node crudui-node--collection" data-field-path="display.items"><div class="crudui-node__header"><span class="crudui-node__label">Items</span><span class="crudui-node__count">Rows: 1</span></div><div class="crudui-node__body"><div class="crudui-node crudui-node--row" data-crudui-row-key="__opt_a1__"><div class="crudui-node__header"><span class="crudui-node__label">Items</span><span class="crudui-node__number">1</span><div aria-label="Row controls" class="crudui-controls" role="group"><button aria-label="Add" class="crudui-action" data-crudui-action="add-row" type="button"></button><button aria-label="Remove" class="crudui-action" data-crudui-action="remove-row" type="button"></button></div></div><div class="crudui-node__body"><div class="crudui-widget"><input class="valid-target crudui-input" data-default="" data-name="items[]" data-rule-name="display[items][]" id="crudui:display.items.__opt_a1__" name="display[items][__opt_a1__]" type="text" value="kept"></div></div></div></div></div></div></div></div><div class="crudui-form__footer"><div aria-label="Form actions" class="crudui-controls" role="group"><button class="crudui-action crudui-action--text" type="submit">Save</button></div></div></div>';

const VISIBLE_NOTE = '<div class="crudui-form"><div class="crudui-form__body"><div class="crudui-node crudui-node--field" data-field-path="mode"><div class="crudui-node__header"><label class="crudui-node__label" for="crudui:mode">Mode</label></div><div class="crudui-node__body"><div class="crudui-widget"><input class="valid-target crudui-input" data-default="" data-name="mode" data-rule-name="mode" id="crudui:mode" name="mode" type="text" value="off"></div></div></div><div class="crudui-node crudui-node--field" data-field-path="note"><div class="crudui-node__header"><label class="crudui-node__label" for="crudui:note">Note</label></div><div class="crudui-node__body"><div class="crudui-widget"><input class="valid-target crudui-input" data-default="" data-name="note" data-rule-name="note" id="crudui:note" name="note" type="text" value="kept"></div></div></div></div><div class="crudui-form__footer"><div aria-label="Form actions" class="crudui-controls" role="group"><button class="crudui-action crudui-action--text" type="submit">Save</button></div></div></div>';

const FRACTIONAL_SCORE = '<div class="crudui-form"><div class="crudui-form__body"><div class="crudui-node crudui-node--field" data-field-path="score"><div class="crudui-node__header"><label class="crudui-node__label" for="crudui:score">Score</label></div><div class="crudui-node__body"><div class="crudui-widget"><input class="valid-target crudui-input" data-default="" data-name="score" data-rule-name="score" id="crudui:score" name="score" step="any" type="number" value="2886.5"></div></div></div></div><div class="crudui-form__footer"><div aria-label="Form actions" class="crudui-controls" role="group"><button class="crudui-action crudui-action--text" type="submit">Save</button></div></div></div>';

const LITERAL_CLASS_NOTE = VISIBLE_NOTE.replace(
  '<input class="valid-target crudui-input" data-default="" data-name="note"',
  '<input class="valid-target crudui-input modal fade in show" data-default="" data-name="note"'
);
const LITERAL_STYLE_NOTE = VISIBLE_NOTE.replace(
  'name="note" type="text"',
  'name="note" style="font-family: Made in Script" type="text"'
);

// Choice lists (docs/spec/schema.md, Choice lists): options in list order for any values.
const FOOTER_EN = '<div class="crudui-form__footer"><div aria-label="Form actions" class="crudui-controls" role="group"><button class="crudui-action crudui-action--text" type="submit">Save</button></div></div></div>';
const field = (path: string, label: string, body: string, labelFor = true) =>
  `<div class="crudui-form"><div class="crudui-form__body"><div class="crudui-node crudui-node--field" data-field-path="${path}"><div class="crudui-node__header">${labelFor ? `<label class="crudui-node__label" for="crudui:${path}">${label}</label>` : `<span class="crudui-node__label">${label}</span>`}</div><div class="crudui-node__body">${body}</div></div></div>${FOOTER_EN}`;
const YES_NO = [{ value: 1, label: 'Yes' }, { value: 0, label: 'No' }];
const SELECT_YES_NO = field('answer', 'Answer', '<div class="crudui-widget"><select class="valid-target crudui-input crudui-input--select" data-default="" data-name="answer" data-rule-name="answer" id="crudui:answer" name="answer"><option value="1">Yes</option><option selected="" value="0">No</option></select></div>');
const INDEX_LABELS = field('answer', 'Answer', '<div class="crudui-widget"><select class="valid-target crudui-input crudui-input--select" data-default="" data-name="answer" data-rule-name="answer" id="crudui:answer" name="answer"><option value="0">Yes</option><option selected="" value="1">No</option></select></div>');
const radio = (value: string, label: string, index: number, checked: boolean, isDefault: boolean) =>
  `<input autocomplete="off"${checked ? ' checked=""' : ''} class="valid-target crudui-choices__input" data-is-default="${isDefault ? '1' : ''}" data-name="agree" data-rule-name="agree" id="crudui:agree:${index}" name="agree" type="radio" value="${value}"><label class="crudui-choices__label" for="crudui:agree:${index}"><span>${label}</span></label>`;
const CHOICE_YES_NO = field('agree', 'Agree', `<div class="crudui-choices">${radio('1', 'Yes', 0, true, false)}${radio('0', 'No', 1, false, true)}</div>`, false);
const box = (value: string, label: string, index: number, checked: boolean) =>
  `<input autocomplete="off"${checked ? ' checked=""' : ''} class="valid-target crudui-choices__input" data-name="sizes" data-rule-name="sizes" id="crudui:sizes:${index}" name="sizes[]" type="checkbox" value="${value}"><label class="crudui-choices__label" for="crudui:sizes:${index}"><span>${label}</span></label>`;
const MULTICHOICE_MIXED = field('sizes', 'Sizes', `<div class="crudui-choices crudui-choices--multiple">${box('10', 'Ten', 0, false)}${box('2', 'Two', 1, true)}${box('b', 'Bee', 2, true)}</div>`, false);
const SEARCH_YES_NO = field('pick', 'Pick', '<style nonce="">[class~="crudui:pick_select2"] .loading-results { display: none; }</style><script nonce="">$(function() {select2(CSS.escape("crudui:pick"), "2", "250", "crudui:pick_select2");});</script><div class="crudui-widget crudui-widget--search"><select class="valid-target crudui-input crudui-input--select" data-api-server="" data-default="" data-delay="250" data-keyword-min-length="2" data-name="pick" data-rule-name="pick" id="crudui:pick" name="pick"><option selected="" value="1">Yes</option><option value="0">No</option></select></div>');
const DUMMY_NO = field('shown', 'Shown', '<div>No</div>', false);
const INVALID_ITEMS = (path: string) => ({ code: 'INVALID_FORM_INPUT', message: `Invalid items at ${path}: expected value and label pairs with distinct string or number values` });

export const WRITTEN_CASES = [
  {
    name: 'multiple-only-group-rows',
    note: 'multiple: only renders exactly the data rows in data order under their data keys; each row keeps its toggle, label and number and has no row controls.',
    spec: rows('only'),
    data: { variants: { __opt_b2__: { name: 'Blue', price: 2 }, __opt_a1__: { name: 'Red', price: 1 } } },
    options: { language: 'en' },
    expected_html: GROUP_ROWS,
  },
  {
    name: 'multiple-only-object-title-sticky',
    note: 'multiple.only: true combines with title and header: rows are titled and sticky, with no row controls.',
    spec: G({ variants: { type: 'group', label: 'Variants', multiple: { only: true, title: 'name', header: 'sticky' }, properties: { name: { type: 'text', label: 'Name' } } } }),
    data: { variants: { __opt_a1__: { name: 'Red' }, __opt_b2__: { name: '' } } },
    options: { language: 'en' },
    expected_html: TITLED_STICKY_ROWS,
  },
  {
    name: 'multiple-only-missing-data',
    note: 'Missing data of a multiple: only collection is zero rows, not an initial row: the header and an empty body render, with no footer and no add-row control.',
    spec: rows('only'),
    data: {},
    options: { language: 'en' },
    expected_html: EMPTY_COLLECTION,
  },
  {
    name: 'multiple-only-empty-data',
    note: 'An empty multiple: only collection renders its header and an empty body, with no add-row control.',
    spec: rows('only'),
    data: { variants: {} },
    options: { language: 'en' },
    expected_html: EMPTY_COLLECTION,
  },
  {
    name: 'multiple-only-scalar-rows',
    note: 'A repeated scalar declared multiple: only renders its data rows under their keys without row controls.',
    spec: G({ tags: { type: 'text', label: 'Tags', multiple: 'only' } }),
    data: { tags: { __opt_a1__: 'x', __opt_b2__: 'y' } },
    options: { language: 'en' },
    expected_html: SCALAR_ROWS,
  },
  {
    name: 'design-show-hidden-group-keeps-values',
    note: 'A group hidden by design.show carries the hidden attribute and still renders the values of its fields and rows, which stay part of native submission.',
    spec: G({
      is_display: { type: 'text', label: 'Display' },
      display: {
        type: 'group', label: 'Details', design: { show: '.is_display == 1' },
        properties: { code: { type: 'text', label: 'Code' }, items: { type: 'text', label: 'Items', multiple: true } },
      },
    }),
    data: { is_display: '0', display: { code: 'abc1', items: { __opt_a1__: 'kept' } } },
    options: { language: 'en' },
    expected_html: HIDDEN_GROUP,
  },
  {
    name: 'design-show-literal-string-visible',
    note: 'A design.show string that is not a valid expression is a literal and only false hides: the field renders without the hidden attribute.',
    spec: G({ mode: { type: 'text', label: 'Mode' }, note: { type: 'text', label: 'Note', design: { show: '.mode == (' } } }),
    data: { mode: 'off', note: 'kept' },
    options: { language: 'en' },
    expected_html: VISIBLE_NOTE,
  },
  {
    name: 'design-show-condition-map-without-selection',
    note: 'A design.show condition map that selects nothing leaves the field visible: only a resolved false hides.',
    spec: G({ mode: { type: 'text', label: 'Mode' }, note: { type: 'text', label: 'Note', design: { show: { ".mode == 'on'": false } } } }),
    data: { mode: 'off', note: 'kept' },
    options: { language: 'en' },
    expected_html: VISIBLE_NOTE,
  },
  {
    name: 'design-class-literal-string',
    note: 'A design.class string that does not parse completely as an expression is a literal: its text is the control class, even though it contains an operator word.',
    spec: G({ mode: { type: 'text', label: 'Mode' }, note: { type: 'text', label: 'Note', design: { class: 'modal fade in show' } } }),
    data: { mode: 'off', note: 'kept' },
    options: { language: 'en' },
    expected_html: LITERAL_CLASS_NOTE,
  },
  {
    name: 'design-style-literal-string',
    note: 'A design.style string that does not parse completely as an expression is a literal: its text is the control style, even though it contains an operator word.',
    spec: G({ mode: { type: 'text', label: 'Mode' }, note: { type: 'text', label: 'Note', design: { style: 'font-family: Made in Script' } } }),
    data: { mode: 'off', note: 'kept' },
    options: { language: 'en' },
    expected_html: LITERAL_STYLE_NOTE,
  },
  {
    name: 'number-any-step',
    note: 'A number control accepts any number natively (step="any"), so the step base taken from its value never makes another valid number a step mismatch; the step rule owns increments.',
    spec: G({ score: { type: 'number', label: 'Score', validate: { required: true, number: true, min: 0, max: 10000000 } } }),
    data: { score: 2886.5 },
    options: { language: 'en' },
    expected_html: FRACTIONAL_SCORE,
  },
  {
    name: 'choice-list-select-order',
    note: 'A select field lists a choice list in list order, so the integer-like values 1 and 0 show Yes before No; the option values are the canonical texts of the values.',
    spec: G({ answer: { type: 'select', label: 'Answer', items: YES_NO } }),
    data: { answer: 0 },
    options: { language: 'en' },
    expected_html: SELECT_YES_NO,
  },
  {
    name: 'choice-list-index-labels',
    note: 'An array of labels keeps its written order with the indexes as values.',
    spec: G({ answer: { type: 'select', label: 'Answer', items: ['Yes', 'No'] } }),
    data: { answer: '1' },
    options: { language: 'en' },
    expected_html: INDEX_LABELS,
  },
  {
    name: 'choice-list-choice-default',
    note: 'A choice field lists a choice list in list order with a translated label, checks the value and marks the default.',
    spec: G({ agree: { type: 'choice', label: 'Agree', default: 0, items: [{ value: 1, label: { en: 'Yes', ko: '예' } }, { value: 0, label: 'No' }] } }),
    data: { agree: 1 },
    options: { language: 'en' },
    expected_html: CHOICE_YES_NO,
  },
  {
    name: 'choice-list-multichoice-mixed-values',
    note: 'A multichoice field keeps the list order of string and number values.',
    spec: G({ sizes: { type: 'multichoice', label: 'Sizes', items: [{ value: '10', label: 'Ten' }, { value: 2, label: 'Two' }, { value: 'b', label: 'Bee' }] } }),
    data: { sizes: ['2', 'b'] },
    options: { language: 'en' },
    expected_html: MULTICHOICE_MIXED,
  },
  {
    name: 'choice-list-search-order',
    note: 'A search field lists a static choice list in list order.',
    spec: G({ pick: { type: 'search', label: 'Pick', items: YES_NO } }),
    data: { pick: 1 },
    options: { language: 'en' },
    expected_html: SEARCH_YES_NO,
  },
  {
    name: 'choice-list-dummy-label',
    note: 'A dummy field displays the label of its value from a choice list.',
    spec: G({ shown: { type: 'dummy', label: 'Shown', items: YES_NO } }),
    data: { shown: 0 },
    options: { language: 'en' },
    expected_html: DUMMY_NO,
  },
  {
    name: 'choice-list-extra-member',
    note: 'A choice list element has only value and label.',
    spec: G({ answer: { type: 'select', label: 'Answer', items: [{ value: 1, label: 'Yes', id: 1 }] } }),
    expectError: INVALID_ITEMS('answer'),
  },
  {
    name: 'choice-list-missing-label',
    note: 'A choice list element has a label.',
    spec: G({ answer: { type: 'choice', label: 'Answer', items: [{ value: 1 }] } }),
    expectError: INVALID_ITEMS('answer'),
  },
  {
    name: 'choice-list-mixed-elements',
    note: 'An array with one object that has a value member is a choice list, so a plain label in it is invalid.',
    spec: G({ answer: { type: 'select', label: 'Answer', items: ['Yes', { value: 0, label: 'No' }] } }),
    expectError: INVALID_ITEMS('answer'),
  },
  {
    name: 'choice-list-boolean-value',
    note: 'A choice list value is a string or a finite number.',
    spec: G({ answer: { type: 'multichoice', label: 'Answer', items: [{ value: true, label: 'Yes' }] } }),
    expectError: INVALID_ITEMS('answer'),
  },
  {
    name: 'choice-list-duplicate-value',
    note: 'Two choice list values with the same canonical text are invalid, here in a nested group and before the type is evaluated.',
    spec: G({ terms: { type: 'group', label: 'Terms', properties: { answer: { type: 'not-a-widget', label: 'Answer', items: [{ value: 1, label: 'Yes' }, { value: '1', label: 'One' }] } } } }),
    expectError: INVALID_ITEMS('terms.answer'),
  },
];
