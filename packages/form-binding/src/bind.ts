/**
 * Browser validation of a server-rendered complete form (form-runtime.md, "Browser validation").
 */
import { FormInputError, hiddenPaths, validate, type ValidationError, type ValidationResult } from '@crudui/validator';

import { collectData } from './data.js';
import { containsFile, dataControls, isControl, nodeOf, nodePath, nodesByPath } from './nodes.js';
import { formBody, writeFormErrors, writeNodeErrors } from './slots.js';

/** Options of `bindForm`; every member is optional. */
export interface FormBindingOptions {
  /** The `keyPrefix` the form was compiled with: the first segment of every control name. */
  keyPrefix?: string;
  /** The text shown for a validation error; without it the error's `message` is shown. */
  message?: (error: ValidationError) => string;
  /** The form errors written at each validation of the whole form; without it none are written. */
  formErrors?: (result: ValidationResult) => string[];
}

/** A connected form. */
export interface FormBinding {
  /** Validate the whole form as a submission does, write every node and the form errors, and return the result. */
  validate(): ValidationResult;
  /** Remove every listener of the binding and the `novalidate` attribute it added; the error markup stays as it is. */
  dispose(): void;
}

const OPTIONS = new Set(['keyPrefix', 'message', 'formErrors']);

function checkedOptions(options: unknown): FormBindingOptions {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new TypeError('Binding options must be an object');
  }
  for (const name of Object.keys(options)) {
    if (!OPTIONS.has(name)) throw new TypeError(`Unknown binding option: ${name}`);
  }
  const { keyPrefix, message, formErrors } = options as Record<string, unknown>;
  if (keyPrefix !== undefined && typeof keyPrefix !== 'string') throw new TypeError('keyPrefix must be a string');
  if (message !== undefined && typeof message !== 'function') throw new TypeError('message must be a function');
  if (formErrors !== undefined && typeof formErrors !== 'function') throw new TypeError('formErrors must be a function');
  return options as FormBindingOptions;
}

/**
 * Validate a server-rendered form in the browser with the specification the server validates it
 * with: a changed node when its control loses focus and on every later change, and the whole form
 * on submit, where an invalid form is not submitted. The `hidden` attribute of every node follows
 * its `design.show` against the data when the form binds and after every change.
 *
 * @param form - The parsed `form` element that holds one complete form.
 * @param spec - The specification the server validates the form with, its composition resolved.
 * @param options - Key prefix and texts.
 * @throws {TypeError} for a value outside the contract, in the documented order.
 */
