/**
 * Input text checks (docs/spec/input-text.md). Every string and object member name in a
 * specification, a composition file and caller data is a sequence of Unicode scalar values. A
 * JavaScript string that contains an unpaired surrogate code unit is rejected before any other
 * check of the operation; it is never replaced and never passed on.
 */

import { ComposeLoadError } from '../compose/errors';
import type { FileLoader, LoadedDoc } from '../compose/loader';
import { FormInputError } from '../validate/errors';

/** Message of every input text failure. */
export const INVALID_TEXT_MESSAGE = 'Text must be Unicode scalar values';

const SURROGATE = /[\uD800-\uDFFF]/;

/** Whether `text` has no unpaired surrogate code unit. */
export function isScalarText(text: string): boolean {
  if (!SURROGATE.test(text)) return true;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0xd800 || unit > 0xdfff) continue;
    if (unit > 0xdbff) return false;
    const next = text.charCodeAt(i + 1);
    if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    i++;
  }
  return true;
}

/** Compare two well-formed strings in code point order. */
export function compareCodePoints(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x === y) continue;
    // A surrogate encodes a code point above every unit from U+E000 to U+FFFF.
    const rank = (unit: number) => (unit >= 0xe000 ? unit - 0x800 : unit >= 0xd800 ? unit + 0x2000 : unit);
    return rank(x) - rank(y);
  }
  return a.length - b.length;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Search `value` unless it is a container already on the current path (`ancestors`), which the
 * operation's own value checks report; `visit` runs with the container on the path.
 */
function within<T>(value: object, ancestors: Set<object>, visit: () => T, skipped: T): T {
  if (ancestors.has(value)) return skipped;
  ancestors.add(value);
  try {
    return visit();
  } finally {
    ancestors.delete(value);
  }
}

function containsInvalid(value: unknown, ancestors: Set<object>): boolean {
  if (typeof value === 'string') return !isScalarText(value);
  if (Array.isArray(value)) return within(value, ancestors, () => value.some(item => containsInvalid(item, ancestors)), false);
  if (!isPlainObject(value)) return false;
  return within(value, ancestors, () => Object.keys(value).some(key =>
    !isScalarText(key) || containsInvalid(value[key], ancestors)), false);
}

function firstInvalid(value: unknown, path: string[], ancestors: Set<object>): string[] | undefined {
  if (typeof value === 'string') return isScalarText(value) ? undefined : path;
  if (Array.isArray(value)) {
    return within(value, ancestors, () => {
      for (let i = 0; i < value.length; i++) {
        const found = firstInvalid(value[i], [...path, String(i)], ancestors);
        if (found) return found;
      }
      return undefined;
    }, undefined);
  }
  if (!isPlainObject(value)) return undefined;
  return within(value, ancestors, () => {
    const keys = Object.keys(value);
    // A member name is reported at its object; members follow in code point order of their names.
    if (!keys.every(isScalarText)) return path;
    for (const key of keys.sort(compareCodePoints)) {
      const found = firstInvalid(value[key], [...path, key], ancestors);
      if (found) return found;
    }
    return undefined;
  }, undefined);
}

/**
 * The path of the first invalid text in `value`: the path of a string, or of the object whose
 * member name is invalid. Members are visited in code point order of their names, array items in
 * index order. `undefined` when every text is valid.
 */
export function invalidTextPath(value: unknown): string[] | undefined {
  return containsInvalid(value, new Set()) ? firstInvalid(value, [], new Set()) : undefined;
}

/**
 * Check a specification and the composition files the operation reads. Invalid text is the load
 * failure `INVALID_TEXT`, located at its specification path or at the file name followed by its
 * path in the file; an invalid file name is located at the empty path.
 */
export function checkSpecificationText(spec: unknown, files?: unknown): void {
  for (const value of [spec, files]) {
    const at = invalidTextPath(value);
    if (at) throw new ComposeLoadError('INVALID_TEXT', INVALID_TEXT_MESSAGE, at);
  }
}

/** Check named caller values in order; invalid text is `INVALID_FORM_INPUT` naming the value and path. */
export function checkInputText(inputs: ReadonlyArray<readonly [string, unknown]>): void {
  for (const [name, value] of inputs) {
    const path = invalidTextPath(value);
    if (path) throw new FormInputError(`${INVALID_TEXT_MESSAGE}: ${[name, ...path].join('.')}`);
  }
}

/** Check the present options named in `names`, given in code point order, as `options.{name}`. */
export function checkOptionText(options: unknown, names: readonly string[]): void {
  if (options === null || typeof options !== 'object') return;
  const record = options as Record<string, unknown>;
  checkInputText(names.filter(name => record[name] !== undefined).map(name => [`options.${name}`, record[name]] as const));
}

/** A loader that checks each document it loads, located as a composition file. */
export function checkedLoader(loader: FileLoader): FileLoader {
  return {
    normalize: (path: string, basepath: string) => loader.normalize(path, basepath),
    load: (key: string): LoadedDoc => {
      const doc = loader.load(key);
      const at = invalidTextPath(doc);
      if (at) throw new ComposeLoadError('INVALID_TEXT', INVALID_TEXT_MESSAGE, [key, ...at]);
      return doc;
    },
  };
}

/**
 * Check the specification side of an operation: the specification, then the files it reads, or
 * wrap its custom loader. Returns the loader the operation composes with.
 */
export function checkedComposition(
  spec: unknown,
  options: { files?: unknown; loader?: FileLoader },
): FileLoader | undefined {
  checkSpecificationText(spec, options.loader ? undefined : options.files);
  return options.loader ? checkedLoader(options.loader) : undefined;
}
