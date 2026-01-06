/**
 * Data Attributes Utilities
 *
 * Functions for generating Limepie-compatible data attributes
 * for form validation (data-rule-name, data-name, data-default)
 */

import type { ReactFieldSpec, MultiLangText } from '../types';

/**
 * Generate Limepie-compatible uniqid
 * Format: __[12 hex chars]__ (similar to PHP uniqid)
 */
export function generateUniqid(): string {
  const chars = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * 16));
  }
  return `__${id}__`;
}

/**
 * Convert dot notation path to bracket notation with optional key prefix
 * Example: "common.email" -> "common[email]"
 * Example: "user.address.city" -> "user[address][city]"
 * Example: with keyPrefix "product": "basic.name" -> "product[basic][name]"
 */
export function toBracketNotationWithPrefix(path: string, keyPrefix?: string): string {
  const baseBracket = toBracketNotation(path);
  if (!keyPrefix) return baseBracket;

  // Convert "basic[name]" to "product[basic][name]"
  // or "name" to "product[name]"
  if (baseBracket.includes('[')) {
    const firstBracket = baseBracket.indexOf('[');
    const firstPart = baseBracket.substring(0, firstBracket);
    const rest = baseBracket.substring(firstBracket);
    return `${keyPrefix}[${firstPart}]${rest}`;
  }
  return `${keyPrefix}[${baseBracket}]`;
}

/**
 * Convert dot notation path to bracket notation
 * Example: "common.email" -> "common[email]"
 * Example: "user.address.city" -> "user[address][city]"
 * Example: "items[0].name" -> "items[0][name]"
 */
export function toBracketNotation(path: string): string {
  if (!path) return '';

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

  if (segments.length === 0) return '';
  if (segments.length === 1) return segments[0]!;

  // First segment is root, rest are in brackets
  return segments[0] + segments.slice(1).map(s => `[${s}]`).join('');
}

/**
 * Get display name from spec label
 * Extracts the appropriate text for error messages
 */
function getDisplayName(label: string | MultiLangText | undefined, language: string = 'ko'): string {
  if (!label) return '';

  if (typeof label === 'string') {
    return label;
  }

  // Multi-language object: prefer current language, fall back to ko, then first available
  if (typeof label === 'object') {
    return label[language as keyof typeof label] || label.ko || label.en || Object.values(label)[0] || '';
  }

  return '';
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
 * Generate Limepie-compatible data attributes for a field
 * These attributes are used by dist.validate.js for client-side validation
 *
 * Output format matches Limepie PHP:
 * - data-rule-name: path in bracket notation (for rule lookup), e.g., "basic[name]"
 * - data-name: field name only (for error messages)
 * - data-default: default value from spec
 */
export function getLimepieDataAttributes(
  spec: ReactFieldSpec,
  path: string,
  language: string = 'ko'
): Record<string, string> {
  const attributes: Record<string, string> = {};

  // data-rule-name: path in bracket notation (matching original Limepie)
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
 * Uses form-select class to match Limepie PHP output
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
 * Returns Limepie-compatible classes with valid-target for validation
 * Note: PHP Limepie uses only "valid-target" class, not form-check-input
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
export function spreadLimepieAttributes(
  spec: ReactFieldSpec,
  path: string,
  language: string = 'ko'
): Record<string, string> {
  return getLimepieDataAttributes(spec, path, language);
}
