import type { FormInstance } from './instance';
import { resolveAction, runAction } from './actions';
import { formatDateValue } from './date';
import { parsePathString } from './util';

/** Browser binding lifecycle. */
export interface FormConnection {
  /** Synchronize rendered controls with the current session. */
  sync(): void;
  /** Remove event listeners and subscriptions. */
  disconnect(): void;
}

/** The form row element for a collection path and row key. */
function rowElement(root: ParentNode, path: string, key: string): HTMLElement | undefined {
  const scope = Array.from(root.querySelectorAll<HTMLElement>('[data-field-path]'))
    .find(element => element.getAttribute('data-field-path') === path);
  if (!scope) return undefined;
  return Array.from(scope.querySelectorAll<HTMLElement>('[data-crudui-row-key]'))
    .find(row => row.getAttribute('data-crudui-row-key') === key &&
      row.parentElement?.closest('[data-field-path]') === scope);
}

/** Browser event delegation for all adapters, including raw leaf controls. */
export function connectForm(element: HTMLElement, session: FormInstance): FormConnection {
  type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  let focus: {
    active: HTMLElement;
    name?: string;
    emptyCollection?: string;
    start: number | null;
    end: number | null;
    direction?: 'forward' | 'backward' | 'none';
    scroll: Array<{ element: HTMLElement; top: number; left: number }>;
  } | undefined;
  let observers: IntersectionObserver[] = [];
  const controls = () => Array.from(element.querySelectorAll<Control>('input[name],select[name],textarea[name]'));
  const pathOf = (name: string) => {
    const segments = parsePathString(name);
    const prefix = session.keyPrefix;
    if (prefix) {
      if (segments[0] !== prefix) return undefined;
      segments.shift();
    }
    return segments.length ? segments.join('.') : undefined;
  };
  // After an empty collection's add replaces its button, focus the first add
  // control of the same collection, including the new row's.
  const addButtonOf = (path: string) => Array.from(element.querySelectorAll<HTMLButtonElement>('[data-crudui-action="add-row"]'))
    .find(button => resolveAction(button)?.path === path);
  const captureFocus = () => {
    const active = element.ownerDocument.activeElement as (HTMLElement & {
      name?: string; selectionStart?: number | null; selectionEnd?: number | null;
      selectionDirection?: 'forward' | 'backward' | 'none' | null;
    }) | null;
    focus = undefined;
    if (active && element.contains(active)) {
      const scroll = [];
      for (let parent = active.parentElement; parent; parent = parent.parentElement) {
        scroll.push({ element: parent, top: parent.scrollTop, left: parent.scrollLeft });
      }
      const target = active.matches('[data-crudui-action="add-row"]') ? resolveAction(active) : undefined;
      focus = {
        active,
        emptyCollection: target && target.key === undefined ? target.path : undefined,
        name: active.name,
        start: active.selectionStart ?? null,
        end: active.selectionEnd ?? null,
        direction: active.selectionDirection ?? undefined,
        scroll,
      };
    }
  };
  const onPointerDown = (event: PointerEvent) => {
    const button = (event.target as Element)?.closest?.('button[data-crudui-action]');
    const active = element.ownerDocument.activeElement;
    if (event.button !== 0 || !button || (button as HTMLButtonElement).disabled || !element.contains(button) ||
        !active?.matches('input,textarea,select') || !element.contains(active)) return;
    event.preventDefault();
  };
  // Focusing a control selects its row. Buttons are excluded: a selection
  // re-render would replace the button before its click is delivered.
  const onFocusIn = (event: FocusEvent) => {
    const control = event.target as Element;
    if (!control?.matches?.('input,select,textarea')) return;
    const row = control.closest('[data-crudui-row-key]');
    if (!row) return;
    const scope = row.parentElement?.closest('[data-field-path]');
    const path = scope?.getAttribute('data-field-path');
    const key = row.getAttribute('data-crudui-row-key');
    if (path && key) session.selectRow(path, key);
  };
  const onInput = (event: Event) => {
    const control = event.target as Control;
    if (!control?.matches?.('input[name],select[name],textarea[name]') || control.disabled) return;
    const path = pathOf(control.name);
    if (!path) return;
    let value: unknown = control.value;
    if (control.tagName === 'INPUT') {
      const input = control as HTMLInputElement;
      if (input.type === 'radio' && !input.checked) return;
      if (input.type === 'checkbox') {
        value = input.name.endsWith('[]')
          ? controls().filter(c => c.name === input.name && (c as HTMLInputElement).checked).map(c => c.value)
          : input.checked ? input.value : '';
      } else if (input.type === 'file') {
        value = input.multiple ? Array.from(input.files ?? []) : input.files?.[0] ?? null;
      }
    } else if (control.tagName === 'SELECT' && (control as HTMLSelectElement).multiple) {
      value = Array.from((control as HTMLSelectElement).selectedOptions, option => option.value);
    }
    // Browsers emit input followed by change for several controls.
    const previous = session.getValue(path);
    if (previous === value || (Array.isArray(previous) && Array.isArray(value) &&
        previous.length === value.length && previous.every((v, i) => v === value[i]))) return;
    captureFocus();
    session.setValue(path, value);
  };
  const onClick = (event: Event) => {
    const button = (event.target as Element)?.closest?.('button[data-crudui-action]') as HTMLButtonElement | null;
    if (!button || !element.contains(button) || button.disabled) return;
    const target = resolveAction(button);
    if (target && runAction(session, target)) event.preventDefault();
  };
  /** Mark sticky row headers that are currently stuck. */
  const observeSticky = () => {
    for (const observer of observers) observer.disconnect();
    observers = [];
    if (typeof IntersectionObserver === 'undefined') return;
    for (const row of element.querySelectorAll<HTMLElement>('[data-crudui-row-key]')) {
      const header = row.firstElementChild as HTMLElement | null;
      if (!header || getComputedStyle(header).position !== 'sticky') continue;
      const top = parseFloat(getComputedStyle(header).top) || 0;
      const observer = new IntersectionObserver(([entry]) => {
        const stuck = entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);
        row.toggleAttribute('data-crudui-stuck', stuck);
      }, { rootMargin: `-${Math.round(top) + 1}px 0px 0px 0px`, threshold: [0, 1] });
      observer.observe(row);
      observers.push(observer);
    }
  };
  const sync = () => {
    // React's SSR-compatible controls use defaultValue. Injection must update
    // live DOM properties too, including inputs that the user has already edited.
    for (const control of controls()) {
      const path = pathOf(control.name);
      if (!path) continue;
      const value = session.getValue(path);
      if (control.tagName === 'INPUT') {
        const input = control as HTMLInputElement;
        if (input.type === 'file') continue;
        if (input.type === 'date' || input.type === 'datetime-local') {
          const raw = value === undefined || value === null ? '' : String(value);
          input.value = formatDateValue(
            raw,
            input.type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm:ss',
          );
          continue;
        }
        if (input.type === 'checkbox' || input.type === 'radio') {
          // Keep checked last so restoring data reproduces the initial HTML.
          const checked = input.getAttributeNode('checked');
          if (checked && input.attributes.item(input.attributes.length - 1) !== checked) {
            input.removeAttributeNode(checked);
            input.setAttributeNode(checked);
          }
          input.checked = Array.isArray(value) ? value.map(String).includes(input.value)
            : value !== undefined && value !== null && (value === true ? '1' : String(value)) === input.value;
          continue;
        }
      }
      if (control.tagName === 'SELECT' && (control as HTMLSelectElement).multiple) {
        const selected = Array.isArray(value) ? value.map(String) : [];
        for (const option of (control as HTMLSelectElement).options) option.selected = selected.includes(option.value);
      } else {
        const next = value === undefined || value === null ? '' : String(value);
        if (control.value !== next) control.value = next;
      }
    }
    observeSticky();
    if (focus) {
      let control: HTMLElement | undefined = element.contains(focus.active) ? focus.active : controls().find(c => c.name === focus!.name);
      if (!control && focus.emptyCollection) control = addButtonOf(focus.emptyCollection);
      if (control) {
        control.focus({ preventScroll: true });
        if (focus.start !== null && 'setSelectionRange' in control) {
          (control as HTMLInputElement).setSelectionRange(focus.start, focus.end, focus.direction);
        }
      }
      for (const position of focus.scroll) {
        position.element.scrollTop = position.top;
        position.element.scrollLeft = position.left;
      }
      focus = undefined;
    }
  };
  const unsubscribe = session.subscribe(captureFocus);
  element.addEventListener('input', onInput);
  element.addEventListener('change', onInput);
  element.addEventListener('click', onClick);
  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('focusin', onFocusIn);
  sync();
  return {
    sync,
    disconnect() {
      unsubscribe();
      for (const observer of observers) observer.disconnect();
      observers = [];
      element.removeEventListener('input', onInput);
      element.removeEventListener('change', onInput);
      element.removeEventListener('click', onClick);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('focusin', onFocusIn);
    },
  };
}

/** Connect a rendered structure map: its buttons act on the form and selection scrolls to the row. */
export function connectOutline(element: HTMLElement, session: FormInstance, formElement: HTMLElement): FormConnection {
  const onClick = (event: Event) => {
    const button = (event.target as Element)?.closest?.('button[data-crudui-action]') as HTMLButtonElement | null;
    if (!button || !element.contains(button) || button.disabled) return;
    const target = resolveAction(button);
    if (!target || !runAction(session, target)) return;
    event.preventDefault();
    if (target.name === 'select-row' && target.path && target.key) {
      const row = rowElement(formElement, target.path, target.key);
      row?.scrollIntoView({ block: 'start' });
    }
  };
  element.addEventListener('click', onClick);
  return {
    sync() {},
    disconnect() { element.removeEventListener('click', onClick); },
  };
}
