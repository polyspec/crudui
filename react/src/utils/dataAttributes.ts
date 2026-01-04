/**
 * Data Attributes Utilities
 *
 * Functions for generating Limepie-compatible data attributes
 * for form validation (data-rule-name, data-name, data-default)
 */

import type { ReactFieldSpec, MultiLangText } from '../types';

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
 * Generate Limepie-compatible data attributes for a field
 * These attributes are used by dist.validate.js for client-side validation
 *
 * Output format matches Limepie PHP:
 * - data-rule-name: path in dot notation (for rule lookup)
 * - data-name: human-readable field name (for error messages)
 * - data-default: default value from spec
 */
export function getLimepieDataAttributes(
  spec: ReactFieldSpec,
  path: string,
  language: string = 'ko'
): Record<string, string> {
  const attributes: Record<string, string> = {};

  // data-rule-name: field name only (matching original Limepie behavior)
  // Original Limepie uses just the field name, not the full path
  const fieldName = path.includes('.') ? path.split('.').pop()! : path;
  attributes['data-rule-name'] = fieldName;

  // data-name: field name for error messages (matching original Limepie)
  // Original Limepie uses the field name, not the label
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
 */
export function getSelectClasses(
  spec: ReactFieldSpec,
  hasError?: boolean
): string {
  const classes = ['valid-target', 'form-control'];

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
 * Returns Bootstrap-compatible classes with valid-target for validation
 */
export function getCheckboxClasses(
  spec: ReactFieldSpec,
  hasError?: boolean
): string {
  const classes = ['valid-target', 'form-check-input'];

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
