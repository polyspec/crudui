/**
 * Max Count validation rule
 *
 * Validates that an array has at most the specified number of items
 */

import { RuleDefinition, ValidationContext } from '../types';
import { getArrayLength } from './mincount';

/**
 * Max Count rule definition
 */
export const maxcountRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // Skip if no rule param
    if (ruleParam === null || ruleParam === undefined) {
      return null;
    }

    // NOTE: maxcount does not skip empty values; an empty array always
    // satisfies maxcount (count 0 <= max)

    const maxCount = Number(ruleParam);
    if (isNaN(maxCount)) {
      return null;
    }

    const count = getArrayLength(value);

    if (count > maxCount) {
      const message = messages?.maxcount ?? `Please select no more than ${maxCount} items.`;
      return message.replace('{0}', String(maxCount));
    }

    return null;
  },

  defaultMessage: 'Please select no more than {0} items.',
};

export default maxcountRule;
