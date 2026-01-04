/**
 * Range length validation rule
 *
 * Validates that a string length is within the specified range [min, max]
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { getLength } from './minlength';

/**
 * Range length rule definition
 */
export const rangelengthRule: RuleDefinition = {
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
    const minLength = Number(min);
    const maxLength = Number(max);

    if (isNaN(minLength) || isNaN(maxLength)) {
      return null;
    }

    const length = getLength(value);

    if (length < minLength || length > maxLength) {
      const message = messages?.rangelength ?? `Please enter a value between ${minLength} and ${maxLength} characters.`;
      return message.replace('{0}', String(minLength)).replace('{1}', String(maxLength));
    }

    return null;
  },

  defaultMessage: 'Please enter a value between {0} and {1} characters.',
};

export default rangelengthRule;
