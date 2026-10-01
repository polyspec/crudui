/**
 * Complete form cases written from docs/spec/form-runtime.md ("Complete form").
 *
 * Each case renders a form instance with `renderForm(form, render)`. `expected_html` is written
 * here from the specification and never rendered: the field, group, collection, row and footer
 * markup is the markup the form-render fixture defines, and the form element, hidden inputs and
 * error elements are added where the specification places them.
 *
 * Run from the repository root: node tests/fixtures/form-complete/generate.mjs > tests/fixtures/form-complete/cases.json
 */

const FOOTER = '<div class="crudui-form__footer"><div class="crudui-controls" role="group" aria-label="Form actions">'
  + '<button type="submit" class="crudui-action crudui-action--text">Save</button></div></div>';

/** The `crudui-node__errors` slot with one paragraph per escaped message. */
const nodeErrors = (...messages) => messages.length
  ? `<div class="crudui-node__errors">${messages.map(text => `<p class="crudui-node__error">${text}</p>`).join('')}</div>` : '';
/** The `crudui-form__errors` element with one paragraph per escaped message. */
const formErrors = (...messages) => messages.length
  ? `<div class="crudui-form__errors">${messages.map(text => `<p class="crudui-form__error">${text}</p>`).join('')}</div>` : '';
/** The `crudui-form` block. */
const block = (errors, body) => `<div class="crudui-form">${errors}<div class="crudui-form__body">${body}</div>${FOOTER}</div>`;

const EMAIL_SPEC = { type: 'group', properties: { email: { type: 'text', label: 'Email' } } };
const EMAIL_DATA = { email: 'a@b' };
const email = (...errors) => '<div class="crudui-node crudui-node--field" data-field-path="email"><div class="crudui-node__header">'
  + '<label class="crudui-node__label" for="crudui:email">Email</label></div><div class="crudui-node__body"><div class="crudui-widget">'
  + '<input type="text" class="valid-target crudui-input" data-name="email" data-rule-name="email" data-default="" id="crudui:email" name="email" value="a@b"/>'
  + `</div></div>${nodeErrors(...errors)}</div>`;

const NESTED_SPEC = { type: 'group', properties: {
  tags: { type: 'text', multiple: 'only', label: 'Tags' },
  addr: { type: 'group', label: 'Address', properties: { city: { type: 'select', label: 'City', items: { s: 'Seoul' } } } },
  note: { type: 'text', label: 'Note', design: { show: false } },
} };
const NESTED_DATA = { tags: { k1: 'x' }, addr: { city: 's' }, note: 'n' };
const nested = ({ tags = [], row = [], addr = [], city = [], note = [] }) =>
  '<div class="crudui-node crudui-node--collection" data-field-path="tags"><div class="crudui-node__header"><span class="crudui-node__label">Tags</span>'
  + '<span class="crudui-node__count">Rows: 1</span></div><div class="crudui-node__body">'
  + '<div class="crudui-node crudui-node--row" data-crudui-row-key="k1"><div class="crudui-node__header"><span class="crudui-node__label">Tags</span>'
  + '<span class="crudui-node__number">1</span></div><div class="crudui-node__body"><div class="crudui-widget">'
  + '<input type="text" class="valid-target crudui-input" data-name="tags[]" data-rule-name="tags[]" data-default="" id="crudui:tags.k1" name="tags[k1]" value="x"/>'
  + `</div></div>${nodeErrors(...row)}</div></div>${nodeErrors(...tags)}</div>`
  + '<div class="crudui-node crudui-node--group" data-field-path="addr"><div class="crudui-node__header"><span class="crudui-node__label">Address</span></div>'
  + '<div class="crudui-node__body"><div class="crudui-node crudui-node--field" data-field-path="addr.city"><div class="crudui-node__header">'
  + '<label class="crudui-node__label" for="crudui:addr.city">City</label></div><div class="crudui-node__body"><div class="crudui-widget">'
  + '<select name="addr[city]" class="valid-target crudui-input crudui-input--select" data-name="city" data-rule-name="addr[city]" data-default="" id="crudui:addr.city">'
  + `<option value="s" selected="">Seoul</option></select></div></div>${nodeErrors(...city)}</div></div>${nodeErrors(...addr)}</div>`
  + '<div class="crudui-node crudui-node--field" data-field-path="note" hidden=""><div class="crudui-node__header">'
  + '<label class="crudui-node__label" for="crudui:note">Note</label></div><div class="crudui-node__body"><div class="crudui-widget">'
  + '<input type="text" class="valid-target crudui-input" data-name="note" data-rule-name="note" data-default="" id="crudui:note" name="note" value="n"/>'
  + `</div></div>${nodeErrors(...note)}</div>`;

const BLOCKED = 'javascript:throw new Error(&#x27;React has blocked a javascript: URL as a security precaution.&#x27;)';
const OPTIONS = { language: 'en' };
const record = (path, message) => ({ path, field: path.split('.').pop(), rule: 'required', message, value: '' });

const ok = (name, note, spec, data, render, expected_html) => ({ name, note, spec, data, options: OPTIONS, render, expected_html });
const failure = (name, note, render, message) => ({
  name, note, spec: EMAIL_SPEC, data: EMAIL_DATA, options: OPTIONS, render, expectError: { code: 'INVALID_FORM_INPUT', message },
});

