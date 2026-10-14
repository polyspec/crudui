// Checks that narrow the unknown values of the scripts: the JSON that a script reads and the error that it catches. A value
// of another shape fails with an Error that names it instead of being asserted to a type (kit K157, K158).
import { readFileSync } from 'node:fs';

/** Whether `value` is a JSON object: neither null nor an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `value` as an object; throws an Error that names `what` otherwise. */
export function record(value: unknown, what: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${what} is no object`);
  return value;
}

/** `value` as an array; throws an Error that names `what` otherwise. */
export function array(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${what} is no array`);
  return value;
}

/** `value` as a string; throws an Error that names `what` otherwise. */
export function string(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new Error(`${what} is no string`);
  return value;
}

/** `value` as an array of strings; throws an Error that names `what` otherwise. */
export function strings(value: unknown, what: string): string[] {
  return array(value, what).map((item, index) => string(item, `${what}[${index}]`));
}

/** `value` as an object of strings; throws an Error that names `what` otherwise. */
export function stringRecord(value: unknown, what: string): Record<string, string> {
  return Object.fromEntries(Object.entries(record(value, what)).map(([key, item]) => [key, string(item, `${what}.${key}`)]));
}

/** The JSON text `text` as an unknown value, which the caller checks. */
export function parseJson(text: string): unknown {
  return JSON.parse(text);
}

/** The JSON file `file` as an unknown value, which the caller checks. */
export function readJson(file: string): unknown {
  return parseJson(readFileSync(file, 'utf8'));
}

/** The `code` of a caught error, such as ENOENT of a Node.js system error; undefined when it has none. */
export function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

/** The message of a caught value: the message of an Error, or the value as text. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The stack of a caught Error, or its message when it has no stack, or the caught value as text. */
export function errorReport(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
