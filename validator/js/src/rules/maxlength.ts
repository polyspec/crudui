/**
 * Maximum length validation rule
 *
 * Validates that a string has at most the specified number of characters
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { getLength } from './minlength';

/**
 * Maxlength rule definition
 */
export const maxlengthRule: RuleDefinition = {
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

    const maxLength = Number(ruleParam);
    if (isNaN(maxLength)) {
      return null;
    }

    const length = getLength(value);

    if (length > maxLength) {
      const message =
        messages?.maxlength ?? `Please enter no more than ${maxLength} characters.`;
      return message.replace('{0}', String(maxLength));
    }

    return null;
  },

  defaultMessage: 'Please enter no more than {0} characters.',
};

export default maxlengthRule;
