import type { FormInstance } from './instance';
import { resolveAction, runAction, type ActionTarget, type FocusTarget } from './actions';
import { formatDateValue } from './date';
import { parsePathString } from './util';

/** Browser binding lifecycle. */
export interface FormConnection {
  /** Synchronize rendered controls with the current session. */
  sync(): void;
  /** Remove event listeners and subscriptions. */
  disconnect(): void;
}

/** Row tracking lifecycle. */
export interface RowTracking {
  /** Measure rows now, after rendering replaced or moved them. */
  update(): void;
  /** Remove event listeners and cancel a pending measurement. */
  disconnect(): void;
}

/** The element whose `data-field-path` equals a path. */
function scopeElement(root: ParentNode, path: string): HTMLElement | undefined {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-field-path]'))
    .find(element => element.getAttribute('data-field-path') === path);
}

/** The form row element for a collection path and row key. */
function rowElement(root: ParentNode, path: string, key: string): HTMLElement | undefined {
  const scope = scopeElement(root, path);
  if (!scope) return undefined;
  return Array.from(scope.querySelectorAll<HTMLElement>('[data-crudui-row-key]'))
    .find(row => row.getAttribute('data-crudui-row-key') === key &&
      row.parentElement?.closest('[data-field-path]') === scope);
}

/** An enabled action button of a row itself, not of a nested row. */
function rowButton(row: HTMLElement, action: string): HTMLButtonElement | undefined {
  return Array.from(row.querySelectorAll<HTMLButtonElement>(`[data-crudui-action="${action}"]`))
    .find(button => !button.disabled && button.closest('[data-crudui-row-key]') === row);
}

/** A row's first enabled visible input, or its toggle or Add button when it has none. */
function firstRowControl(row: HTMLElement): HTMLElement | undefined {
  const input = Array.from(row.querySelectorAll<HTMLInputElement>('input:not([type=hidden]),select,textarea'))
    .find(control => !control.disabled && !control.closest('[hidden]'));
  return input ?? rowButton(row, 'toggle-row') ?? rowButton(row, 'add-row');
}

/** The collection path and key of a row element. */
function rowTarget(row: HTMLElement): { path: string; key: string } | undefined {
  const path = row.parentElement?.closest('[data-field-path]')?.getAttribute('data-field-path');
  const key = row.getAttribute('data-crudui-row-key');
  return path && key ? { path, key } : undefined;
}

