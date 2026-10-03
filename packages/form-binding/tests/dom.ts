// Server-rendered forms parsed into a jsdom document, as a browser receives them.
import { compileForm, createForm } from '@crudui/generator-core';
import { renderForm } from '@crudui/generator-html';
import { JSDOM } from 'jsdom';

/** The render options of `renderForm` that the tests pass. */
export interface RenderOptions {
  errors?: Array<{ path: string; message: string }>;
  formErrors?: string[];
  hidden?: Record<string, string>;
}

/** The complete form of a specification and data, with the key prefix `form` and a form element. */
export function formHtml(spec: Record<string, unknown>, data: Record<string, unknown>, options: RenderOptions = {}): string {
  const instance = createForm(compileForm(spec, { keyPrefix: 'form' }), data, { language: 'en' });
  return renderForm(instance, { action: { method: 'post', url: '/submit' }, ...options });
}

/** A document holding the given body markup, with its window. */
export function documentOf(body: string): { window: JSDOM['window']; document: Document } {
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, { url: 'https://crudui.test/' });
  return { window: dom.window, document: dom.window.document };
}

/** The parsed form element of the complete form of a specification and data. */
export function renderedForm(spec: Record<string, unknown>, data: Record<string, unknown>, options: RenderOptions = {}): {
  window: JSDOM['window']; document: Document; form: HTMLFormElement;
} {
  const { window, document } = documentOf(formHtml(spec, data, options));
  return { window, document, form: document.querySelector('form')! };
}

/** The control of a submission name. */
export function control<T extends Element = HTMLInputElement>(form: HTMLFormElement, name: string, value?: string): T {
  const found = Array.from(form.querySelectorAll<HTMLInputElement>('[name]'))
    .find(element => element.name === name && (value === undefined || element.value === value));
  if (!found) throw new Error(`No control named ${name}${value === undefined ? '' : ` with value ${value}`}`);
  return found as unknown as T;
}

/** The node element of a data path. */
export function node(form: HTMLFormElement, path: string): HTMLElement {
  const found = Array.from(form.querySelectorAll<HTMLElement>('[data-field-path]')).find(element => element.dataset.fieldPath === path);
  if (!found) throw new Error(`No node with path ${path}`);
  return found;
}

/** The error texts written in a node's errors slot. */
export function nodeErrors(element: Element): string[] {
  return Array.from(element.children)
    .filter(child => child.classList.contains('crudui-node__errors'))
    .flatMap(slot => Array.from(slot.children, paragraph => paragraph.textContent ?? ''));
}

/** Type into a text control: set its value and fire `input`, as a keystroke does. */
export function type(window: JSDOM['window'], element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  element.focus();
  element.value = value;
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
}

/** Move focus away from a control: blur fires `focusout` on it. */
export function leave(element: HTMLElement): void {
  element.blur();
}
