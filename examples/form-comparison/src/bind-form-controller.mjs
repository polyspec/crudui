const inputSegments = name => name.match(/[^\[\]]+/g)?.slice(1) ?? [];
const pathSegments = path => path.split('.').filter(Boolean);
const valueAt = (data, segments) => segments.reduce((value, segment) => value?.[segment], data);
const inputName = segments => `form${segments.map(segment => `[${segment}]`).join('')}`;

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function repeated(field) {
  return field.spec.multiple === true || record(field.spec.multiple);
}

function checkKey(key) {
  if (!/^__[0-9a-f]{13}__$/.test(key)) {
    throw new TypeError(`Invalid row key: ${key}`);
  }
}

function freshKey(rows) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(7));
    const key = `__${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 13)}__`;
    if (!Object.hasOwn(rows, key)) return key;
  }
  throw new Error('Unable to generate an unused row key');
}

function normalizeRow(field, value, path) {
  if (field.spec.type === 'group') return normalizeFields(field.children, value, path);
  if (value === undefined) return structuredClone(field.spec.default ?? '');
  return structuredClone(value);
}

/** Normalize record data; `path` is the full data path, empty at the root. */
function normalizeFields(fields, value, path = '') {
  if (value !== undefined && !record(value)) {
    throw new TypeError(path ? `Group data must be an object: ${path}` : 'Form data must be an object');
  }
  const data = value === undefined ? {} : structuredClone(value);
  for (const field of fields) {
    const raw = data[field.name];
    const fieldPath = path ? `${path}.${field.name}` : field.name;
    if (repeated(field)) {
      if (raw !== undefined && !record(raw)) {
        throw new TypeError(`Repeated data must be a keyed object: ${fieldPath}`);
      }
      const rows = raw === undefined ? { [freshKey({})]: undefined } : raw;
      data[field.name] = Object.fromEntries(Object.entries(rows).map(([key, row]) => {
        checkKey(key);
        return [key, normalizeRow(field, row, `${fieldPath}.${key}`)];
      }));
    } else if (field.spec.type === 'group') {
      data[field.name] = normalizeFields(field.children, raw, fieldPath);
    } else if (raw === undefined && Object.hasOwn(field.spec, 'default')) {
      data[field.name] = structuredClone(field.spec.default);
    }
  }
  return data;
}

function fieldAt(fields, segments) {
  let current = fields;
  let selected;
  for (let index = 0; index < segments.length; index++) {
    selected = current.find(field => field.name === segments[index]);
    if (!selected) throw new Error(`Unknown form path: ${segments.join('.')}`);
    if (repeated(selected) && index < segments.length - 1) index++;
    current = selected.children;
  }
  return selected;
}

function put(data, segments, value) {
  const parent = valueAt(data, segments.slice(0, -1));
  if (!record(parent)) throw new Error(`Unknown form path: ${segments.join('.')}`);
  parent[segments.at(-1)] = value;
}

function copyRow(field, value, path) {
  if (field.spec.type !== 'group') return structuredClone(value);
  const row = normalizeFields(field.children, value, path);
  for (const child of field.children) {
    if (!repeated(child)) continue;
    const rows = row[child.name];
    const used = {};
    row[child.name] = Object.fromEntries(Object.values(rows).map(item => {
      const key = freshKey(used);
      used[key] = true;
      return [key, copyRow(child, item, `${path}.${child.name}.${key}`)];
    }));
  }
  return row;
}

