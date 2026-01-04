/**
 * Maximum value validation rule
 *
 * Validates that a numeric value is at most the specified maximum
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { toNumber } from './min';

/**
 * Max rule definition
 */
export const maxRule: RuleDefinition = {
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

    const maxValue = Number(ruleParam);
    if (isNaN(maxValue)) {
      return null;
    }

    const numValue = toNumber(value);
    // Skip if value cannot be converted to a number (number rule handles this)
    if (numValue === null) {
      return null;
    }

    if (numValue > maxValue) {
      const message = messages?.max ?? `Please enter a value of at most ${maxValue}.`;
      return message.replace('{0}', String(maxValue));
    }

    return null;
  },

  defaultMessage: 'Please enter a value of at most {0}.',
};

export default maxRule;
