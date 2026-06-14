/**
 * v2 generator low-level helpers — framework-independent string/name/path
 * primitives. These reproduce the verified Limepie envelope conventions
 * (limepieParity.ts) that the Svelte/React reference renders use, so the v2
 * envelope is bit-identical to the proven v1 output after normalization. NO v1
 * meta key is read here; these are pure structural primitives (escaping,
 * name/id derivation, php-string casts, explicit position-index identity,
 * value lookup).
 *
 * G4 (SPEC §4): a repeated row's POSITION is the client-assigned serialization
 * index (deterministic, explicit), and its IDENTITY is the hidden data `id`
 * (server PK = the object key; new rows = none). No magic random token. The
 * position-index path segment is the readable marker `#N` (parsePathString keeps
 * it as one segment); it is the position, never a name, and collapses to `[]` in
 * data-name/data-rule-name (the rule applies to every row).
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
// explicit position-index identity (G4: position = client index, no magic token)
// ---------------------------------------------------------------------------

/**
 * Path segment for a repeated row at the given serialization index (G4 position).
 * `#N` is explicit and deterministic; parsePathString keeps it as one segment.
 * It is recognized by isPositionSegment() and collapses to the bracket index in
 * the submitted name and to `[]` in data-name/data-rule-name.
 */
export function positionSegment(index: number): string {
  return `#${index}`;
}

/** True when a path segment is an explicit position index (`#N`). */
export function isPositionSegment(seg: string): boolean {
  return /^#\d+$/.test(seg);
}

/** Bracket index for a position segment (`#3` → `3`); identity passthrough else. */
export function bracketIndexForSegment(seg: string): string {
  return isPositionSegment(seg) ? seg.slice(1) : seg;
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

/** Read the value at a dot/bracket path. A `#N` position segment reads index N. */
export function getValueByPath(obj: unknown, path: string): unknown {
  const segments = parsePathString(path);
  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[bracketIndexForSegment(segment)];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Position-resolved path segments for the expr engine context: every `#N`
 * position marker becomes the numeric index N (the validator's PathResolver
 * walks real array indices, never the name-only marker). Real keys pass through.
 */
export function valuePathSegments(path: string): string[] {
  return parsePathString(path).map(bracketIndexForSegment);
}

/** Convert dot path → bracket notation with optional key prefix. */
export function toBracketNotationWithPrefix(path: string, keyPrefix?: string): string {
  if (!path) return keyPrefix ? `${keyPrefix}[]` : '';
  const segments = parsePathString(path);
  if (keyPrefix) segments.unshift(keyPrefix);
  if (segments.length === 0) return '';
  if (segments.length === 1) return bracketIndexForSegment(segments[0]!);
  return (
    bracketIndexForSegment(segments[0]!) +
    segments.slice(1).map((s) => `[${bracketIndexForSegment(s)}]`).join('')
  );
}

/**
 * \Limepie\clean_str(): str_replace(['[]','][','[',']'], ['','-','-','-']).
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

/** Leaf data-name for a dot path. A row position index collapses to `name[]`. */
export function leafName(path: string): string {
  let suffix = '';
  let p = path;
  if (p.endsWith('[]')) {
    suffix = '[]';
    p = p.slice(0, -2);
  }
  const segments = pathSegmentsLoose(p);
  const last = segments[segments.length - 1] ?? p;
  if (isPositionSegment(last)) {
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
      .map((s) => (isPositionSegment(s) ? '[]' : `[${s}]`))
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
