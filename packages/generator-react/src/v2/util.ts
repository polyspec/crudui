/**
 * v2 generator low-level helpers — framework-independent string/name/path
 * primitives. These reproduce the verified Limepie envelope conventions
 * (limepieParity.ts) that the Svelte reference render uses, so the v2 envelope
 * is bit-identical to the proven v1 output after normalization. NO v1 meta key
 * is read here; these are pure structural primitives (escaping, name/id
 * derivation, php-string casts, deterministic uniqid, value lookup).
 */

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

/** Effective display value: default applies only when the value string is empty. */
export function applyDefaultString(value: unknown, def: unknown): string {
  const v = phpString(value);
  if (v.length === 0 && def !== undefined && def !== null && !Array.isArray(def)) {
    return phpString(def);
  }
  return v;
}

// ---------------------------------------------------------------------------
// deterministic uniqid (token LENGTH is contractual; value is masked by the
// normalizer — see fixtures README)
// ---------------------------------------------------------------------------

let uniqidCounter = 0;
const UNIQID_SEED = 0x1000000000000;

/** Deterministic Limepie-shaped uniqid: `__[13 hex]__`. */
export function generateUniqid(): string {
  const id = (UNIQID_SEED + uniqidCounter++).toString(16);
  return `__${id}__`;
}

/** Reset the uniqid counter between renders for stable ids. */
export function resetUniqid(): void {
  uniqidCounter = 0;
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
  return segments[0] + segments.slice(1).map((s) => `[${s}]`).join('');
}

const UNIQUE_KEY_SEGMENT = /^__[a-z0-9]{13,14}__$/;

function pathSegmentsLoose(path: string): string[] {
  return path
    .replace(/\[([^\]]*)\]/g, '.$1')
    .split('.')
    .filter((s) => s !== '');
}

/** Leaf data-name for a dot path. */
export function leafName(path: string): string {
  let suffix = '';
  let p = path;
  if (p.endsWith('[]')) {
    suffix = '[]';
    p = p.slice(0, -2);
  }
  const segments = pathSegmentsLoose(p);
  const last = segments[segments.length - 1] ?? p;
  if (UNIQUE_KEY_SEGMENT.test(last)) {
    return (segments[segments.length - 2] ?? '') + '[]';
  }
  return last + suffix;
}

/** data-rule-name for a dot path: bracket notation relative to the form root. */
export function ruleNameForPath(path: string): string {
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
      .map((s) => (UNIQUE_KEY_SEGMENT.test(s) ? '[]' : `[${s}]`))
      .join('') +
    suffix
  );
}

/** Wrapper layer name for a dot path (`{dotName}-layer`). */
export function wrapperLayerName(path: string, keyPrefix?: string): string {
  const dotName = path.split('[]').join('.*');
  return keyPrefix ? `${keyPrefix}.${dotName}-layer` : `${dotName}-layer`;
}

/**
 * Normalize an inline CSS string to canonical "prop: val; prop: val" form, or
 * undefined when empty (so the attribute is omitted).
 */
export function styleString(style: unknown): string | undefined {
  if (typeof style !== 'string' || style.trim() === '') return undefined;
  const decls: string[] = [];
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (!prop || !val) continue;
    decls.push(`${prop}: ${val}`);
  }
  return decls.length > 0 ? decls.join('; ') : undefined;
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
