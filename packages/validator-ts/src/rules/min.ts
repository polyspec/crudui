/**
 * Minimum value validation rule
 *
 * A nonempty value passes when it is numeric and not below the inclusive minimum
 * (validation-rules.md, "Numbers"). A value that is not numeric fails.
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { formatMessage, isFiniteNumber, numericValue } from '../values/index';

/**
 * Min rule definition
 */
export const minRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // A false or null parameter disables the rule.
    if (ruleParam === false || ruleParam === null || ruleParam === undefined) {
      return null;
    }
    if (!isFiniteNumber(ruleParam)) {
      throw new TypeError('Invalid min parameter: expected a finite number');
    }

    // An empty value passes without evaluation (required handles it).
    if (isEmpty(value)) {
      return null;
    }

    const number = numericValue(value);
    if (number === undefined || number < ruleParam) {
      return formatMessage(messages?.min ?? 'Please enter a value greater than or equal to {0}.', ruleParam);
    }

    return null;
  },
};
