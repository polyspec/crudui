/**
 * Path Utilities (framework-independent port of generator-react).
 */

import type { FormData, FormValue } from '../types';

/** Parse path string to segments array ("a.b.c", "a[0].b", "a[__key__].b"). */
export function parsePathString(path: string): string[] {
  if (!path) return [];
  const segments: string[] = [];
  let current = '';
  let inBracket = false;
  for (let i = 0; i < path.length; i++) {
    const char = path[i];
    if (char === '[' && !inBracket) {
      if (current) {
        segments.push(current);
        current = '';
      }
      inBracket = true;
    } else if (char === ']' && inBracket) {
      if (current) {
        segments.push(current);
        current = '';
      }
      inBracket = false;
    } else if (char === '.' && !inBracket) {
      if (current) {
        segments.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) segments.push(current);
  return segments;
}

/** Get value at path from object. */
export function getValueByPath(obj: FormData, path: string): FormValue {
  const segments = parsePathString(path);
  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current as FormValue;
}
