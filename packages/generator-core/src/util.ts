/**
 * Shared string conversion, field paths, names and identifiers.
 * Repeated rows use row keys in field paths; rule paths replace repeated
 * segments with [].
 */

import { styleString } from './css';
export { styleString } from './css';

/** HTML attribute-value escaping. */
export function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** HTML text escaping. */
export function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** PHP (string) cast semantics for scalar spec/data values. */
export function phpString(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? '1' : '';
  if (Array.isArray(v) || typeof v === 'object') return '';
  return String(v);
}

/** PHP truthiness of an already string-cast value ('' and '0' are falsy). */
export function phpTruthy(s: string): boolean {
  return s !== '' && s !== '0';
}

/** Apply a default only when input data is missing. */
export function applyDefaultString(value: unknown, def: unknown): string {
  const v = phpString(value);
  if (value === undefined && def !== undefined && def !== null && !Array.isArray(def)) {
    return phpString(def);
  }
  return v;
}

/**
 * Deterministic element id from a field path (DOM-id uniqueness without a magic
 * token). The path is unique per field, so cleanStr(path) is a stable id that is
 * identical across frameworks — no per-render counter, no normalizer mask needed.
 */
export function elementId(prefix: string, path: string): string {
  const base = cleanStr(path).replace(/[^A-Za-z0-9_-]/g, '-');
  return prefix ? `${prefix}-${base}` : base;
}

// ---------------------------------------------------------------------------
// path / name conventions
// ---------------------------------------------------------------------------

/** Parse a dot/bracket path string to segments. */
export function parsePathString(path: string): string[] {
  if (!path) return [];
  const segments: string[] = [];
  let current = '';
  let inBracket = false;
  for (let i = 0; i < path.length; i++) {
    const ch = path[i]!;
    if (ch === '[' && !inBracket) {
      if (current) {
        segments.push(current);
        current = '';
      }
      inBracket = true;
    } else if (ch === ']' && inBracket) {
      if (current) {
        segments.push(current);
        current = '';
      }
      inBracket = false;
    } else if (ch === '.' && !inBracket) {
      if (current) {
        segments.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) segments.push(current);
  return segments;
}

/** Read the value at a dot/bracket path. */
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

/** Convert dot path → bracket notation with optional key prefix. */
export function toBracketNotationWithPrefix(path: string, keyPrefix?: string): string {
  if (!path) return keyPrefix ? `${keyPrefix}[]` : '';
  const segments = parsePathString(path);
  if (keyPrefix) segments.unshift(keyPrefix);
  if (segments.length === 0) return '';
  if (segments.length === 1) return segments[0]!;
  return segments[0]! + segments.slice(1).map((s) => `[${s}]`).join('');
}

/**
 * \Legacy\clean_str(): str_replace(['[]','][','[',']'], ['','-','-','-']).
 * Used to derive deterministic element ids from bracket-notation names
 * (choice/multichoice/search) — paired with elementId() (path-derived, stable
 * across frameworks). No random token, no normalizer mask.
 */
export function cleanStr(s: string): string {
  return s
    .split('[]').join('')
    .split('][').join('-')
    .split('[').join('-')
    .split(']').join('-');
}

function pathSegmentsLoose(path: string): string[] {
  return path
    .replace(/\[([^\]]*)\]/g, '.$1')
    .split('.')
    .filter((s) => s !== '');
}

/** Leaf data-name for a dot path. A repeated row segment collapses to `name[]`. */
export function leafName(path: string, rowSegments: readonly number[] = []): string {
  let suffix = '';
  let p = path;
  if (p.endsWith('[]')) {
    suffix = '[]';
    p = p.slice(0, -2);
  }
  const segments = pathSegmentsLoose(p);
  const last = segments[segments.length - 1] ?? p;
  if (rowSegments.includes(segments.length - 1)) {
    return (segments[segments.length - 2] ?? '') + '[]';
  }
  return last + suffix;
}

/** data-rule-name for a dot path: bracket notation relative to the form root. */
export function ruleNameForPath(path: string, rowSegments: readonly number[] = []): string {
  let suffix = '';
  let p = path;
  if (p.endsWith('[]')) {
    suffix = '[]';
    p = p.slice(0, -2);
  }
  const segments = pathSegmentsLoose(p);
  if (segments.length <= 1) return (segments[0] ?? p) + suffix;
  return (
    segments[0] +
    segments
      .slice(1)
      .map((s, i) => (rowSegments.includes(i + 1) ? '[]' : `[${s}]`))
      .join('') +
    suffix
  );
}

/** Wrapper layer name for a dot path (`{dotName}-layer`). */
export function wrapperLayerName(path: string, keyPrefix?: string): string {
  const dotName = path.split('[]').join('.*');
  return keyPrefix ? `${keyPrefix}.${dotName}-layer` : `${dotName}-layer`;
}

/** Merge two style strings (design node + structural), dropping empties. */
export function mergeStyle(...parts: Array<string | undefined>): string | undefined {
  const joined = parts.filter((p) => p && p.trim()).join('; ');
  return styleString(joined);
}

/** Join class tokens, dropping empties and deduping whitespace. */
export function joinClass(...parts: Array<string | undefined | false>): string {
  return parts
    .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Encode a form scope and field path without collapsing distinct names. */
export function controlId(prefix: string, path: string): string {
  return `${encodeURIComponent(prefix)}:${encodeURIComponent(path)}`;
}
