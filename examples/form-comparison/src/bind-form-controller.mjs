import {
  bindForm, canUndo, emptyHistory, initialView, recordChange, rekeyRowView, removeRowView,
  resolveAction, setAllExpandedView, toggleRowView, undoChange,
} from '@crudui/generator-core';

const inputSegments = name => name.match(/[^[\]]+/g)?.slice(1) ?? [];
const pathSegments = path => path.split('.').filter(Boolean);
const valueAt = (data, segments) => segments.reduce((value, segment) => value?.[segment], data);

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

/**
 * Bind current data through the public bindForm API and own application row state.
 * `start` renders the normalized record and returns the renderer; a renderer that finishes
 * later, such as a hydrating one, reports that with `rendered`.
 */
export function bindFormController(element, start, template, language, initialData = {}) {
  let data = normalizeFields(template.fields, initialData);
  const renderer = start(data);
  let pending = Promise.resolve(renderer.rendered);
  let inputVersion = 0;

  function controls() {
    return Array.from(element.querySelectorAll('input[name],textarea[name],select[name]'));
  }

  function synchronizeControls() {
    for (const control of controls()) {
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


  // View state and history live outside the record data and follow generator-core's rules.
  let view = initialView();
  let history = emptyHistory();

  function capture() {
    const active = element.ownerDocument.activeElement;
    if (!active || !element.contains(active)) return null;
    return {
      active, name: active.getAttribute?.('name') ?? undefined,
      action: active.matches?.('button[data-crudui-action]') ? resolveAction(active) : undefined,
      start: active.selectionStart ?? null, end: active.selectionEnd ?? null,
      direction: active.selectionDirection ?? undefined,
      visible: active.matches(':focus-visible'),
    };
  }

  /** The rendered button requesting the same action on the same path and key. */
  function actionButton(target) {
    return Array.from(element.querySelectorAll('button[data-crudui-action]')).find(button => {
      const other = resolveAction(button);
      return other?.name === target.name && other.path === target.path && other.key === target.key;
    });
  }

  function restore(focus) {
    if (!focus) return;
    const active = element.contains(focus.active) ? focus.active
      : focus.action ? actionButton(focus.action)
        : focus.name ? Array.from(element.querySelectorAll('[name]'))
          .find(control => control.getAttribute('name') === focus.name) : undefined;
    active?.focus({ preventScroll: true, focusVisible: focus.visible });
    if (focus.start !== null && active?.setSelectionRange) {
      active.setSelectionRange(focus.start, focus.end, focus.direction);
    }
  }

  const pathOf = node => node.closest('[data-field-path]')?.getAttribute('data-field-path');

  // The form renders before the structure map, so the first matching element is the form's.
  function scopeElement(path) {
    return Array.from(element.querySelectorAll('[data-field-path]'))
      .find(node => node.getAttribute('data-field-path') === path);
  }

  function rowElement(path, key) {
    const scope = scopeElement(path);
    return Array.from(scope?.querySelectorAll('[data-crudui-row-key]') ?? []).find(node =>
      node.getAttribute('data-crudui-row-key') === key
      && node.parentElement.closest('[data-field-path]') === scope);
  }

  /** A row's first enabled visible input, or its own toggle or Add button when it has none. */
  function firstRowControl(row) {
    const own = action => Array.from(row.querySelectorAll(`[data-crudui-action="${action}"]`))
      .find(button => button.getAttribute('aria-disabled') !== 'true' && button.closest('[data-crudui-row-key]') === row);
    return Array.from(row.querySelectorAll('input:not([type=hidden]),select,textarea'))
      .find(control => !control.disabled && !control.closest('[hidden]'))
      ?? own('toggle-row') ?? own('add-row');
  }

  /**
   * Focus the affected row, or the enclosing row or Add button of an emptied collection;
   * the browser scrolls the focused control into view, as connectForm does.
   */
  function moveFocus({ path, key }) {
    const row = key === undefined
      ? scopeElement(path)?.parentElement?.closest('[data-crudui-row-key]')
      : rowElement(path, key);
    const control = row ? firstRowControl(row)
      : Array.from(element.querySelectorAll('[data-crudui-action="add-row"]'))
        .find(button => button.getAttribute('aria-disabled') !== 'true' && pathOf(button) === path);
    control?.focus({ focusVisible: true });
  }

  async function render(focus, version, target) {
    await renderer.load(data, { collapsed: view.collapsed, canUndo: canUndo(history) });
    synchronizeControls();
    if (version !== inputVersion) return;
    if (target) moveFocus(target);
    else restore(focus);
  }

  function schedule(next, focus, version = inputVersion, target) {
    data = normalizeFields(template.fields, next);
    pending = pending.then(() => version === inputVersion ? render(focus, version, target) : undefined);
    return pending;
  }

  /** Normalize a data change and record history; a failure leaves data, history and view unchanged. */
  function commit(next, change = {}) {
    const normalized = normalizeFields(template.fields, next);
    history = change.reset ? emptyHistory() : recordChange(history, data, change.path);
    view = change.reset ? initialView() : change.view ?? view;
    return normalized;
  }

  /** Canonical row path after checking that the row exists. */
  function rowPath(path, key) {
    const rows = valueAt(data, pathSegments(path));
    if (!record(rows) || !Object.hasOwn(rows, key)) throw new Error(`Unknown row: ${key}`);
    return `${path}.${key}`;
  }

  function toggleRow(path, key) {
    view = toggleRowView(view, rowPath(path, key));
    return schedule(data, capture());
  }

  function setAllExpanded(expanded) {
    view = setAllExpandedView(bindForm(template, data, { language, collapsed: view.collapsed }), expanded);
    return schedule(data, capture());
  }

  function undo() {
    const result = undoChange(history);
    history = result.history;
    return schedule(result.value, capture());
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
    const normalized = commit(next, { path: segments.join('.') });
    const version = ++inputVersion;
    schedule(normalized, focus, version);
  }

  function onClick(event) {
    const button = event.target.closest?.('button[data-crudui-action]');
    if (!button || button.getAttribute('aria-disabled') === 'true' || !element.contains(button)) return;
    const target = resolveAction(button);
    if (!target) return;
    const { name: action, path, key } = target;
    if (action === 'expand-all' || action === 'collapse-all') {
      event.preventDefault();
      setAllExpanded(action === 'expand-all');
      return;
    }
    if (action === 'undo') {
      event.preventDefault();
      undo();
      return;
    }
    if (!path || (action !== 'add-row' && key === undefined)) return;
    if (action === 'toggle-row') {
      event.preventDefault();
      toggleRow(path, key);
      return;
    }
    if (action === 'select-row') {
      // Selecting from the structure map focuses the form row, as connectOutline does.
      event.preventDefault();
      const row = rowElement(path, key);
      if (row) firstRowControl(row)?.focus({ focusVisible: true });
      return;
    }
    const segments = pathSegments(path);
    const field = fieldAt(template.fields, segments);
    if (!repeated(field)) return;
    const next = structuredClone(data);
    const rows = valueAt(next, segments);
    if (!record(rows)) throw new Error(`Not a keyed collection: ${path}`);
    const entries = Object.entries(rows);
    const index = key === undefined ? -1 : entries.findIndex(([name]) => name === key);
    if (key !== undefined && index < 0) throw new Error(`Unknown row: ${key}`);
    const settings = record(field.spec.multiple) ? field.spec.multiple : {};
    if (['add-row', 'copy-row'].includes(action) && entries.length >= (settings.max ?? Infinity)) return;
    if (action === 'remove-row' && entries.length <= (settings.min ?? 0)) return;
    // Focus follows the affected row: the new row, the moved row, or a neighbour of a removed row.
    let focusKey = key;
    const change = {};
    if (action === 'add-row') {
      focusKey = freshKey(rows);
      entries.splice(index + 1, 0, [focusKey, normalizeRow(field, undefined, `${path}.${focusKey}`)]);
    } else if (action === 'copy-row') {
      focusKey = freshKey(rows);
      entries.splice(index + 1, 0, [focusKey, copyRow(field, rows[key], `${path}.${focusKey}`)]);
    } else if (action === 'remove-row') {
      focusKey = (entries[index - 1] ?? entries[index + 1])?.[0];
      entries.splice(index, 1);
      change.view = removeRowView(view, `${path}.${key}`);
    } else {
      const position = index + (action === 'move-up' ? -1 : 1);
      if (position < 0 || position >= entries.length) return;
      entries.splice(position, 0, entries.splice(index, 1)[0]);
    }
    put(next, segments, Object.fromEntries(entries));
    event.preventDefault();
    schedule(commit(next, change), undefined, inputVersion, { path, key: focusKey });
  }

  element.addEventListener('input', onInput);
  element.addEventListener('change', onInput);
  element.addEventListener('click', onClick);

  return {
    template, fromSerializedTemplate: true,
    getData: () => structuredClone(data),
    /** Collapsed row paths and undo availability, matching a createForm snapshot. */
    getView: () => ({ collapsed: [...view.collapsed], canUndo: canUndo(history) }),
    load(next) { return schedule(commit(next, { reset: true }), capture()); },
    toggleRow, setAllExpanded, undo,
    rekeyRows(changes) {
      for (const { path, oldKey, newKey } of changes) {
        checkKey(newKey);
        const next = structuredClone(data);
        const segments = pathSegments(path);
        const rows = valueAt(next, segments);
        if (!record(rows) || !Object.hasOwn(rows, oldKey) || Object.hasOwn(rows, newKey)) {
          throw new Error(`Invalid saved row key change: ${path}`);
        }
        put(next, segments, Object.fromEntries(Object.entries(rows)
          .map(([key, value]) => [key === oldKey ? newKey : key, value])));
        data = commit(next, { view: rekeyRowView(view, `${path}.${oldKey}`, `${path}.${newKey}`) });
      }
      return schedule(data, capture());
    },
    /** Resolve after every scheduled render, including renders a render scheduled. */
    async idle() {
      let current;
      do {
        current = pending;
        await current;
      } while (current !== pending);
    },
    async dispose() {
      element.removeEventListener('input', onInput);
      element.removeEventListener('change', onInput);
      element.removeEventListener('click', onClick);
      await pending;
      await renderer.dispose();
    },
  };
}
