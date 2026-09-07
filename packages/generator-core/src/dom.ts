import type { FormSession } from './session';
import type { FieldViewModel } from './viewmodel';
import { parsePathString } from './util';

/** Browser binding lifecycle. */
export interface FormConnection {
  /** Synchronize rendered controls with the current session. */
  sync(): void;
  /** Remove event listeners and subscriptions. */
  disconnect(): void;
}

/** Browser event delegation for all three adapters, including raw leaf controls. */
export function connectForm(element: HTMLElement, session: FormSession): FormConnection {
  type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  let focus: {
    active: HTMLElement;
    name?: string;
    emptyAddWrapper?: string;
    start: number | null;
    end: number | null;
    direction?: 'forward' | 'backward' | 'none';
    scroll: Array<{ element: HTMLElement; top: number; left: number }>;
  } | undefined;
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
      const wrapper = active.closest('.form-element-wrapper[name]');
      const row = active.closest('.input-group-wrapper[data-uniqid]');
      const emptyAdd = active.matches('button.btn-plus') && row?.closest('.form-element-wrapper[name]') !== wrapper;
      focus = {
        active,
        emptyAddWrapper: emptyAdd ? wrapper?.getAttribute('name') ?? undefined : undefined,
        name: active.name,
        start: active.selectionStart ?? null,
        end: active.selectionEnd ?? null,
        direction: active.selectionDirection ?? undefined,
        scroll,
      };
    }
  };
  const onPointerDown = (event: PointerEvent) => {
    const button = (event.target as Element)?.closest?.('button');
    const active = element.ownerDocument.activeElement;
    if (event.button !== 0 || !button || button.disabled || !element.contains(button) ||
        !active?.matches('input,textarea,select') || !element.contains(active)) return;
    if (['btn-plus', 'btn-copy', 'btn-minus', 'btn-move-up', 'btn-move-down'].some(cls => button.classList.contains(cls))) {
      event.preventDefault();
    }
  };
  const fieldsByWrapper = () => {
    const map = new Map<string, FieldViewModel>();
    const visit = (fields: FieldViewModel[]) => {
      for (const field of fields) {
        map.set(field.wrapperName, field);
        visit(field.children ?? []);
        for (const row of field.rows ?? []) visit(row.children ?? []);
      }
    };
    visit(session.getSnapshot().fields);
    return map;
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
    const button = (event.target as Element)?.closest?.('button');
    if (!button || !element.contains(button) || button.disabled) return;
    const wrapper = button.closest('.form-element-wrapper[name]');
    const field = fieldsByWrapper().get(wrapper?.getAttribute('name') ?? '');
    if (!field?.multiple) return;
    const row = button.closest('.input-group-wrapper[data-uniqid]');
    // An empty nested collection's add button can sit inside a parent row.
    const key = row?.closest('.form-element-wrapper') === wrapper ? row.getAttribute('data-uniqid') ?? undefined : undefined;
    const cls = button.classList;
    if (cls.contains('btn-plus')) session.addRow(field.path, { afterKey: key });
    else if (cls.contains('btn-copy') && key) session.copyRow(field.path, key);
    else if (cls.contains('btn-minus') && key) session.removeRow(field.path, key);
    else if (key && (cls.contains('btn-move-up') || cls.contains('btn-move-down'))) {
      const from = field.rows?.findIndex(r => r.uniqid === key) ?? -1;
      session.moveRow(field.path, key, from + (cls.contains('btn-move-up') ? -1 : 1));
    } else return;
    event.preventDefault();
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
          input.value = input.getAttribute('value') ?? '';
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
    const fields = fieldsByWrapper();
    for (const wrapper of element.querySelectorAll<HTMLElement>('.form-element-wrapper[name]')) {
      const field = fields.get(wrapper.getAttribute('name') ?? '');
      if (!field?.multiple) continue;
      for (const button of wrapper.querySelectorAll<HTMLButtonElement>('button')) {
        if (button.closest('.form-element-wrapper') !== wrapper) continue;
        const key = button.closest('[data-uniqid]')?.getAttribute('data-uniqid');
        const count = field.rows?.length ?? 0;
        const index = field.rows?.findIndex(row => row.uniqid === key) ?? -1;
        const cls = button.classList;
        button.disabled = ((cls.contains('btn-plus') || cls.contains('btn-copy')) && count >= (field.multiple.max ?? Infinity)) ||
          (cls.contains('btn-minus') && count <= (field.multiple.min ?? 0)) ||
          (cls.contains('btn-move-up') && index <= 0) ||
          (cls.contains('btn-move-down') && index >= count - 1);
      }
    }
    if (focus) {
      let control: HTMLElement | undefined = element.contains(focus.active) ? focus.active : controls().find(c => c.name === focus!.name);
      if (!control && focus.emptyAddWrapper) {
        control = Array.from(element.querySelectorAll<HTMLButtonElement>('button.btn-plus'))
          .find(button => button.closest('.form-element-wrapper[name]')?.getAttribute('name') === focus!.emptyAddWrapper);
      }
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
  sync();
  return {
    sync,
    disconnect() {
      unsubscribe();
      element.removeEventListener('input', onInput);
      element.removeEventListener('change', onInput);
      element.removeEventListener('click', onClick);
      element.removeEventListener('pointerdown', onPointerDown);
    },
  };
}
