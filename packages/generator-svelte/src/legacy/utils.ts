/**
 * Framework-independent path / data-attribute / uniqid helpers.
 * Ported from packages/generator-react/src/utils/{dataAttributes,path}.ts.
 */

let uniqidCounter = 0;
const UNIQID_SEED = 0x1000000000000;

/**
 * Generate Legacy-compatible uniqid. Format: __[13 hex chars]__ (same length
 * as PHP uniqid()). Deterministic monotonic counter so SSR is stable; the
 * parity normalizer masks the value (only token LENGTH is contractual).
 */
export function generateUniqid(): string {
  const id = (UNIQID_SEED + uniqidCounter++).toString(16);
  return `__${id}__`;
}

/** Reset the uniqid counter (call between renders for stable ids). */
export function resetUniqid(): void {
  uniqidCounter = 0;
}

/**
 * Convert dot notation path to bracket notation with optional key prefix.
 * "common.email" -> "common[email]"; with keyPrefix "product":
 * "basic.name" -> "product[basic][name]".
 */
export function toBracketNotationWithPrefix(path: string, keyPrefix?: string): string {
  if (!path) return keyPrefix ? `${keyPrefix}[]` : '';

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
  if (keyPrefix) segments.unshift(keyPrefix);
  if (segments.length === 0) return '';
  if (segments.length === 1) return segments[0]!;
  return segments[0] + segments.slice(1).map((s) => `[${s}]`).join('');
}

/**
 * Parse path string to segments array.
 * Handles "a.b.c", "a[0].b", "a[__key__].b".
 */
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

/** Get value at a dot/bracket path from an object. */
export function getValueByPath(obj: unknown, path: string): unknown {
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
  return current;
}
