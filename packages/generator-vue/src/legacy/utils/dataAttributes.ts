/**
 * Data Attributes Utilities (framework-independent port of generator-react).
 */

import type { ReactFieldSpec } from '../types';

let uniqidCounter = 0;
const UNIQID_SEED = 0x1000000000000;

/** Generate Limepie-compatible uniqid: __[13 hex chars]__ (PHP uniqid()). */
export function generateUniqid(): string {
  const id = (UNIQID_SEED + uniqidCounter++).toString(16);
  return `__${id}__`;
}

/** Reset the uniqid counter (test helper / per-render). */
export function resetUniqid(): void {
  uniqidCounter = 0;
}

/** Convert dot notation path to bracket notation with optional key prefix. */
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

/** Convert path to rule-name format (bracket notation without key prefix). */
export function toRuleNameNotation(path: string): string {
  const segments = path.split('.');
  if (segments.length <= 1) return path;
  return segments[0] + segments.slice(1).map((s) => `[${s}]`).join('');
}

/**
 * Generate Limepie-compatible data attributes for a field (legacy validator
 * lookup keys). Fields that do not call limepieDataAttrs use this helper.
 */
export function getLimepieDataAttributes(
  spec: ReactFieldSpec,
  path: string
): Record<string, string> {
  const attributes: Record<string, string> = {};
  attributes['data-rule-name'] = toRuleNameNotation(path);
  const fieldName = path.includes('.') ? path.split('.').pop()! : path;
  attributes['data-name'] = fieldName;
  if (spec.default !== undefined && spec.default !== null) {
    attributes['data-default'] = String(spec.default);
  } else {
    attributes['data-default'] = '';
  }
  return attributes;
}

/** Bootstrap classes for input fields (valid-target form-control). */
export function getInputClasses(
  baseClass: string,
  spec: ReactFieldSpec,
  hasError?: boolean
): string {
  const classes = ['valid-target', 'form-control'];
  if (baseClass) classes.push(baseClass);
  if (spec.input_class) classes.push(spec.input_class);
  if (hasError) classes.push('is-invalid');
  return classes.join(' ');
}

/** Bootstrap classes for checkbox/switcher (valid-target). */
export function getCheckboxClasses(spec: ReactFieldSpec, hasError?: boolean): string {
  const classes = ['valid-target'];
  if (spec.input_class) classes.push(spec.input_class);
  if (hasError) classes.push('is-invalid');
  return classes.join(' ');
}
