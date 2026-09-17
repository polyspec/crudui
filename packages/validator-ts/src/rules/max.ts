/**
 * Maximum value validation rule
 *
 * A nonempty value passes when it is numeric and not above the inclusive maximum
 * (validation-rules.md, "Numbers"). A value that is not numeric fails.
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { formatMessage, isFiniteNumber, numericValue } from '../values/index';

/**
 * Max rule definition
 */
export const maxRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // A false or null parameter disables the rule.
    if (ruleParam === false || ruleParam === null || ruleParam === undefined) {
      return null;
    }
    if (!isFiniteNumber(ruleParam)) {
      throw new TypeError('Invalid max parameter: expected a finite number');
    }

    // An empty value passes without evaluation (required handles it).
    if (isEmpty(value)) {
      return null;
    }

    const number = numericValue(value);
    if (number === undefined || number > ruleParam) {
      return formatMessage(messages?.max ?? 'Please enter a value less than or equal to {0}.', ruleParam);
    }

    return null;
  },
};
