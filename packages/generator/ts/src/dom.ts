import type { FormInstance } from './instance';
import { resolveAction, runAction, type ActionTarget, type FocusTarget } from './actions';
import { formatDateValue } from './date';
import { parsePathString, phpString } from './util';

/** Browser binding lifecycle. */
export interface FormConnection {
  /** Synchronize rendered controls with the current session. */
  sync(): void;
  /** Remove event listeners and subscriptions. */
  disconnect(): void;
}

/** A rendered form control. */
type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Whether an event target is an element. */
function isElement(target: EventTarget | null): target is Element {
  return target !== null && 'nodeType' in target && target.nodeType === 1;
}

/** Whether an element is a named form control: the selector names its element types. */
function isControl(element: Element): element is Control {
  return element.matches('input[name],select[name],textarea[name]');
}

function isInput(element: Element): element is HTMLInputElement {
  return element.tagName === 'INPUT';
}

function isSelect(element: Element): element is HTMLSelectElement {
  return element.tagName === 'SELECT';
}

function isTextArea(element: Element): element is HTMLTextAreaElement {
  return element.tagName === 'TEXTAREA';
}

/** Whether an element can take focus: an HTML, SVG or MathML element. */
function isFocusable(element: Element): element is Element & HTMLOrSVGElement {
  return 'focus' in element && typeof element.focus === 'function' && 'dataset' in element;
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

/**
 * Whether an action button's action cannot run now. Unavailable actions carry
 * `aria-disabled="true"` and stay focusable, so focus never depends on how a browser
 * treats a focused control that becomes disabled.
 */
function unavailable(button: Element): boolean {
  return button.getAttribute('aria-disabled') === 'true';
}

/** An available action button of a row itself, not of a nested row. */
function rowButton(row: HTMLElement, action: string): HTMLButtonElement | undefined {
  return Array.from(row.querySelectorAll<HTMLButtonElement>(`[data-crudui-action="${action}"]`))
    .find(button => !unavailable(button) && button.closest('[data-crudui-row-key]') === row);
}

/** A row's first enabled visible input, or its toggle or Add button when it has none. */
function firstRowControl(row: HTMLElement): HTMLElement | undefined {
  const input = Array.from(row.querySelectorAll<HTMLInputElement>('input:not([type=hidden]),select,textarea'))
    .find(control => !control.disabled && !control.closest('[hidden]'));
  return input ?? rowButton(row, 'toggle-row') ?? rowButton(row, 'add-row');
}

/**
 * Move focus to a control and scroll it into view only as far as needed, clear of the sticky
 * headers above and the footer below: the stylesheet's scroll margins declare those bands and
 * the standard scroll-into-view steps honour them in every engine. Focus itself never scrolls,
 * since how far a browser scrolls a newly focused control is its own choice (WebKit on Linux
 * does not keep to the margins); the moved focus is visible.
 */
function revealControl(control: HTMLElement): void {
  control.focus({ preventScroll: true, focusVisible: true });
  // A document without layout (jsdom) has no scrollIntoView.
  control.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

/**
 * Mark stuck sticky row headers in a browser without scroll-state container queries
 * (Firefox, Safari), and do nothing elsewhere. A header container is stuck while sticky
 * positioning moves it from the top of its row; `data-crudui-stuck` then shows its level
 * label and hides its card top edge, as the stylesheet's `scroll-state(stuck: top)` query
 * does in other browsers.
 * Rendering inside the element is observed, so the container is connected once even when the
 * form is rendered without `connectForm`; a render that drops the attribute is marked again before
 * the page is painted. Only the attribute changes, never a scroll position.
 */
export function connectStickyHeaders(element: HTMLElement): FormConnection {
  const view = element.ownerDocument.defaultView;
  if (!view?.CSS?.supports || view.CSS.supports('container-type: scroll-state')) {
    return { sync() {}, disconnect() {} };
  }
  let frame = 0;
  const mark = () => {
    frame = 0;
    for (const header of element.querySelectorAll<HTMLElement>('.crudui-node--sticky > .crudui-node__header-container')) {
      const row = header.parentElement;
      if (!row) continue;
      const moved = header.getBoundingClientRect().top - (row.getBoundingClientRect().top + row.clientTop);
      header.toggleAttribute('data-crudui-stuck', moved > 0.5);
    }
  };
  const schedule = () => { if (!frame) frame = view.requestAnimationFrame(mark); };
  // Scroll events do not bubble; capturing on the document sees every scrolling box.
  element.ownerDocument.addEventListener('scroll', schedule, { capture: true, passive: true });
  view.addEventListener('resize', schedule, { passive: true });
  // Marking sets the attribute only when the state changes, so marking again settles at once.
  const observer = new view.MutationObserver(mark);
  observer.observe(element, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-crudui-stuck'] });
  mark();
  return {
    sync: mark,
    disconnect() {
      if (frame) view.cancelAnimationFrame(frame);
      observer.disconnect();
      element.ownerDocument.removeEventListener('scroll', schedule, { capture: true });
      view.removeEventListener('resize', schedule);
    },
  };
}

/** Browser event delegation for all adapters, including raw leaf controls. */
export function connectForm(element: HTMLElement, session: FormInstance): FormConnection {
  let focus: {
    active: Element & HTMLOrSVGElement;
    name?: string;
    action?: ActionTarget;
    start: number | null;
    end: number | null;
    direction?: 'forward' | 'backward' | 'none';
    visible: boolean;
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
    const active = element.ownerDocument.activeElement;
    focus = undefined;
    if (active && isFocusable(active) && element.contains(active)) {
      const action = active.matches('button[data-crudui-action]') ? resolveAction(active) : undefined;
      const text = isInput(active) || isTextArea(active) ? active : undefined;
      focus = {
        active,
        ...(action ? { action } : {}),
        ...('name' in active && typeof active.name === 'string' ? { name: active.name } : {}),
        start: text?.selectionStart ?? null,
        end: text?.selectionEnd ?? null,
        direction: text?.selectionDirection ?? undefined,
        visible: active.matches(':focus-visible'),
      };
    }
  };
  /**
   * Keep the focused control, its text selection and whether its focus is visible; scroll
   * positions belong to the user. Visibility is set explicitly: a browser decides it for a
   * scripted focus from earlier pointer input, which differs between documents.
   */
  const restoreFocus = () => {
    const saved = focus;
    if (!saved) return;
    const control = element.contains(saved.active) ? saved.active
      : saved.action ? actionButton(saved.action)
        : controls().find(c => c.name === saved.name);
    if (control) {
      control.focus({ preventScroll: true, focusVisible: saved.visible });
      if (saved.start !== null && (isInput(control) || isTextArea(control))) {
        control.setSelectionRange(saved.start, saved.end, saved.direction);
      }
    }
  };
  /**
   * Focus the row an action affected, or the enclosing row or Add button of an emptied
   * collection, and scroll it into view clear of the sticky headers and the footer. Moving
   * focus relocates the user, so the moved focus is visible.
   */
  const moveFocus = ({ path, key }: FocusTarget) => {
    const row = key === undefined
      ? scopeElement(element, path)?.parentElement?.closest<HTMLElement>('[data-crudui-row-key]') ?? undefined
      : rowElement(element, path, key);
    const control = row ? firstRowControl(row)
      : Array.from(element.querySelectorAll<HTMLButtonElement>('[data-crudui-action="add-row"]'))
        .find(button => !unavailable(button) && resolveAction(button)?.path === path);
    if (control) revealControl(control);
  };
  const onInput = (event: Event) => {
    const control = event.target;
    if (isElement(control) && isControl(control)) input(control);
  };
  const input = (control: Control) => {
    if (control.disabled) return;
    const path = pathOf(control.name);
    if (!path) return;
    let value: unknown = control.value;
    if (isInput(control)) {
      if (control.type === 'radio' && !control.checked) return;
      if (control.type === 'checkbox') {
        value = control.name.endsWith('[]')
          ? controls().filter(c => c.name === control.name && isInput(c) && c.checked).map(c => c.value)
          : control.checked ? control.value : '';
      } else if (control.type === 'file') {
        value = control.multiple ? Array.from(control.files ?? []) : control.files?.[0] ?? null;
      }
    } else if (isSelect(control) && control.multiple) {
      value = Array.from(control.selectedOptions, option => option.value);
    }
    // Browsers emit input followed by change for several controls.
    const previous = session.getValue(path);
    if (previous === value || (Array.isArray(previous) && Array.isArray(value) &&
        previous.length === value.length && previous.every((v, i) => v === value[i]))) return;
    captureFocus();
    session.setValue(path, value);
  };
  const onClick = (event: Event) => {
    const button = isElement(event.target) ? event.target.closest<HTMLButtonElement>('button[data-crudui-action]') : null;
    if (!button || !element.contains(button) || unavailable(button)) return;
    const target = resolveAction(button);
    const result = target && runAction(session, target);
    if (!result) return;
    event.preventDefault();
    if (!result.focus) return;
    // A renderer that synchronizes inside the commit has already rendered the row.
    if (synced) moveFocus(result.focus);
    else destination = result.focus;
  };
  const sync = () => {
    // React's SSR-compatible controls use defaultValue. Injection must update
    // live DOM properties too, including inputs that the user has already edited.
    for (const control of controls()) {
      const path = pathOf(control.name);
      if (!path) continue;
      const value = session.getValue(path);
      if (isInput(control)) {
        const input = control;
        if (input.type === 'file') continue;
        if (input.type === 'date' || input.type === 'datetime-local') {
          const raw = phpString(value);
          input.value = formatDateValue(
            raw,
            input.type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm:ss',
          );
          continue;
        }
        if (input.type === 'checkbox' || input.type === 'radio') {
          input.checked = Array.isArray(value) ? value.map(String).includes(input.value)
            : value !== undefined && value !== null && phpString(value) === input.value;
          continue;
        }
      }
      if (isSelect(control) && control.multiple) {
        const selected = Array.isArray(value) ? value.map(String) : [];
        for (const option of control.options) option.selected = selected.includes(option.value);
      } else {
        const next = phpString(value);
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
  };
  const unsubscribe = session.subscribe(captureFocus);
  const stuck = connectStickyHeaders(element);
  element.addEventListener('input', onInput);
  element.addEventListener('change', onInput);
  element.addEventListener('click', onClick);
  // A visitor can edit server markup before the connection; those edits differ from the
  // rendered defaults and win over the rendered values. A browser sanitizes a value it reads, so
  // the default is compared after the same sanitization: a datetime control reads
  // 2026-09-09T00:00:00 as 2026-09-09T00:00, which is not an edit.
  const sanitizedDefault = (control: HTMLInputElement | HTMLTextAreaElement) => {
    if (!isInput(control)) return control.defaultValue;
    const probe = control.ownerDocument.createElement('input');
    probe.type = control.type;
    probe.value = control.defaultValue;
    return probe.value;
  };
  for (const control of controls()) {
    const edited = isSelect(control)
      ? Array.from(control.options).some(option => option.selected !== option.defaultSelected)
      : isInput(control) && ['checkbox', 'radio'].includes(control.type)
        ? control.checked !== control.defaultChecked
        : isInput(control) && control.type === 'file'
          ? (control.files?.length ?? 0) > 0
          : control.value !== sanitizedDefault(control);
    if (edited) input(control);
  }
  sync();
  return {
    sync,
    disconnect() {
      unsubscribe();
      stuck.disconnect();
      element.removeEventListener('input', onInput);
      element.removeEventListener('change', onInput);
      element.removeEventListener('click', onClick);
    },
  };
}

/**
 * Connect a rendered structure map: its buttons act on the form, and selecting a row
 * focuses that form row's first control and scrolls it into view clear of the sticky headers
 * and the footer.
 */
export function connectOutline(element: HTMLElement, session: FormInstance, formElement: HTMLElement): FormConnection {
  const onClick = (event: Event) => {
    const button = isElement(event.target) ? event.target.closest<HTMLButtonElement>('button[data-crudui-action]') : null;
    if (!button || !element.contains(button) || unavailable(button)) return;
    const target = resolveAction(button);
    const result = target && runAction(session, target);
    if (!result) return;
    event.preventDefault();
    if (target.name === 'select-row' && result.focus?.key !== undefined) {
      const row = rowElement(formElement, result.focus.path, result.focus.key);
      const control = row && firstRowControl(row);
      if (control) revealControl(control);
    }
  };
  element.addEventListener('click', onClick);
  return {
    sync() {},
    disconnect() {
      element.removeEventListener('click', onClick);
    },
  };
}