const cases = [
  ok('complete-form', 'the form element, a hidden field, a form error and a field error; attribute and text values are escaped.',
    EMAIL_SPEC, EMAIL_DATA,
    { action: { method: 'post', url: '/sign-in' }, hidden: { _csrf: 't<&>"\'' }, formErrors: ['Sign-in failed.'], errors: [record('email', 'Enter <email> & retry.')] },
    '<form action="/sign-in" method="post"><input type="hidden" name="_csrf" value="t&lt;&amp;&gt;&quot;&#x27;"/>'
    + block(formErrors('Sign-in failed.'), email('Enter &lt;email&gt; &amp; retry.')) + '</form>'),
  ok('template-action', 'each form attribute takes the render member, or the template action member when the render action has none.',
    { ...EMAIL_SPEC, action: { method: 'post', url: '/save', enctype: 'multipart/form-data' } }, EMAIL_DATA,
    { action: { url: '/members/42?a=1&b=2' } },
    '<form action="/members/42?a=1&amp;b=2" encType="multipart/form-data" method="post">' + block('', email()) + '</form>'),
  ok('empty-action', 'an empty render action without a template action writes a form element without attributes.',
    EMAIL_SPEC, EMAIL_DATA, { action: {} }, '<form>' + block('', email()) + '</form>'),
  ok('hidden-order', 'hidden inputs follow member order and an empty value is written.',
    EMAIL_SPEC, EMAIL_DATA, { action: { method: 'post' }, hidden: { b: '2', a: '', _csrf: 'x' } },
    '<form method="post"><input type="hidden" name="b" value="2"/><input type="hidden" name="a" value=""/><input type="hidden" name="_csrf" value="x"/>'
    + block('', email()) + '</form>'),
  ok('javascript-url', 'a JavaScript URL in the form action is replaced by the blocked URL.',
    EMAIL_SPEC, EMAIL_DATA, { action: { url: ' javascript:alert(1)' } }, `<form action="${BLOCKED}">` + block('', email()) + '</form>'),
  ok('empty-options', 'empty options write the crudui-form block alone.', EMAIL_SPEC, EMAIL_DATA, {}, block('', email())),
  ok('errors-without-action', 'errors without action write no form element; an empty form error list writes nothing.',
    EMAIL_SPEC, EMAIL_DATA, { formErrors: [], errors: [{ path: 'email', message: 'Required.' }] }, block('', email('Required.'))),
  ok('form-errors-order', 'form errors keep list order.', EMAIL_SPEC, EMAIL_DATA, { formErrors: ['First.', 'Second.'] },
    block(formErrors('First.', 'Second.'), email())),
  ok('node-errors', 'collection, row, group, field and hidden field errors follow each node body in list order.',
    NESTED_SPEC, NESTED_DATA,
    { errors: [record('addr.city', 'City one.'), record('tags', 'Tags.'), record('tags.k1', 'Row.'), record('addr', 'Address.'), record('addr.city', 'City two.'), record('note', 'Note.')] },
    block('', nested({ tags: ['Tags.'], row: ['Row.'], addr: ['Address.'], city: ['City one.', 'City two.'], note: ['Note.'] }))),

  failure('options-not-object', 'render options are an object.', 5, 'Render options must be an object'),
  failure('options-list', 'a list is not render options.', ['action'], 'Render options must be an object'),
  failure('unknown-option', 'the first unknown member in member order is reported before other checks.',
    { zeta: 1, action: 'post', alpha: 2 }, 'Unknown render option: zeta'),
  failure('action-string', 'action is an object.', { action: 'post' }, 'action must be an object with string method, url and enctype'),
  failure('action-member', 'action has only method, url and enctype.', { action: { target: '_self' } }, 'action must be an object with string method, url and enctype'),
  failure('action-number', 'action members are strings.', { action: { method: 1 } }, 'action must be an object with string method, url and enctype'),
  failure('hidden-number', 'hidden values are strings.', { action: {}, hidden: { a: 1 } }, 'hidden must be an object of strings'),
  failure('hidden-list', 'hidden is an object.', { action: {}, hidden: ['a'] }, 'hidden must be an object of strings'),
  failure('hidden-without-action', 'hidden inputs need the form element.', { hidden: { a: '1' }, formErrors: 5 }, 'hidden requires action'),
  failure('form-errors-string', 'formErrors is a list.', { formErrors: 'x' }, 'formErrors must be a list of strings'),
  failure('form-errors-number', 'formErrors holds strings.', { formErrors: ['x', 1] }, 'formErrors must be a list of strings'),
  failure('errors-object', 'errors is a list.', { errors: { email: 'x' } }, 'errors must be a list of objects with string path and message'),
  failure('errors-message-missing', 'every error has a string message.', { errors: [{ path: 'email' }] }, 'errors must be a list of objects with string path and message'),
  failure('errors-path-number', 'every error has a string path.', { errors: [{ path: 1, message: 'x' }] }, 'errors must be a list of objects with string path and message'),
  failure('unknown-error-path', 'the first error whose path names no node is reported.',
    { errors: [{ path: 'email', message: 'a' }, { path: 'mail', message: 'b' }, { path: 'post', message: 'c' }] }, 'Unknown error path: mail'),
  failure('row-key-path', 'a lang-item or partial path names no node.', { errors: [{ path: 'email.x', message: 'a' }] }, 'Unknown error path: email.x'),
];

process.stdout.write(`${JSON.stringify(cases, null, 2)}\n`);
