/**
 * limepieParity — framework-independent field-level helpers reproducing the
 * Limepie PHP Generator\Fields output semantics. Ported verbatim from
 * packages/generator-react/src/components/fields/limepieParity.ts (the
 * verified parity blueprint); the only adaptation is that style helpers
 * return a CSS STRING (Svelte uses string style attributes) instead of a
 * React CSSProperties object.
 *
 * The reference fixtures (tests/fixtures/reference-html) are the single source of
 * truth. Do NOT "improve" these helpers — every rule is a verbatim port of
 * the PHP implementation.
 */

export type SpecNode = Record<string, unknown>;

/**
 * PHP (string) cast semantics for scalar spec/data values.
 * false -> '', true -> '1', null/undefined -> '', arrays/objects -> ''.
 */
export function phpString(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? '1' : '';
  if (Array.isArray(v) || typeof v === 'object') return '';
  return String(v);
}

/**
 * PHP truthiness of an already string-cast value ('' and '0' are falsy).
 */
export function phpTruthy(s: string): boolean {
  return s !== '' && s !== '0';
}

/**
 * PHP (float) cast rendered through string interpolation:
 * (float)'10' -> "10", (float)'0.50' -> "0.5", (float)'abc' -> "0".
 */
export function phpFloatString(v: unknown): string {
  const n = parseFloat(phpString(v));
  return String(Number.isNaN(n) ? 0 : n);
}

/**
 * Effective display value following the PHP field pattern:
 *   if (0 === strlen((string)$value) && isset($property['default'])) use it.
 */
export function applyDefaultString(value: unknown, def: unknown): string {
  const v = phpString(value);
  if (v.length === 0 && def !== undefined && def !== null && !Array.isArray(def)) {
    return phpString(def);
  }
  return v;
}

/**
 * \Limepie\clean_str(): str_replace(['[]','][','[',']'], ['','-','-','-']).
 */
export function cleanStr(s: string): string {
  return s
    .split('[]').join('')
    .split('][').join('-')
    .split('[').join('-')
    .split(']').join('-');
}

const UNIQUE_KEY_SEGMENT = /^__[a-z0-9]{13,14}__$/;

/** Split a path on dots, tolerating bracketed segments ("a[b].c" -> a,b,c). */
function pathSegments(path: string): string[] {
  return path
    .replace(/\[([^\]]*)\]/g, '.$1')
    .split('.')
    .filter((s) => s !== '');
}

/**
 * Leaf data-name for a dot path — the PHP `$propertyName` argument.
 */
export function leafName(path: string): string {
  let suffix = '';
  let p = path;
  if (p.endsWith('[]')) {
    suffix = '[]';
    p = p.slice(0, -2);
  }
  const segments = pathSegments(p);
  const last = segments[segments.length - 1] ?? p;
  if (UNIQUE_KEY_SEGMENT.test(last)) {
    return (segments[segments.length - 2] ?? '') + '[]';
  }
  return last + suffix;
}

/**
 * data-rule-name for a dot path: bracket notation relative to the form root.
 */
export function ruleNameForPath(path: string): string {
  let suffix = '';
  let p = path;
  if (p.endsWith('[]')) {
    suffix = '[]';
    p = p.slice(0, -2);
  }
  const segments = pathSegments(p);
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

/**
 * Ordered item entries for select/choice/multichoice/search `items`.
 */
export function itemEntries(items: unknown): Array<[string, unknown]> {
  if (items === null || items === undefined) return [];
  if (Array.isArray(items)) {
    if (items.length > 0 && items.every((e) => Array.isArray(e) && e.length === 2)) {
      return items.map((e) => [phpString((e as unknown[])[0]), (e as unknown[])[1]]);
    }
    return items.map((v, i) => [String(i), v]);
  }
  if (typeof items === 'object') return Object.entries(items);
  return [];
}

/**
 * Wrapper layer name for a dot path (Group::getDotName + "-layer").
 */
export function wrapperLayerName(path: string, keyPrefix?: string): string {
  const dotName = path.split('[]').join('.*');
  return keyPrefix ? `${keyPrefix}.${dotName}-layer` : `${dotName}-layer`;
}

/**
 * The Limepie validation attribute trio.
 */
export function limepieDataAttrs(spec: SpecNode, path: string): Record<string, string> {
  return {
    'data-name': leafName(path),
    'data-rule-name': ruleNameForPath(path),
    'data-default': phpString(spec.default),
  };
}

/**
 * Parse an inline CSS string into a CANONICAL CSS STRING for the Svelte
 * `style` attribute. Returns undefined for empty input so the style attribute
 * is omitted (normalize.js drops empty style="" anyway). Declarations are
 * trimmed and rejoined with "; " — the normalizer canonicalizes further.
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

/**
 * HTML attribute-value escaping for legacy-raw markup branches.
 */
export function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** HTML text escaping for legacy-raw markup branches. */
export function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Charset of \Limepie\genRandomString(): no i/l/o/0/1.
 */
const TOKEN_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

let choiceTokenCounter = 0;

/**
 * Deterministic stand-in for PHP genRandomString(5) used in choice input ids.
 */
export function nextChoiceToken(): string {
  let n = choiceTokenCounter++;
  let token = '';
  for (let i = 0; i < 5; i++) {
    token = TOKEN_CHARS[n % TOKEN_CHARS.length] + token;
    n = Math.floor(n / TOKEN_CHARS.length);
  }
  return token;
}

/** Reset the choice token sequence between renders. */
export function resetChoiceTokens(): void {
  choiceTokenCounter = 0;
}
