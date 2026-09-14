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
  /**
   * Focus the row an action affected, or the enclosing row or Add button of an emptied
   * collection. The browser scrolls the focused control into view only as far as needed;
   * the stylesheet's scroll margins keep it clear of the sticky headers and the footer.
   */
  const moveFocus = ({ path, key }: FocusTarget) => {
    const row = key === undefined
      ? scopeElement(element, path)?.parentElement?.closest<HTMLElement>('[data-crudui-row-key]') ?? undefined
      : rowElement(element, path, key);
    const control = row ? firstRowControl(row)
      : Array.from(element.querySelectorAll<HTMLButtonElement>('[data-crudui-action="add-row"]'))
        .find(button => !unavailable(button) && resolveAction(button)?.path === path);
    control?.focus();
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
      element.removeEventListener('input', onInput);
      element.removeEventListener('change', onInput);
      element.removeEventListener('click', onClick);
    },
  };
}

/**
 * Connect a rendered structure map: its buttons act on the form, and selecting a row
 * focuses that form row's first control, which the browser scrolls into view.
 */
export function connectOutline(element: HTMLElement, session: FormInstance, formElement: HTMLElement): FormConnection {
  const onClick = (event: Event) => {
    const button = (event.target as Element)?.closest?.('button[data-crudui-action]') as HTMLButtonElement | null;
    if (!button || !element.contains(button) || unavailable(button)) return;
    const target = resolveAction(button);
    const result = target && runAction(session, target);
    if (!result) return;
    event.preventDefault();
    if (target.name === 'select-row' && result.focus?.key !== undefined) {
      const row = rowElement(formElement, result.focus.path, result.focus.key);
      if (row) firstRowControl(row)?.focus();
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