/** Bind current data through the public bindForm API and own application row state. */
export function bindFormController(element, mount, template, language, initialData = {}) {
  let data = normalizeFields(template.fields, initialData);
  const renderer = mount(element, template, language, data);
  let pending = Promise.resolve();
  let inputVersion = 0;
  const attributeOrder = new WeakMap();

  function controls() {
    return Array.from(element.querySelectorAll('input[name],textarea[name],select[name]'));
  }

  function rememberAttributeOrder() {
    for (const control of controls()) {
      if (!attributeOrder.has(control)) {
        attributeOrder.set(control, control.getAttributeNames());
      }
    }
  }

  function restoreAttributeOrder(control) {
    const initial = attributeOrder.get(control);
    const current = control.getAttributeNames();
    if (!initial) {
      attributeOrder.set(control, current);
      return;
    }
    const currentSet = new Set(current);
    const expected = [
      ...initial.filter(name => currentSet.has(name)),
      ...current.filter(name => !initial.includes(name)),
    ];
    if (expected.every((name, index) => current[index] === name)) return;
    const values = new Map(expected.map(name => [name, control.getAttribute(name)]));
    for (const name of expected) control.removeAttribute(name);
    for (const name of expected) control.setAttribute(name, values.get(name) ?? '');
  }

  function synchronizeControls() {
    for (const control of controls()) {
      restoreAttributeOrder(control);
      const value = valueAt(data, inputSegments(control.name));
      if (control.tagName === 'INPUT') {
        if (control.type === 'file') continue;
        if (control.type === 'date' || control.type === 'datetime-local') {
          control.value = control.getAttribute('value') ?? '';
          continue;
        }
        if (control.type === 'checkbox' || control.type === 'radio') {
          control.checked = Array.isArray(value)
            ? value.map(String).includes(control.value)
            : value !== undefined && value !== null
              && (value === true ? '1' : String(value)) === control.value;
          continue;
        }
      }
      if (control.tagName === 'SELECT' && control.multiple) {
        const selected = Array.isArray(value) ? value.map(String) : [];
        for (const option of control.options) option.selected = selected.includes(option.value);
      } else {
        control.value = value === undefined || value === null ? '' : String(value);
      }
    }
  }

  rememberAttributeOrder();

  function capture() {
    const active = element.ownerDocument.activeElement;
    if (!active || !element.contains(active)) return null;
    const scroll = [];
    for (let parent = active.parentElement; parent; parent = parent.parentElement) {
      scroll.push({ parent, top: parent.scrollTop, left: parent.scrollLeft });
    }
    const wrapper = active.closest('.form-element-wrapper[data-field-path]');
    const row = active.closest('.input-group-wrapper[data-uniqid]');
    return {
      active, name: active.getAttribute?.('name') ?? undefined,
      emptyCollection: active.matches?.('button.btn-plus')
        && row?.closest('.form-element-wrapper[data-field-path]') !== wrapper
        ? wrapper?.getAttribute('data-field-path') : undefined,
      start: active.selectionStart ?? null, end: active.selectionEnd ?? null,
      direction: active.selectionDirection ?? undefined, scroll,
    };
  }

  function restore(focus) {
    if (!focus) return;
    let active = element.contains(focus.active) ? focus.active
      : focus.name ? Array.from(element.querySelectorAll('[name]'))
        .find(control => control.getAttribute('name') === focus.name) : undefined;
    if (!active && focus.emptyCollection) {
      active = Array.from(element.querySelectorAll('button.btn-plus')).find(button =>
        button.closest('.form-element-wrapper[data-field-path]')
          ?.getAttribute('data-field-path') === focus.emptyCollection);
    }
    active?.focus({ preventScroll: true });
    if (focus.start !== null && active?.setSelectionRange) {
      active.setSelectionRange(focus.start, focus.end, focus.direction);
    }
    for (const position of focus.scroll) {
      position.parent.scrollTop = position.top;
      position.parent.scrollLeft = position.left;
    }
  }

  async function render(focus, version = inputVersion) {
    await renderer.load(data);
    synchronizeControls();
    if (version === inputVersion) restore(focus);
  }

  function schedule(next, focus, version = inputVersion) {
    data = normalizeFields(template.fields, next);
    pending = pending.then(() => version === inputVersion ? render(focus, version) : undefined);
    return pending;
  }

  function onPointerDown(event) {
    const button = event.target.closest?.('button');
    const active = element.ownerDocument.activeElement;
    if (event.button === 0 && button && !button.disabled && element.contains(active)
        && active.matches('input,textarea,select')) event.preventDefault();
  }

  function onInput(event) {
    const control = event.target;
    if (!control.matches?.('input[name],textarea[name],select[name]') || control.disabled) return;
    const segments = inputSegments(control.name);
    if (!segments.length) return;
    let value = control.value;
    if (control.type === 'checkbox') value = control.checked ? control.value : '';
    if (control.type === 'radio' && !control.checked) return;
    if (control.tagName === 'SELECT' && control.multiple) {
      value = Array.from(control.selectedOptions, option => option.value);
    }
    const next = structuredClone(data);
    if (Object.is(valueAt(next, segments), value)) return;
    put(next, segments, value);
    const focus = capture();
    const version = ++inputVersion;
    schedule(next, focus, version);
  }

  function onClick(event) {
    const button = event.target.closest?.('button');
    if (!button || button.disabled || !element.contains(button)) return;
    const action = ['plus', 'copy', 'minus', 'move-up', 'move-down']
      .find(name => button.classList.contains(`btn-${name}`));
    if (!action) return;
    const wrapper = button.closest('.form-element-wrapper[data-field-path]');
    const path = wrapper?.getAttribute('data-field-path');
    if (!path) return;
    const segments = pathSegments(path);
    const field = fieldAt(template.fields, segments);
    if (!repeated(field)) return;
    const row = button.closest('.input-group-wrapper[data-uniqid]');
    const key = row?.closest('.form-element-wrapper[data-field-path]') === wrapper
      ? row.getAttribute('data-uniqid') : undefined;
    const next = structuredClone(data);
    const rows = valueAt(next, segments);
    if (!record(rows)) throw new Error(`Not a keyed collection: ${path}`);
    const entries = Object.entries(rows);
    const index = key === undefined ? -1 : entries.findIndex(([name]) => name === key);
    if (key !== undefined && index < 0) throw new Error(`Unknown row: ${key}`);
    const settings = record(field.spec.multiple) ? field.spec.multiple : {};
    if (['plus', 'copy'].includes(action) && entries.length >= (settings.max ?? Infinity)) return;
    if (action === 'minus' && entries.length <= (settings.min ?? 0)) return;
    if (action === 'plus') {
      const created = freshKey(rows);
      entries.splice(index + 1, 0, [created, normalizeRow(field, undefined, `${path}.${created}`)]);
    } else if (action === 'copy') {
      const created = freshKey(rows);
      entries.splice(index + 1, 0, [created, copyRow(field, rows[key], `${path}.${created}`)]);
    } else if (action === 'minus') entries.splice(index, 1);
    else {
      const target = index + (action === 'move-up' ? -1 : 1);
      if (target < 0 || target >= entries.length) return;
      entries.splice(target, 0, entries.splice(index, 1)[0]);
    }
    put(next, segments, Object.fromEntries(entries));
    event.preventDefault();
    schedule(next, capture());
  }

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('input', onInput);
  element.addEventListener('change', onInput);
  element.addEventListener('click', onClick);

  return {
    template, fromSerializedTemplate: true,
    getData: () => structuredClone(data),
    load(next) { return schedule(next, capture()); },
    rekeyRows(changes) {
      const next = structuredClone(data);
      for (const { path, oldKey, newKey } of changes) {
        checkKey(newKey);
        const segments = pathSegments(path);
        const rows = valueAt(next, segments);
        if (!record(rows) || !Object.hasOwn(rows, oldKey) || Object.hasOwn(rows, newKey)) {
          throw new Error(`Invalid saved row key change: ${path}`);
        }
        put(next, segments, Object.fromEntries(Object.entries(rows)
          .map(([key, value]) => [key === oldKey ? newKey : key, value])));
      }
      return schedule(next, capture());
    },
    idle: () => pending,
    async dispose() {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('input', onInput);
      element.removeEventListener('change', onInput);
      element.removeEventListener('click', onClick);
      await pending;
      await renderer.dispose();
    },
  };
}
