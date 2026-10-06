/**
 * The data a native submission of the rendered form sends, as a server receives it after decoding
 * the bracketed control names (form-runtime.md, "Data").
 */
import { FormInputError } from '@polyspec/crudui-validator';

import { dataControls, type Control } from './nodes.js';

type Data = Record<string, unknown>;

const NAME = /^([^[\]]+)((?:\[[^[\]]*\])*)$/;

/** The values a control submits, each with its line breaks written as CRLF. */
function submitted(control: Control): string[] {
  let values: string[];
  if (control.tagName === 'SELECT') {
    values = Array.from((control as HTMLSelectElement).selectedOptions, (option) => option.value);
  } else if (control.tagName === 'INPUT' && ['checkbox', 'radio'].includes((control as HTMLInputElement).type)) {
    values = (control as HTMLInputElement).checked ? [control.value] : [];
  } else {
    values = [control.value];
  }
  return values.map((value) => value.replace(/\r\n|\r|\n/g, '\r\n'));
}

/** The path segments of a control name without the key prefix, and whether it appends to a list. */
function segments(name: string, keyPrefix: string | undefined): { path: string[]; list: boolean } {
  const match = NAME.exec(name);
  if (!match) throw new FormInputError(`Malformed control name: ${name}`);
  const path = [match[1]!, ...Array.from(match[2]!.matchAll(/\[([^[\]]*)\]/g), (part) => part[1]!)];
  const list = path[path.length - 1] === '';
  if (list) path.pop();
  if (keyPrefix !== undefined) {
    if (path[0] !== keyPrefix) throw new FormInputError(`Control name outside the key prefix: ${name}`);
    path.shift();
  }
  if (path.length === 0 || path.includes('')) throw new FormInputError(`Malformed control name: ${name}`);
  return { path, list };
}

/** Whether a value is a group of members, not a value or a list. */
function isGroup(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Set a member as an own property, also for names such as `__proto__`. */
function define(target: Data, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/** Place one submitted value at the path its name denotes. */
function place(data: Data, name: string, keyPrefix: string | undefined, value: string): void {
  const { path, list } = segments(name, keyPrefix);
  const conflict = () => new FormInputError(`Control name is both a value and a group: ${name}`);
  let target = data;
  for (const key of path.slice(0, -1)) {
    if (!Object.hasOwn(target, key)) define(target, key, {});
    const next = target[key];
    if (!isGroup(next)) throw conflict();
    target = next;
  }
  const leaf = path[path.length - 1]!;
  const present = Object.hasOwn(target, leaf);
  const current = target[leaf];
  if (list) {
    if (!present) define(target, leaf, [value]);
    else if (Array.isArray(current)) current.push(value);
    else throw conflict();
  } else if (!present) {
    define(target, leaf, value);
  } else if (typeof current === 'string') {
    throw new FormInputError(`Repeated control name: ${name}`);
  } else {
    throw conflict();
  }
}

/**
 * Build the data from the controls of a form body.
 *
 * @throws {FormInputError} for the first control name outside the decoding rules, in control order.
 */
export function collectData(body: HTMLElement, keyPrefix: string | undefined): Data {
  const data: Data = {};
  for (const control of dataControls(body)) {
    for (const value of submitted(control)) place(data, control.name, keyPrefix, value);
  }
  return data;
}
