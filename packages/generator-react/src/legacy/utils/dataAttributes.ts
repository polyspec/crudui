/**
 * Data Attributes Utilities
 *
 * Functions for generating Legacy-compatible data attributes
 * for form validation (data-rule-name, data-name, data-default)
 */

import type { ReactFieldSpec } from '../types';

/**
 * Monotonic counter backing generateUniqid().
 *
 * A deterministic counter (instead of Math.random()) keeps server-rendered
 * markup and the client hydration pass in sync: both render passes consume
 * the sequence in the same component order, so the emitted data-uniqid
 * values match and React reports no hydration mismatch.
 */
let uniqidCounter = 0;

/**
 * Seed so every id is exactly 13 hex chars, like PHP uniqid()
 * (e.g. "6a2beba1cf601"). 0x1000000000000 = 2^48, well below
 * Number.MAX_SAFE_INTEGER.
 */
const UNIQID_SEED = 0x1000000000000;

/**
 * Generate Legacy-compatible uniqid
 * Format: __[13 hex chars]__ (same length as PHP uniqid())
 *
 * Deterministic and SSR-safe: sequential ids, identical between an SSR pass
 * and the client hydration pass. Matches the `{13}` pattern used by
 * isUniqueKey()/extractUniqueKeys() in utils/path.
 */
export function generateUniqid(): string {
  const id = (UNIQID_SEED + uniqidCounter++).toString(16);
  return `__${id}__`;
}

/**
 * Reset the uniqid counter (test helper).
 * Call between renders when a test asserts on exact data-uniqid values.
 */
export function resetUniqid(): void {
  uniqidCounter = 0;
}

/**
 * Convert dot notation path to bracket notation with optional key prefix.
 *
 * This is the canonical bracket-notation converter — new code must call this
 * function, not toBracketNotation().
 *
 * Example: "common.email" -> "common[email]"
 * Example: "user.address.city" -> "user[address][city]"
 * Example: "items[0].name" -> "items[0][name]"
 * Example: with keyPrefix "product": "basic.name" -> "product[basic][name]"
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

  if (current) {
    segments.push(current);
  }

  if (keyPrefix) {
    segments.unshift(keyPrefix);
  }

  if (segments.length === 0) return '';
  if (segments.length === 1) return segments[0]!;

  // First segment is root, rest are in brackets
  return segments[0] + segments.slice(1).map(s => `[${s}]`).join('');
}

/**
 * Convert dot notation path to bracket notation
 *
 * @deprecated Use toBracketNotationWithPrefix(path) instead — it is the
 * canonical implementation; this wrapper only delegates to it.
 */
export function toBracketNotation(path: string): string {
  return toBracketNotationWithPrefix(path);
}

/**
 * Convert path to rule-name format (bracket notation without key prefix)
 * Example: "basic.name" -> "basic[name]"
 * Example: "pricing.price" -> "pricing[price]"
 * Example: "name" -> "name"
 */
export function toRuleNameNotation(path: string): string {
  const segments = path.split('.');
  if (segments.length <= 1) return path;

  // First segment + rest in brackets
  return segments[0] + segments.slice(1).map(s => `[${s}]`).join('');
}

/**
 * Generate Legacy-compatible data attributes for a field
 * These attributes are used by legacy-client.validate.js for client-side validation
 *
 * Output format matches Legacy PHP:
 * - data-rule-name: path in bracket notation (for rule lookup), e.g., "basic[name]"
 * - data-name: field name only (for error messages)
 * - data-default: default value from spec
 */
export function getLegacyDataAttributes(
  spec: ReactFieldSpec,
  path: string,
  _language: string = 'ko'
): Record<string, string> {
  const attributes: Record<string, string> = {};

  // data-rule-name: path in bracket notation (matching original Legacy)
  // Example: "basic.name" -> "basic[name]"
  attributes['data-rule-name'] = toRuleNameNotation(path);

  // data-name: field name only for error messages
  const fieldName = path.includes('.') ? path.split('.').pop()! : path;
  attributes['data-name'] = fieldName;

  // data-default: default value from spec
  if (spec.default !== undefined && spec.default !== null) {
    attributes['data-default'] = String(spec.default);
  } else {
    attributes['data-default'] = '';
  }

  return attributes;
}

/**
 * Get CSS classes for input field
 * Returns Bootstrap-compatible classes with valid-target for validation
 */
export function getInputClasses(
  baseClass: string,
  spec: ReactFieldSpec,
  hasError?: boolean
): string {
  const classes = ['valid-target', 'form-control'];

  if (baseClass) {
    classes.push(baseClass);
  }

  if (spec.input_class) {
    classes.push(spec.input_class);
  }

  if (hasError) {
    classes.push('is-invalid');
  }

  return classes.join(' ');
}

/**
 * Get CSS classes for select field
 * Returns Bootstrap-compatible classes with valid-target for validation
 * Uses form-select class to match Legacy PHP output
 */
export function getSelectClasses(
  spec: ReactFieldSpec,
  hasError?: boolean
): string {
  const classes = ['valid-target', 'form-select'];

  if (spec.input_class) {
    classes.push(spec.input_class);
  }

  if (hasError) {
    classes.push('is-invalid');
  }

  return classes.join(' ');
}

/**
 * Get CSS classes for checkbox field
 * Returns Legacy-compatible classes with valid-target for validation
 * Note: PHP Legacy uses only "valid-target" class, not form-check-input
 */
export function getCheckboxClasses(
  spec: ReactFieldSpec,
  hasError?: boolean
): string {
  const classes = ['valid-target'];

  if (spec.input_class) {
    classes.push(spec.input_class);
  }

  if (hasError) {
    classes.push('is-invalid');
  }

  return classes.join(' ');
}

/**
 * Spread helper for JSX - returns attributes as object for spreading
 */
export function spreadLegacyAttributes(
  spec: ReactFieldSpec,
  path: string,
  language: string = 'ko'
): Record<string, string> {
  return getLegacyDataAttributes(spec, path, language);
}
