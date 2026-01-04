/**
 * Range validation rule
 *
 * Validates that a numeric value is within the specified range [min, max]
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { toNumber } from './min';

/**
 * Range rule definition
 */
export const rangeRule: RuleDefinition = {
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

    // Expect [min, max] array
    if (!Array.isArray(ruleParam) || ruleParam.length !== 2) {
      return null;
    }

    const [min, max] = ruleParam;
    const minValue = Number(min);
    const maxValue = Number(max);

    if (isNaN(minValue) || isNaN(maxValue)) {
      return null;
    }

    const numValue = toNumber(value);
    if (numValue === null) {
      return null; // Not a valid number, skip validation
    }

    if (numValue < minValue || numValue > maxValue) {
      const message = messages?.range ?? `Please enter a value between ${minValue} and ${maxValue}.`;
      return message.replace('{0}', String(minValue)).replace('{1}', String(maxValue));
    }

    return null;
  },

  defaultMessage: 'Please enter a value between {0} and {1}.',
};

export default rangeRule;
