/**
 * Number validation rule
 *
 * A nonempty value passes when it is numeric (validation-rules.md, "Numbers").
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { numericValue } from '../values/index';

/** The parameter message of `number`. */
export const NUMBER_PARAMETER_ERROR = 'Invalid number parameter: expected true or false';

/**
 * Number rule definition
 */
export const numberRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // A false or null parameter disables the rule.
    if (ruleParam === false || ruleParam === null || ruleParam === undefined) {
      return null;
    }
    if (ruleParam !== true) {
      throw new TypeError(NUMBER_PARAMETER_ERROR);
    }

    // An empty value passes without evaluation (required handles it).
    if (isEmpty(value)) {
      return null;
    }

    if (numericValue(value) === undefined) {
      return messages?.number ?? 'Please enter a valid number.';
    }

    return null;
  },
};
