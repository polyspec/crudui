/**
 * Form rendering cases of the structured condition editor (docs/spec/schema.md, Structured condition
 * editor; docs/spec/form-markup.md, Structured condition editor): the editor of a value that it shows,
 * the named error and visible text of a value that it does not show, and the compilation failures of
 * design.editor and options.fields. The expected HTML is written by hand from the specification and the
 * form markup; never regenerated from a renderer.
 */

const G = (properties: Record<string, unknown>) => ({ type: 'group', properties });

const MESSAGES = {
  en: { mode: 'Condition mode', comparison: 'Add condition', group: 'Add group', judge: 'Add judgement', remove: 'Remove', save: 'Save', actions: 'Form actions',
    invalid: (path: string) => `The value of ${path} is not a condition tree that conditionTree accepts; correct the text.` },
  ko: { mode: '조건 방식', comparison: '조건 추가', group: '그룹 추가', judge: '판정 추가', remove: '제거', save: '저장', actions: '폼 작업',
    invalid: (path: string) => `${path}의 값은 conditionTree가 받는 조건 트리가 아닙니다. 텍스트를 고치십시오.` },
};
type Language = keyof typeof MESSAGES;

const OPS = ['eq', 'ne', 'lt', 'le', 'gt', 'ge', 'in', 'has'];

