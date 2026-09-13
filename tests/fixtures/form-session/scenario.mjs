// The same nested form and browser lifecycle are exercised by every adapter.
export const companyKey = '__0000000000001__';
export const storeKey = companyKey; // Deliberate: replacement must be scoped by path.
export const otherStoreKey = '__0000000000002__';
export const spec = {
  type: 'group',
  properties: {
    companies: {
      type: 'group', multiple: { copy: true, sortable: true },
      properties: {
        name: { type: 'text' },
        stores: {
          type: 'group', multiple: { copy: true, sortable: true, max: 4 },
          properties: {
            name: { type: 'text', validate: { required: true } },
            enabled: { type: 'checkbox', default: 1 },
            nickname: { type: 'text', default: 'Default' },
            opened: { type: 'date' },
            detail: { type: 'textarea', design: { show: '.enabled' } },
            category: { type: 'select', items: { a: 'A', b: 'B' } },
            title: { type: 'text', lang: { only: ['ko', 'en'] } },
            departments: {
              type: 'group', multiple: true,
              properties: { name: { type: 'text' } },
            },
          },
        },
      },
    },
  },
};
export const data = {
  companies: {
    [companyKey]: {
      name: '회사',
      stores: {
        [storeKey]: { name: '서울', nickname: '', opened: '2026-09-07T10:00:00Z', enabled: 1, detail: '메모', category: 'a', title: { ko: '한국어', en: 'English' }, departments: { d1: { name: '영업' } } },
        [otherStoreKey]: { name: '부산', enabled: '', category: 'b', departments: {} },
      },
    },
  },
};
export const storesPath = `companies.${companyKey}.stores`;

/** Real DOM assertions shared by React, Vue and Svelte (no SSR-only shortcuts). */
export async function exerciseSessionDom({ element, session, flush, expect }) {
  const inputName = key => `form[companies][${companyKey}][stores][${key}][name]`;
  const control = (name) => Array.from(element.querySelectorAll('[name]')).find(el => el.getAttribute('name') === name);
  // Rows and actions are identified by attributes, never by style classes.
  const row = key => Array.from(element.querySelectorAll('[data-crudui-row-key]'))
    .find(node => node.getAttribute('data-crudui-row-key') === key &&
      node.parentElement.closest('[data-field-path]')?.getAttribute('data-field-path') === storesPath);
  const button = (key, action) => Array.from(row(key).querySelectorAll(`[data-crudui-action="${action}"]`))
    .find(b => b.closest('[data-crudui-row-key]') === row(key));
  const edit = async (input, value) => {
    input.focus();
    input.value = value;
    input.dispatchEvent(new element.ownerDocument.defaultView.Event('input', { bubbles: true }));
    await flush();
  };
  expect(element.querySelector('input')).toBeTruthy(); // mounted before loading a record
  session.setData(data);
  await flush();
  expect(control(inputName(storeKey)).value).toBe('서울');
  expect(control(inputName(storeKey).replace('[name]', '[nickname]')).value).toBe('');
  expect(control(inputName(storeKey).replace('[name]', '[opened]')).value).toBe('2026-09-07');
  await edit(control(inputName(storeKey)), '서울 수정');
  expect(session.getValue(`${storesPath}.${storeKey}.name`)).toBe('서울 수정');
  expect(element.ownerDocument.activeElement.name).toBe(inputName(storeKey));

  // A row operation moves focus to the first input of the row it affects.
  button(storeKey, 'add-row').click();
  await flush();
  const added = Object.keys(session.getValue(storesPath))[1];
  expect(element.ownerDocument.activeElement.name).toBe(inputName(added));
  button(added, 'remove-row').click();
  await flush();
  expect(element.ownerDocument.activeElement.name).toBe(inputName(storeKey));

  button(storeKey, 'copy-row').click();
  await flush();
  const keys = Object.keys(session.getValue(storesPath));
  const copied = keys[1];
  expect(copied).not.toBe(storeKey);
  expect(control(inputName(copied)).value).toBe('서울 수정');
  expect(element.ownerDocument.activeElement.name).toBe(inputName(copied));
  button(copied, 'move-up').click();
  await flush();
  expect(Object.keys(session.getValue(storesPath))[0]).toBe(copied);
  expect(element.ownerDocument.activeElement.name).toBe(inputName(copied));
  // Toggling keeps the focused toggle button of the same row.
  for (const expanded of ['false', 'true']) {
    button(copied, 'toggle-row').focus();
    button(copied, 'toggle-row').click();
    await flush();
    expect(element.ownerDocument.activeElement.getAttribute('data-crudui-action')).toBe('toggle-row');
    expect(element.ownerDocument.activeElement.closest('[data-crudui-row-key]')).toBe(row(copied));
    expect(element.ownerDocument.activeElement.getAttribute('aria-expanded')).toBe(expanded);
  }
  expect(control(inputName(storeKey)).value).toBe('서울 수정');

  const savedKey = '__0000000000042__';
  session.rekeyRow(storesPath, copied, savedKey);
  await flush();
  expect(control(inputName(copied))).toBeUndefined();
  expect(control(inputName(savedKey)).value).toBe('서울 수정');
  expect(control(inputName(storeKey)).value).toBe('서울 수정');
  expect(control(inputName(otherStoreKey)).value).toBe('부산');
  expect(control(inputName(savedKey)).getAttribute('data-rule-name')).toBe('companies[][stores][][name]');

  const checkboxName = inputName(savedKey).replace('[name]', '[enabled]');
  control(checkboxName).click();
  await flush();
  expect(session.getValue(`${storesPath}.${savedKey}.enabled`)).toBe('');
  const detail = control(inputName(savedKey).replace('[name]', '[detail]'));
  expect(detail.closest('[data-field-path]').hidden).toBe(true);

  // Inject a new record over dirty controls, including textarea/select/lang/checkbox.
  session.setData({ companies: { [companyKey]: { stores: {
    [savedKey]: { name: '저장값', enabled: 1, detail: '새 메모', category: 'b', title: { ko: '새 제목', en: 'New' }, departments: {} },
  } } } });
  await flush();
  expect(control(inputName(savedKey)).value).toBe('저장값');
  expect(control(checkboxName).checked).toBe(true);
  expect(control(inputName(savedKey).replace('[name]', '[detail]')).value).toBe('새 메모');
  expect(control(inputName(savedKey).replace('[name]', '[category]')).value).toBe('b');
  expect(control(inputName(savedKey).replace('[name]', '[title][en]')).value).toBe('New');
  button(savedKey, 'remove-row').click();
  await flush();
  expect(session.getValue(storesPath)).toEqual({});
  // Removing the last row focuses the enclosing company row.
  expect(element.ownerDocument.activeElement.name).toBe(`form[companies][${companyKey}][name]`);
  const wrapper = Array.from(element.querySelectorAll('[data-field-path]')).find(node => node.dataset.fieldPath === storesPath);
  const emptyAdd = wrapper.querySelector('[data-crudui-action="add-row"]');
  emptyAdd.focus();
  emptyAdd.click();
  await flush();
  const [first] = Object.keys(session.getValue(storesPath));
  expect(element.ownerDocument.activeElement.name).toBe(inputName(first));
}
