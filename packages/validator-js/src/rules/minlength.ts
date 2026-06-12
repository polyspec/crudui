/**
 * Minimum length validation rule
 *
 * Validates that a string has at least the specified number of characters
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';

/**
 * Get the length of a value.
 * For strings, returns the Unicode code point count (NOT UTF-16 code units):
 * an astral character such as an emoji counts as 1, matching PHP
 * (preg_split('//u') / mb_strlen) and Go (utf8.RuneCountInString) and the
 * legacy server (Validation.php:468 preg_split('//u')). value.length would
 * count a surrogate pair as 2 and diverge.
 * For arrays, returns the number of elements.
 */
export function getLength(value: unknown): number {
  if (typeof value === 'string') {
    return [...value].length;
  }

  if (Array.isArray(value)) {
    return value.length;
  }

  return 0;
}

/**
 * Minlength rule definition
 */
export const minlengthRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // Skip if no rule param
    if (ruleParam === null || ruleParam === undefined) {
      return null;
    }

    // Skip validation if value is empty (required rule handles this)
    if (isEmpty(value)) {
      return null;
    }

    const minLength = Number(ruleParam);
    if (isNaN(minLength)) {
      return null;
    }

    const length = getLength(value);

    if (length < minLength) {
      const message =
        messages?.minlength ?? `Please enter at least ${minLength} characters.`;
      return message.replace('{0}', String(minLength));
    }

    return null;
  },

  defaultMessage: 'Please enter at least {0} characters.',
};

export default minlengthRule;