/** Text of an attribute value or of an element, escaped as the normalized markup writes it. */
const escapeText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = (text: string) => escapeText(text).replace(/"/g, '&quot;');

const button = (action: string, label: string) =>
  `<button class="crudui-action crudui-action--text" data-condition-action="${action}" type="button">${label}</button>`;
const option = (value: string, selected: boolean) =>
  `<option${selected ? ' selected=""' : ''} value="${escapeAttribute(value)}">${escapeText(value)}</option>`;

type Node =
  | { kind: 'group'; path: string; mode: 'all' | 'any'; items: Node[] }
  | { kind: 'comparison'; path: string; field: string; op: string; value: string }
  | { kind: 'judge'; path: string; text: string };

interface Editor { language: Language; judge: boolean; fields: string[] | null }

function nodeHtml(node: Node, editor: Editor): string {
  const m = MESSAGES[editor.language];
  const remove = node.path === '' ? '' : button('remove', m.remove);
  if (node.kind === 'group') {
    return `<fieldset class="crudui-condition__group" data-condition-path="${node.path}">` +
      `<select aria-label="${m.mode}" class="crudui-condition__mode" data-condition-part="mode">${option('all', node.mode === 'all')}${option('any', node.mode === 'any')}</select>` +
      `<ol class="crudui-condition__list">${node.items.map((item) => `<li class="crudui-condition__item">${nodeHtml(item, editor)}</li>`).join('')}</ol>` +
      button('add-comparison', m.comparison) + button('add-group', m.group) + (editor.judge ? button('add-judge', m.judge) : '') + remove + '</fieldset>';
  }
  if (node.kind === 'judge') {
    return `<div class="crudui-condition__judge" data-condition-path="${node.path}"><input class="crudui-condition__text" data-condition-part="judge" value="${escapeAttribute(node.text)}">${remove}</div>`;
  }
  const field = editor.fields === null
    ? `<input class="crudui-condition__field" data-condition-part="field" value="${escapeAttribute(node.field)}">`
    : `<select class="crudui-condition__field" data-condition-part="field">${editor.fields.includes(node.field) ? '' : option(node.field, true)}${editor.fields.map((name) => option(name, name === node.field)).join('')}</select>`;
  return `<div class="crudui-condition__comparison" data-condition-path="${node.path}">${field}` +
    `<select class="crudui-condition__op" data-condition-part="op">${OPS.map((op) => option(op, op === node.op)).join('')}</select>` +
    `<input class="crudui-condition__value" data-condition-part="value" value="${escapeAttribute(node.value)}">${remove}</div>`;
}

const TEXTAREA = (name: string, text: string, hidden: boolean) =>
  `<textarea class="valid-target crudui-input crudui-input--condition" data-crudui-value="json" data-default="" data-name="${name}" data-rule-name="${name}"${hidden ? ' hidden=""' : ''} id="crudui:${name}" name="${name}" rows="5">${escapeText(text)}</textarea>`;

/** The complete form of one field `name` with the label `label` whose widget is `widget`. */
const form = (name: string, label: string, widget: string, language: Language) =>
  `<div class="crudui-form"><div class="crudui-form__body"><div class="crudui-node crudui-node--field" data-field-path="${name}"><div class="crudui-node__header"><label class="crudui-node__label" for="crudui:${name}">${label}</label></div><div class="crudui-node__body">${widget}</div></div></div>` +
  `<div class="crudui-form__footer"><div aria-label="${MESSAGES[language].actions}" class="crudui-controls" role="group"><button class="crudui-action crudui-action--text" type="submit">${MESSAGES[language].save}</button></div></div></div>`;

const shown = (name: string, text: string, root: Node, editor: Editor) =>
  `<div class="crudui-widget crudui-widget--condition">${TEXTAREA(name, text, true)}<div class="crudui-condition" data-condition-for="crudui:${name}">${nodeHtml(root, editor)}</div></div>`;
const refused = (name: string, text: string, language: Language) =>
  `<div class="crudui-widget crudui-widget--condition"><p class="crudui-condition__error" role="alert">${escapeText(MESSAGES[language].invalid(name))}</p>${TEXTAREA(name, text, false)}</div>`;

const editorField = (validate: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  G({ pass: { type: 'condition', label: 'Pass', validate, design: { editor: 'structured' }, ...extra } });

const TREE = {
  any: [
    { field: 'clues.size', op: 'ge', value: 2 },
    { all: [{ field: 'mood', op: 'in', value: ['a', 1] }] },
    { judge: 'Jian finds it.' },
  ],
};
const FIELDS = ['clues.size', 'episodes.e1.status'];
const TREE_ROOT: Node = {
  kind: 'group', path: '', mode: 'any', items: [
    { kind: 'comparison', path: '/any/0', field: 'clues.size', op: 'ge', value: '2' },
    { kind: 'group', path: '/any/1', mode: 'all', items: [{ kind: 'comparison', path: '/any/1/all/0', field: 'mood', op: 'in', value: '["a",1]' }] },
    { kind: 'judge', path: '/any/2', text: 'Jian finds it.' },
  ],
};

const ERROR = (message: string) => ({ code: 'INVALID_FORM_INPUT', message });
const FIELDS_ERROR = ERROR('Invalid options.fields at pass: expected distinct field names of a structured condition editor');

export const CONDITION_EDITOR_CASES = [
  {
    name: 'condition-editor-tree',
    note: 'A structured editor writes the tree as nested controls under the hidden textarea: groups with their mode and buttons, comparisons with the field select of options.fields (a field outside the list first as its own option), the eight ops and the value text, and judged text under conditionTree: judge.',
    spec: editorField({ conditionTree: 'judge' }, { options: { fields: FIELDS } }),
    data: { pass: TREE },
    options: { language: 'en', idPrefix: "a'b" },
    expected_html: form('pass', 'Pass', shown('pass', JSON.stringify(TREE), TREE_ROOT, { language: 'en', judge: true, fields: FIELDS }), 'en').replace(/crudui:/g, "a'b:"),
  },
  {
    name: 'condition-editor-empty',
    note: 'An empty value is an empty all group; without options.fields and under conditionTree: true the group offers no judged text.',
    spec: editorField({ conditionTree: true }),
    data: {},
    options: { language: 'en' },
    expected_html: form('pass', 'Pass', shown('pass', '', { kind: 'group', path: '', mode: 'all', items: [] }, { language: 'en', judge: false, fields: null }), 'en'),
  },
  {
    name: 'condition-editor-empty-parts',
    note: 'A comparison that the editor added starts with an empty field and value, and the editor shows it with the typed field input.',
    spec: editorField({ conditionTree: true }),
    data: { pass: { all: [{ field: '', op: 'eq', value: '' }] } },
    options: { language: 'en' },
    expected_html: form('pass', 'Pass', shown('pass', '{"all":[{"field":"","op":"eq","value":""}]}',
      { kind: 'group', path: '', mode: 'all', items: [{ kind: 'comparison', path: '/all/0', field: '', op: 'eq', value: '' }] },
      { language: 'en', judge: false, fields: null }), 'en'),
  },
  {
    name: 'condition-editor-judge-under-true',
    note: 'A judged text under conditionTree: true is not a value that the editor shows: the textarea stays visible with the text and a named error, in Korean.',
    spec: editorField({ conditionTree: true }),
    data: { pass: { all: [{ judge: 'x' }] } },
    options: { language: 'ko' },
    expected_html: form('pass', 'Pass', refused('pass', '{"all":[{"judge":"x"}]}', 'ko'), 'ko'),
  },
  {
    name: 'condition-editor-text-value',
    note: 'A string that is no tree stays the data of the field: the textarea shows it with the named error, and no editor is written.',
    spec: editorField({ conditionTree: 'judge' }),
    data: { pass: 'not a tree' },
    options: { language: 'en' },
    expected_html: form('pass', 'Pass', refused('pass', 'not a tree', 'en'), 'en'),
  },
  {
    name: 'condition-editor-text',
    note: 'design.editor: text writes the textarea of a condition field.',
    spec: G({ pass: { type: 'condition', label: 'Pass', validate: { conditionTree: true }, design: { editor: 'text' } } }),
    data: { pass: { all: [] } },
    options: { language: 'en' },
    expected_html: form('pass', 'Pass', `<div class="crudui-widget">${TEXTAREA('pass', '{"all":[]}', false)}</div>`, 'en'),
  },
  {
    name: 'condition-editor-unknown',
    note: 'design.editor of a condition field is text or structured.',
    spec: G({ pass: { type: 'condition', label: 'Pass', validate: { conditionTree: true }, design: { editor: 'tree' } } }),
    options: { language: 'en' },
    expectError: ERROR('Invalid design.editor at pass: expected text or structured'),
  },
  {
    name: 'condition-editor-on-text',
    note: 'design.editor is a member of condition fields only.',
    spec: G({ note: { type: 'text', label: 'Note', design: { editor: 'structured' } } }),
    options: { language: 'en' },
    expectError: ERROR('Invalid design.editor at note: unknown key'),
  },
  {
    name: 'condition-fields-text-editor',
    note: 'options.fields belongs to a structured editor, not to the textarea.',
    spec: G({ pass: { type: 'condition', label: 'Pass', validate: { conditionTree: true }, options: { fields: ['a'] } } }),
    options: { language: 'en' },
    expectError: FIELDS_ERROR,
  },
  {
    name: 'condition-fields-repeated',
    note: 'options.fields names each field once.',
    spec: editorField({ conditionTree: true }, { options: { fields: ['a', 'a'] } }),
    options: { language: 'en' },
    expectError: FIELDS_ERROR,
  },
  {
    name: 'condition-fields-blank',
    note: 'A name of options.fields is not empty after trimming.',
    spec: editorField({ conditionTree: true }, { options: { fields: [' '] } }),
    options: { language: 'en' },
    expectError: FIELDS_ERROR,
  },
];

const RENDERED = ['CUMK-001', 'CUMK-002', 'CUMK-003', 'CUMK-011', 'CUMK-066'];
export const CONDITION_EDITOR_REQUIREMENTS: Record<string, readonly string[]> = {
  'condition-editor-tree': [...RENDERED, 'CUMK-067', 'CUSC-085', 'CUSC-086'],
  'condition-editor-empty': [...RENDERED, 'CUMK-067', 'CUSC-085', 'CUSC-086'],
  'condition-editor-empty-parts': [...RENDERED, 'CUMK-067', 'CUSC-086'],
  'condition-editor-judge-under-true': [...RENDERED, 'CUMK-068', 'CUSC-085', 'CUSC-086'],
  'condition-editor-text-value': [...RENDERED, 'CUMK-068', 'CUSC-086'],
  'condition-editor-text': [...RENDERED, 'CUSC-083'],
  'condition-editor-unknown': ['CUSC-083'],
  'condition-editor-on-text': ['CUSC-083'],
  'condition-fields-text-editor': ['CUSC-084'],
  'condition-fields-repeated': ['CUSC-084'],
  'condition-fields-blank': ['CUSC-084'],
};