export function bindForm(form: HTMLFormElement, spec: Record<string, unknown>, options: FormBindingOptions = {}): FormBinding {
  if (typeof form !== 'object' || form === null || (form as Element).tagName !== 'FORM') {
    throw new TypeError('bindForm requires a form element');
  }
  const { keyPrefix, message, formErrors } = checkedOptions(options);
  const body = formBody(form);
  const view = form.ownerDocument.defaultView!;
  // Nodes changed by the user and not yet validated, and nodes validated since binding, by path.
  const changed = new Set<string>();
  const validated = new Set<string>();
  let whole = false;

  const text = (error: ValidationError): string => {
    const shown = message ? message(error) : error.message;
    if (typeof shown !== 'string') throw new TypeError('message must return a string');
    return shown;
  };

  /** Validate the data and write every node, or the validated nodes; return the result and the failing nodes. */
  const run = (all: boolean): { result: ValidationResult; failing: HTMLElement[] } => {
    const nodes = nodesByPath(body);
    const raw = validate(spec, collectData(body, keyPrefix));
    const errors = raw.errors.filter((error) => {
      const node = nodes.get(error.path);
      if (!node) throw new FormInputError(`Unknown error path: ${error.path}`);
      return !containsFile(node);
    });
    const result: ValidationResult = errors.length === raw.errors.length ? raw : { valid: errors.length === 0, errors, hidden: raw.hidden };
    const messages = new Map<HTMLElement, string[]>();
    for (const error of errors) {
      const node = nodes.get(error.path)!;
      messages.set(node, [...(messages.get(node) ?? []), text(error)]);
    }
    const formTexts = all && formErrors ? formErrors(result) : [];
    if (!Array.isArray(formTexts) || formTexts.some((item) => typeof item !== 'string')) {
      throw new TypeError('formErrors must return a list of strings');
    }
    const controls = dataControls(body);
    for (const [path, node] of nodes) {
      if (!all && !whole && !validated.has(path)) continue;
      const own = messages.get(node) ?? [];
      writeNodeErrors(node, own);
      for (const control of controls) {
        if (nodeOf(body, control) !== node) continue;
        if (own.length) control.setAttribute('aria-invalid', 'true');
        else control.removeAttribute('aria-invalid');
      }
    }
    if (all) {
      writeFormErrors(body, formTexts);
      whole = true;
    }
    return { result, failing: [...messages.keys()] };
  };

  /**
   * Write the `hidden` attribute of every node with a data path from `design.show` against the
   * data, and remove the errors of each node that becomes hidden and of the nodes inside it.
   */
  const display = () => {
    const hidden = new Set(hiddenPaths(spec, collectData(body, keyPrefix)));
    const controls = dataControls(body);
    for (const node of body.querySelectorAll<HTMLElement>('[data-field-path]')) {
      const hide = hidden.has(node.getAttribute('data-field-path')!);
      if (hide === node.hidden) continue;
      node.hidden = hide;
      if (!hide) continue;
      for (const inner of [node, ...node.querySelectorAll<HTMLElement>('[data-field-path], [data-crudui-row-key]')]) {
        writeNodeErrors(inner, []);
      }
      for (const control of controls) {
        if (node.contains(control)) control.removeAttribute('aria-invalid');
      }
    }
  };

  const pathOf = (target: EventTarget | null): string | undefined =>
    isControl(body, target) ? nodePath(nodeOf(body, target)!) : undefined;

  const onChange = (event: Event) => {
    const path = pathOf(event.target);
    if (path === undefined) return;
    display();
    if (whole || validated.has(path)) run(false);
    else changed.add(path);
  };

  const onFocusOut = (event: Event) => {
    const path = pathOf(event.target);
    if (path === undefined || !changed.has(path)) return;
    changed.delete(path);
    validated.add(path);
    run(false);
  };

  /** Focus the first enabled control inside a failing node, without scrolling, then reveal it. */
  const focusFirst = (failing: HTMLElement[]) => {
    const target = Array.from(body.querySelectorAll<HTMLElement>('input:not([type="hidden" i]), select, textarea, button'))
      .find((candidate) => !candidate.matches(':disabled') && !candidate.closest('[hidden]')
        && failing.some((node) => node.contains(candidate)));
    if (!target) return;
    target.focus({ preventScroll: true, focusVisible: true } as FocusOptions);
    // A document without layout (jsdom) has no scrollIntoView.
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };

  const onSubmit = (event: Event) => {
    if (event.target !== form) return;
    const { result, failing } = run(true);
    if (result.valid) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    focusFirst(failing);
  };

  // The rules decide validity: the browser's constraint validation would stop a submission first.
  const addedNoValidate = !form.noValidate;
  form.noValidate = true;
  display();
  form.addEventListener('input', onChange);
  form.addEventListener('change', onChange);
  form.addEventListener('focusout', onFocusOut);
  view.addEventListener('submit', onSubmit, { capture: true });

  return {
    validate: () => run(true).result,
    dispose() {
      form.removeEventListener('input', onChange);
      form.removeEventListener('change', onChange);
      form.removeEventListener('focusout', onFocusOut);
      view.removeEventListener('submit', onSubmit, { capture: true });
      if (addedNoValidate) form.noValidate = false;
    },
  };
}