/** The nearest scrolling ancestor of an element, or the document's scrolling element. */
function scrollParent(element: HTMLElement): HTMLElement {
  const view = element.ownerDocument.defaultView!;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(view.getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return element.ownerDocument.scrollingElement as HTMLElement;
}

/**
 * Make a row current: scroll it to the top of its scroll container. The row's
 * `scroll-margin-top` puts its header on its sticky line (zero for a row without a
 * sticky header), so the scroll position then names this row as current.
 */
export function alignRow(row: HTMLElement): void {
  row.scrollIntoView({ block: 'start' });
}

/**
 * Track rows by scroll position. A row has reached its line when its top is at or
 * above its `scroll-margin-top`; a reached row with a sticky header is marked
 * `data-crudui-stuck`. The current row is the last reached row in document order, or
 * the first row before any is reached; it is marked `data-crudui-current` and passed
 * to `onCurrent`. Rows are measured on scroll (captured, so inner scroll containers
 * count) and resize, at most once per animation frame, and on `update()`.
 */
export function connectRows(element: HTMLElement, onCurrent: (row: HTMLElement | undefined) => void): RowTracking {
  const view = element.ownerDocument.defaultView!;
  let frame = 0;
  /**
   * Publish the end row lengths for the trailing space rule: the extent from the top
   * of the deepest row at the end of the form to the end of the outermost such row,
   * and that row's aligned top (its scroll-margin-top).
   */
  const publishEnd = () => {
    const ends = Array.from(element.querySelectorAll<HTMLElement>('[data-crudui-row-key]:last-child'))
      .filter(row => row.closest('.crudui-form__body :not(:last-child)') === null);
    const deepest = ends[ends.length - 1];
    // Published on the connected element, which rendering never replaces; the form
    // inherits them, so a re-render cannot drop the space and pull the scroll back.
    element.style.setProperty('--crudui-form-end-extent', deepest ? `${ends[0]!.getBoundingClientRect().bottom - deepest.getBoundingClientRect().top}px` : '100vh');
    element.style.setProperty('--crudui-form-end-top', deepest ? view.getComputedStyle(deepest).scrollMarginTop : '0px');
  };
  const measure = () => {
    frame = 0;
    publishEnd();
    const scroller = scrollParent(element);
    const top = scroller === element.ownerDocument.scrollingElement ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop;
    const rows = Array.from(element.querySelectorAll<HTMLElement>('[data-crudui-row-key]'));
    let current: HTMLElement | undefined;
    for (const row of rows) {
      const reached = row.getBoundingClientRect().top - top <= (parseFloat(view.getComputedStyle(row).scrollMarginTop) || 0) + 0.5;
      const header = row.firstElementChild as HTMLElement | null;
      row.toggleAttribute('data-crudui-stuck', reached && header !== null && view.getComputedStyle(header).position === 'sticky');
      if (reached) current = row;
    }
    current ??= rows[0];
    for (const row of rows) row.toggleAttribute('data-crudui-current', row === current);
    onCurrent(current);
  };
  const schedule = () => {
    if (!frame) frame = view.requestAnimationFrame(measure);
  };
  view.addEventListener('scroll', schedule, { capture: true, passive: true });
  view.addEventListener('resize', schedule);
  // Content that grows or shrinks without scrolling changes the end row extent.
  const resized = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(schedule) : undefined;
  resized?.observe(element);
  return {
    update: measure,
    disconnect() {
      resized?.disconnect();
      if (frame) view.cancelAnimationFrame(frame);
      frame = 0;
      view.removeEventListener('scroll', schedule, { capture: true });
      view.removeEventListener('resize', schedule);
    },
  };
}

/** Browser event delegation for all adapters, including raw leaf controls. */
export function connectForm(element: HTMLElement, session: FormInstance): FormConnection {
  type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  let focus: {
    active: HTMLElement;
    name?: string;
    action?: ActionTarget;
    start: number | null;
    end: number | null;
    direction?: 'forward' | 'backward' | 'none';
  } | undefined;
  // Focus destination of the last action, applied after the next render.
  let destination: FocusTarget | undefined;
  // Whether the DOM has been synchronized since the last commit.
  let synced = true;
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
  /** The rendered button requesting the same action on the same path and key. */
  const actionButton = (target: ActionTarget) => Array.from(element.querySelectorAll<HTMLButtonElement>('button[data-crudui-action]'))
    .find(button => {
      const other = resolveAction(button);
      return other?.name === target.name && other.path === target.path && other.key === target.key;
    });
  const captureFocus = () => {
    synced = false;
    const active = element.ownerDocument.activeElement as (HTMLElement & {
      name?: string; selectionStart?: number | null; selectionEnd?: number | null;
      selectionDirection?: 'forward' | 'backward' | 'none' | null;
    }) | null;
    focus = undefined;
    if (active && element.contains(active)) {
      const action = active.matches('button[data-crudui-action]') ? resolveAction(active) : undefined;
      focus = {
        active,
        ...(action ? { action } : {}),
        name: active.name,
        start: active.selectionStart ?? null,
        end: active.selectionEnd ?? null,
        direction: active.selectionDirection ?? undefined,
      };
    }
  };
  /** Keep the focused control and its text selection; scroll positions belong to the user. */
  const restoreFocus = () => {
    if (!focus) return;
    const control = element.contains(focus.active) ? focus.active
      : focus.action ? actionButton(focus.action)
        : controls().find(c => c.name === focus!.name);
    if (control) {
      control.focus({ preventScroll: true });
      if (focus.start !== null && 'setSelectionRange' in control) {
        (control as HTMLInputElement).setSelectionRange(focus.start, focus.end, focus.direction);
      }
    }
  };
  /** Focus the row an action affected, or the enclosing row or Add button of an emptied collection. */
  const moveFocus = ({ path, key }: FocusTarget) => {
    const row = key === undefined
      ? scopeElement(element, path)?.parentElement?.closest<HTMLElement>('[data-crudui-row-key]') ?? undefined
      : rowElement(element, path, key);
    const control = row ? firstRowControl(row)
      : Array.from(element.querySelectorAll<HTMLButtonElement>('[data-crudui-action="add-row"]'))
        .find(button => !button.disabled && resolveAction(button)?.path === path);
    if (!control) return;
    alignRow(row ?? control);
    control.focus({ preventScroll: true });
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
    const result = target && runAction(session, target);
    if (!result) return;
    event.preventDefault();
    if (!result.focus) return;
    // A renderer that synchronizes inside the commit has already rendered the row.
    if (synced) moveFocus(result.focus);
    else destination = result.focus;
  };
  // The selected row follows the scroll position.
  const rows = connectRows(element, row => {
    const target = row && rowTarget(row);
    const selection = session.getSnapshot().selection;
    if (target && (selection?.path !== target.path || selection.key !== target.key)) session.selectRow(target.path, target.key);
  });
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
    synced = true;
    if (destination) {
      const target = destination;
      destination = undefined;
      focus = undefined;
      moveFocus(target);
    } else {
      restoreFocus();
      focus = undefined;
    }
    rows.update();
  };
  const unsubscribe = session.subscribe(captureFocus);
  element.addEventListener('input', onInput);
  element.addEventListener('change', onInput);
  element.addEventListener('click', onClick);
  sync();
  return {
    sync,
    disconnect() {
      unsubscribe();
      rows.disconnect();
      element.removeEventListener('input', onInput);
      element.removeEventListener('change', onInput);
      element.removeEventListener('click', onClick);
    },
  };
}

/** Connect a rendered structure map: its buttons act on the form and selecting a row aligns the form row. */
export function connectOutline(element: HTMLElement, session: FormInstance, formElement: HTMLElement): FormConnection {
  const onClick = (event: Event) => {
    const button = (event.target as Element)?.closest?.('button[data-crudui-action]') as HTMLButtonElement | null;
    if (!button || !element.contains(button) || button.disabled) return;
    const target = resolveAction(button);
    if (!target || !runAction(session, target)) return;
    event.preventDefault();
    if (target.name === 'select-row' && target.path && target.key) {
      const row = rowElement(formElement, target.path, target.key);
      if (row) alignRow(row);
    }
  };
  element.addEventListener('click', onClick);
  return {
    sync() {},
    disconnect() { element.removeEventListener('click', onClick); },
  };
}
