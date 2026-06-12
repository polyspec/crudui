/**
 * legacyParity — field-level helpers that reproduce Legacy PHP
 * Generator\Fields output semantics exactly.
 *
 * The golden fixtures (tests/fixtures/golden-html) are the single source of
 * truth. Do NOT "improve" these helpers toward idiomatic React/HTML — every
 * rule here is a verbatim port of the PHP implementation:
 *   - phpString          : PHP (string) cast (false -> '', true -> '1')
 *   - phpFloatString     : PHP (float) cast then string interpolation
 *   - cleanStr           : \Legacy\clean_str()
 *   - nextChoiceToken    : \Legacy\genRandomString(5) charset, deterministic
 *   - legacyDataAttrs   : data-name / data-rule-name / data-default trio
 */

import type { CSSProperties } from 'react';
import type { ReactFieldSpec, FormValue } from '../../types';

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
 * Explicit boolean values are kept as-is (interactive React state), matching
 * the server-side semantics for the initial empty-data render.
 */
export function applyDefaultString(value: FormValue, def: unknown): string {
  const v = phpString(value);
  if (v.length === 0 && def !== undefined && def !== null && !Array.isArray(def)) {
    return phpString(def);
  }
  return v;
}

/**
 * \Legacy\clean_str(): str_replace(['[]','][','[',']'], ['','-','-','-']).
 */
export function cleanStr(s: string): string {
  return s
    .split('[]').join('')
    .split('][').join('-')
    .split('[').join('-')
    .split(']').join('-');
}

/**
 * Multiple-row unique key segment (`__<13hex>__`, PHP uniqid row id; the
 * 13..14 range mirrors tests/parity/normalize.js rule 2 — generateUniqid()
 * emits exactly 13 hex, same as PHP uniqid()).
 */
const UNIQUE_KEY_SEGMENT = /^__[a-z0-9]{13,14}__$/;

/** Split a path on dots, tolerating bracketed segments ("a[b].c" -> a,b,c). */
function pathSegments(path: string): string[] {
  return path
    .replace(/\[([^\]]*)\]/g, '.$1')
    .split('.')
    .filter((s) => s !== '');
}

/**
 * Leaf data-name for a dot path — the PHP `$propertyName` argument:
 *   "common.yoil.day[]"        -> "day[]"   (literal [] suffix survives)
 *   "contacts.__k13__.name"    -> "name"
 *   "additionals.__k13__"      -> "additionals[]"  (multiple leaf row: the
 *                                  original spec key was "additionals[]")
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
 * data-rule-name for a dot path: bracket notation relative to the form root
 * (no spec.key prefix). A trailing "[]" on the leaf segment survives as a
 * literal "[]" suffix ("common.yoil.day[]" -> "common[yoil][day][]").
 * Unique-key row segments collapse to "[]" — PHP passes `$nextRuleName."[]"`
 * per multiple level ("contacts.__k13__.name" -> "contacts[][name]").
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
 *
 * Legacy specs are YAML mappings whose key ORDER is part of the contract
 * (LargeForm is_option: 0/2/1). PHP arrays keep that order; plain JS
 * objects reorder integer-like keys ascending, destroying it at parse time.
 * Spec producers that must keep the order therefore pass `items` as ordered
 * entry pairs ([[key, label], ...]) — this helper accepts both forms (and
 * plain arrays, which index like PHP lists). Every field that renders items
 * MUST iterate via this helper, never Object.entries directly.
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
 * Wrapper layer name for a dot path (Group::getDotName + "-layer"): a
 * literal "[]" key suffix renders as ".*" in the layer dot name
 * ("common.yoil.day[]" -> "common.yoil.day.*-layer"); multiple specs never
 * reach here with "[]" (their data path is stripped before rendering).
 */
export function wrapperLayerName(path: string, keyPrefix?: string): string {
  const dotName = path.split('[]').join('.*');
  return keyPrefix ? `${keyPrefix}.${dotName}-layer` : `${dotName}-layer`;
}

/**
 * The Legacy validation attribute trio. data-default uses PHP string
 * interpolation of `$property['default'] ?? ''` (arrays collapse to '').
 * Fields that do NOT emit data-default in PHP (checkbox, choice,
 * multichoice) must not call this — build attributes inline instead.
 */
export function legacyDataAttrs(
  spec: ReactFieldSpec,
  path: string
): Record<string, string> {
  return {
    'data-name': leafName(path),
    'data-rule-name': ruleNameForPath(path),
    'data-default': phpString(spec.default),
  };
}

/**
 * Parse an inline CSS string ("background: #f7f7f7; pointer-events: none;")
 * into a React style object. Returns undefined for empty input so the style
 * attribute is omitted entirely (normalize.js drops empty style="" anyway).
 */
export function parseStyleString(style: unknown): CSSProperties | undefined {
  if (typeof style !== 'string' || style.trim() === '') return undefined;
  const out: Record<string, string> = {};
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (!prop || !val) continue;
    const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = val;
  }
  return Object.keys(out).length > 0 ? (out as CSSProperties) : undefined;
}

/**
 * HTML attribute-value escaping for legacy-raw markup branches. PHP emits
 * inline JS raw; escaping here is parse-equivalent (the parity normalizer
 * decodes entities) and keeps the raw HTML well-formed.
 */
export function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** HTML text escaping for legacy-raw markup branches. */
export function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Charset of \Legacy\genRandomString(): no i/l/o/0/1.
 * Matches the parity-normalization mask [a-hj-km-np-z2-9]{5}.
 */
const TOKEN_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

let choiceTokenCounter = 0;

/**
 * Deterministic stand-in for PHP genRandomString(5) used in choice input
 * ids. Sequential (SSR pass and client hydration pass consume the sequence
 * in the same component order) and unique per choice field.
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

/** Test helper: reset the choice token sequence between renders. */
export function resetChoiceTokens(): void {
  choiceTokenCounter = 0;
}
