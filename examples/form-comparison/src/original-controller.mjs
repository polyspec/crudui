const flush = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const parts = name => name.match(/[^\[\]]+/g).slice(1);
const valueAt = (data, path) => path.reduce((value, part) => value?.[part], data);
const inputName = path => `form${path.map(part => `[${part}]`).join('')}`;

function newKey(rows) {
  let key;
  do {
    key = '__' + Array.from(crypto.getRandomValues(new Uint8Array(7)), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 13) + '__';
  } while (Object.hasOwn(rows, key));
  return key;
}

/** Example application binding and row operations over the original rendering interface. */
export function originalController(element, mount, spec, language, keyed = false) {
  let data = {};
  const renderer = mount(element, spec, language);
  let pending = Promise.resolve();

  function getData() {
    const current = structuredClone(data);
    for (const input of element.querySelectorAll('input[name], textarea[name], select[name]')) {
      const path = parts(input.name);
      let target = current;
      for (let i = 0; i < path.length - 1; i++) target = target[path[i]] ??= /^\d+$/.test(path[i + 1]) ? [] : {};
      target[path.at(-1)] = input.type === 'checkbox' ? (input.checked ? input.value : '') : input.value;
    }
    return current;
  }
  function fieldAt(path) {
    let field = spec;
    for (let index = 0; index < path.length; index++) {
      const child = field.properties?.[path[index]];
      if (!child) break;
      field = child;
      if (field.multiple && index < path.length - 1) index++;
    }
    return field;
  }
  function prepare(row, field) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Expected a keyed row object');
    for (const [name, child] of Object.entries(field.properties ?? {})) {
      if (child.type !== 'group') continue;
      if (child.multiple) {
        if (row[name] === undefined) row[name] = { [newKey({})]: {} };
        if (!row[name] || Array.isArray(row[name]) || typeof row[name] !== 'object') throw new Error('Expected a keyed collection');
        for (const value of Object.values(row[name])) prepare(value, child);
      } else prepare(row[name] ??= {}, child);
    }
    return row;
  }
  function copyKeys(row, field) {
    for (const [name, child] of Object.entries(field.properties ?? {})) {
      if (child.type !== 'group') continue;
      if (child.multiple) {
        const rows = row[name] ?? {};
        const used = { ...rows };
        row[name] = Object.fromEntries(Object.values(rows).map(value => {
          const key = newKey(used); used[key] = true;
          return [key, copyKeys(value, child)];
        }));
      } else copyKeys(row[name], child);
    }
    return row;
  }
  function capture(next) {
    const active = element.ownerDocument.activeElement;
    if (!element.contains(active)) return null;
    const path = active.name ? parts(active.name) : [];
    const scroll = [];
    for (let parent = active.parentElement; parent; parent = parent.parentElement) scroll.push([parent, parent.scrollTop, parent.scrollLeft]);
    const wrapper = active.closest('.form-element-wrapper[name]');
    const row = active.closest('.input-group-wrapper[data-uniqid]');
    const emptyAddWrapper = active.matches('button.btn-plus') && row?.closest('.form-element-wrapper[name]') !== wrapper ? wrapper?.getAttribute('name') : null;
    return { active, emptyAddWrapper, path, owner: valueAt(next, path.slice(0, -1)), start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection, scroll };
  }
  function findPath(node, target, path = []) {
    if (node === target) return path;
    if (!node || typeof node !== 'object') return null;
    for (const [name, value] of Object.entries(node)) {
      const found = findPath(value, target, [...path, name]);
      if (found) return found;
    }
    return null;
  }
  async function render(next, focus) {
    const ownerPath = focus?.owner ? findPath(next, focus.owner) : null;
    const focusedName = focus?.path.length ? inputName(ownerPath ? [...ownerPath, focus.path.at(-1)] : focus.path) : null;
    data = structuredClone(next);
    renderer.load(data);
    await flush();
    for (const input of element.querySelectorAll('input[name],textarea[name],select[name]')) {
      const path = parts(input.name);
      const value = valueAt(data, path) ?? fieldAt(path).default ?? '';
      if (input.type === 'checkbox') input.checked = String(value) === input.value;
      else if (input.value !== String(value)) input.value = String(value);
    }
    if (focus) {
      let active = focusedName
        ? Array.from(element.querySelectorAll('[name]')).find(input => input.getAttribute('name') === focusedName)
        : element.contains(focus.active) ? focus.active : null;
      if (!active && focus.emptyAddWrapper) active = Array.from(element.querySelectorAll('button.btn-plus'))
        .find(button => button.closest('.form-element-wrapper[name]')?.getAttribute('name') === focus.emptyAddWrapper);
      active?.focus({ preventScroll: true });
      if (focus.start != null && active?.setSelectionRange) active.setSelectionRange(focus.start, focus.end, focus.direction);
      for (const [parent, top, left] of focus.scroll) { parent.scrollTop = top; parent.scrollLeft = left; }
    }
  }
  function clearSequences(row, field) {
    for (const [name, child] of Object.entries(field.properties)) {
      if (['company_seq', 'store_seq', 'department_seq'].includes(name)) row[name] = '';
      if (child.type === 'group' && child.multiple) for (const item of row[name] ?? []) clearSequences(item, child);
    }
    return row;
  }
  function onPointerDown(event) {
    const button = event.target.closest('button');
    if (event.button === 0 && button && !button.disabled && element.contains(element.ownerDocument.activeElement) &&
        element.ownerDocument.activeElement.matches('input,textarea,select')) event.preventDefault();
  }
  function onInput(event) {
    if (!event.target.matches('input[name],textarea[name],select[name]')) return;
    const next = getData(); const focus = capture(next);
    pending = pending.then(() => render(next, focus));
  }
  function onClick(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const action = ['plus', 'copy', 'minus', 'move-up', 'move-down'].find(name => button.classList.contains(`btn-${name}`));
    if (!action) return;
    const row = button.closest('.input-group-wrapper[data-uniqid]');
    const wrapper = button.closest('.form-element-wrapper[name]');
    const path = wrapper.getAttribute('name').replace(/-layer$/, '').split('.').slice(1).map(part => part.replace(/^#/, ''));
    const key = row?.closest('.form-element-wrapper[name]') === wrapper ? row.dataset.uniqid : undefined;
    const next = getData(); const focus = capture(next);
    const rows = valueAt(next, path);
    const field = fieldAt(path);
    if (keyed) {
      if (!rows || Array.isArray(rows) || typeof rows !== 'object') throw new Error('Expected a keyed collection');
      if (key === undefined ? action !== 'plus' || Object.keys(rows).length !== 0 : !Object.hasOwn(rows, key)) throw new Error('Expected an existing keyed row');
      const entries = Object.entries(rows);
      const index = entries.findIndex(([name]) => name === key);
      if (['plus', 'copy'].includes(action) && entries.length >= (field.multiple.max ?? Infinity)) return;
      if (action === 'plus') entries.splice(index + 1, 0, [newKey(rows), prepare({}, field)]);
      if (action === 'copy') entries.splice(index + 1, 0, [newKey(rows), copyKeys(structuredClone(rows[key]), field)]);
      if (action === 'minus') entries.splice(index, 1);
      if (action.startsWith('move-')) {
        const to = index + (action === 'move-up' ? -1 : 1);
        if (to < 0 || to >= entries.length) return;
        entries.splice(to, 0, entries.splice(index, 1)[0]);
      }
      valueAt(next, path.slice(0, -1))[path.at(-1)] = Object.fromEntries(entries);
    } else {
      const index = key === undefined ? -1 : Number(key.replace(/^#/, ''));
      if (!Array.isArray(rows) || !Number.isInteger(index) || (key === undefined && (action !== 'plus' || rows.length !== 0))) throw new Error('Expected an indexed repeat collection');
      if (['plus', 'copy'].includes(action) && rows.length >= (field.multiple.max ?? Infinity)) return;
      if (action === 'plus') rows.splice(index + 1, 0, {});
      if (action === 'copy') rows.splice(index + 1, 0, clearSequences(structuredClone(rows[index]), field));
      if (action === 'minus') rows.splice(index, 1);
      if (action.startsWith('move-')) {
        const to = index + (action === 'move-up' ? -1 : 1);
        if (to < 0 || to >= rows.length) return;
        rows.splice(to, 0, rows.splice(index, 1)[0]);
      }
    }
    event.preventDefault();
    pending = pending.then(() => render(next, focus));
  }
  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('input', onInput);
  element.addEventListener('click', onClick);
  return {
    template: renderer.template,
    fromSerializedTemplate: renderer.fromSerializedTemplate,
    referenceReads: renderer.referenceReads,
    load: next => {
      const focus = capture(data);
      const value = keyed ? prepare(structuredClone(next), spec) : next;
      pending = pending.then(() => render(value, focus)); return pending;
    },
    rekeyRows: changes => {
      const next = getData(); const focus = capture(next);
      for (const { path, oldKey, newKey } of changes) {
        const segments = path.split('.');
        const rows = valueAt(next, segments);
        if (!rows || !Object.hasOwn(rows, oldKey) || Object.hasOwn(rows, newKey)) throw new Error('Invalid saved row key change');
        valueAt(next, segments.slice(0, -1))[segments.at(-1)] = Object.fromEntries(Object.entries(rows).map(([key, value]) => [key === oldKey ? newKey : key, value]));
      }
      pending = pending.then(() => render(next, focus)); return pending;
    },
    getData, idle: () => pending,
    dispose: async () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('input', onInput);
      element.removeEventListener('click', onClick);
      await pending; await renderer.dispose();
    },
  };
}
