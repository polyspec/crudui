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
  const row = key => control(inputName(key))?.closest('.input-group-wrapper[data-uniqid]')?.parentElement?.closest('.input-group-wrapper[data-uniqid]');
  const button = (key, action) => Array.from(row(key).querySelectorAll(`button.btn-${action}`))
    .find(b => b.closest('.input-group-wrapper[data-uniqid]') === row(key));
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

  control(inputName(storeKey)).setSelectionRange(1, 3, 'backward');
  const pointer = new element.ownerDocument.defaultView.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
  button(storeKey, 'plus').dispatchEvent(pointer);
  expect(pointer.defaultPrevented).toBe(true);
  button(storeKey, 'plus').click();
  await flush();
  expect(element.ownerDocument.activeElement.name).toBe(inputName(storeKey));
  expect(element.ownerDocument.activeElement.selectionStart).toBe(1);
  expect(element.ownerDocument.activeElement.selectionEnd).toBe(3);
  expect(element.ownerDocument.activeElement.selectionDirection).toBe('backward');
  const added = Object.keys(session.getValue(storesPath))[1];
  button(added, 'minus').click();
  await flush();

  button(storeKey, 'copy').click();
  await flush();
  const keys = Object.keys(session.getValue(storesPath));
  const copied = keys[1];
  expect(copied).not.toBe(storeKey);
  expect(control(inputName(copied)).value).toBe('서울 수정');
  button(copied, 'move-up').click();
  await flush();
  expect(Object.keys(session.getValue(storesPath))[0]).toBe(copied);
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
  expect(detail.closest('.form-element-wrapper').style.display).toBe('none');

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
  button(savedKey, 'minus').click();
  await flush();
  expect(session.getValue(storesPath)).toEqual({});
  const wrapper = Array.from(element.querySelectorAll('[data-field-path]')).find(node => node.dataset.fieldPath === storesPath);
  const emptyAdd = wrapper.querySelector('button.btn-plus');
  emptyAdd.focus();
  emptyAdd.click();
  await flush();
  expect(Object.keys(session.getValue(storesPath))).toHaveLength(1);
  expect(element.ownerDocument.activeElement.matches('button.btn-plus')).toBe(true);
  expect(element.ownerDocument.activeElement.closest('.form-element-wrapper')).toBe(wrapper);
}
