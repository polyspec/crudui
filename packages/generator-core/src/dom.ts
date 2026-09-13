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

/** Form rows. A structure map row names its own collection path, so it carries `data-field-path`. */
const FORM_ROWS = '[data-crudui-row-key]:not([data-field-path])';

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

/**
 * The scroll container of an element, as `position: sticky` resolves it: the nearest
 * ancestor whose vertical overflow scrolls, whether or not its content overflows yet,
 * or the document's scrolling element.
 */
function scrollParent(element: HTMLElement): HTMLElement {
  const view = element.ownerDocument.defaultView!;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(view.getComputedStyle(parent).overflowY)) return parent;
  }
  return documentScroller(element.ownerDocument);
}

/** The element that scrolls a document: its scrolling element, or its root where a DOM has none. */
function documentScroller(document: Document): HTMLElement {
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
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
 * Track the form rows inside an element by scroll position. A row has reached its line
 * when its top is at or above its `scroll-margin-top`; a reached row with a sticky
 * header is marked `data-crudui-stuck`. The current row is the last reached row in
 * document order, or the first row before any is reached; it is marked
 * `data-crudui-current`, and a `crudui-current` event is dispatched on the element
 * when another row becomes current. Tracking only writes these attributes: it never
 * changes instance state, so scrolling renders nothing. Rows are measured on scroll
 * (captured, so inner scroll containers count) and resize, at most once per animation
 * frame, and on `update()`.
 */
export function connectRows(element: HTMLElement): RowTracking {
  const view = element.ownerDocument.defaultView!;
  let frame = 0;
  let last = '';
  /**
   * Publish the lengths of the trailing space rule: the height of the scroll container,
   * the extent from the top of the deepest row at the end of the form to the end of the
   * outermost such row, that row's aligned top (its scroll-margin-top), and the content
   * that follows the form in the scroll container, apart from the form's own margin.
   * `top` is the viewport position of the scroll container's content edge.
   */
  const publishEnd = (scroller: HTMLElement, top: number) => {
    const ends = Array.from(element.querySelectorAll<HTMLElement>(FORM_ROWS + ':last-child'))
      .filter(row => row.closest('.crudui-form__body :not(:last-child)') === null);
    const deepest = ends[ends.length - 1];
    const form = element.querySelector<HTMLElement>('.crudui-form');
    const contentEnd = top - scroller.scrollTop + scroller.scrollHeight;
    const formEnd = form ? form.getBoundingClientRect().bottom + (parseFloat(view.getComputedStyle(form).marginBottom) || 0) : contentEnd;
    // Published on the connected element, which rendering never replaces; the form
    // inherits them, so a re-render cannot drop the space and pull the scroll back.
    element.style.setProperty('--crudui-scroll-height', `${scroller.clientHeight}px`);
    element.style.setProperty('--crudui-form-end-extent', deepest ? `${ends[0]!.getBoundingClientRect().bottom - deepest.getBoundingClientRect().top}px` : '100vh');
    element.style.setProperty('--crudui-form-end-top', deepest ? view.getComputedStyle(deepest).scrollMarginTop : '0px');
    element.style.setProperty('--crudui-form-end-after', `${Math.max(0, contentEnd - formEnd)}px`);
  };
  const measure = () => {
    frame = 0;
    const scroller = scrollParent(element);
    const top = scroller === documentScroller(element.ownerDocument) ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop;
    publishEnd(scroller, top);
    const rows = Array.from(element.querySelectorAll<HTMLElement>(FORM_ROWS));
    let current: HTMLElement | undefined;
    for (const row of rows) {
      const reached = row.getBoundingClientRect().top - top <= (parseFloat(view.getComputedStyle(row).scrollMarginTop) || 0) + 0.5;
      const header = row.firstElementChild as HTMLElement | null;
      row.toggleAttribute('data-crudui-stuck', reached && header !== null && view.getComputedStyle(header).position === 'sticky');
      if (reached) current = row;
    }
    current ??= rows[0];
    for (const row of rows) row.toggleAttribute('data-crudui-current', row === current);
    const target = current && rowTarget(current);
    const identity = target ? `${target.path}\n${target.key}` : '';
    if (identity !== last) {
      last = identity;
      element.dispatchEvent(new view.Event('crudui-current'));
    }
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
  const rows = connectRows(element);
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

/**
 * Mark the structure map row of the form's current row with `aria-current="true"`.
 * The form rows inside `form` carry `data-crudui-current` from `connectRows`; the map
 * rows inside `outline` name their collection path and key themselves.
 */
export function markOutline(outline: HTMLElement, form: HTMLElement): void {
  const current = form.querySelector<HTMLElement>(`${FORM_ROWS}[data-crudui-current]`);
  const target = current ? rowTarget(current) : undefined;
  for (const row of outline.querySelectorAll<HTMLElement>('[data-field-path][data-crudui-row-key]')) {
    const matches = target !== undefined && row.getAttribute('data-field-path') === target.path &&
      row.getAttribute('data-crudui-row-key') === target.key;
    if (matches !== (row.getAttribute('aria-current') === 'true')) {
      if (matches) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    }
  }
}

/**
 * Connect a rendered structure map: its buttons act on the form, selecting a row aligns
 * the form row, and the map marks the form's current row whenever it changes or the map
 * is rendered again.
 */
export function connectOutline(element: HTMLElement, session: FormInstance, formElement: HTMLElement): FormConnection {
  const view = element.ownerDocument.defaultView!;
  const mark = () => markOutline(element, formElement);
  const onClick = (event: Event) => {
    const button = (event.target as Element)?.closest?.('button[data-crudui-action]') as HTMLButtonElement | null;
    if (!button || !element.contains(button) || button.disabled) return;
    const target = resolveAction(button);
    const result = target && runAction(session, target);
    if (!result) return;
    event.preventDefault();
    if (target.name === 'select-row' && result.focus?.key !== undefined) {
      const row = rowElement(formElement, result.focus.path, result.focus.key);
      if (row) alignRow(row);
    }
  };
  // Rendering replaces map rows; child list changes mark the new rows.
  const rendered = new view.MutationObserver(mark);
  rendered.observe(element, { childList: true, subtree: true });
  formElement.addEventListener('crudui-current', mark);
  element.addEventListener('click', onClick);
  mark();
  return {
    sync: mark,
    disconnect() {
      rendered.disconnect();
      formElement.removeEventListener('crudui-current', mark);
      element.removeEventListener('click', onClick);
    },
  };
}
