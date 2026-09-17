/**
 * Step validation rule
 *
 * A nonempty value passes when it is numeric and an integer multiple of the step,
 * counted from 0 and decided exactly on the canonical decimal texts
 * (validation-rules.md, "Numbers"). A value that is not numeric fails.
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { formatMessage, isMultiple, isStep, numericValue } from '../values/index';

/** The parameter message of `step`. */
export const STEP_PARAMETER_ERROR = 'Invalid step parameter: expected a finite number above 0';

/**
 * Step rule definition
 */
export const stepRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // A false or null parameter disables the rule.
    if (ruleParam === false || ruleParam === null || ruleParam === undefined) {
      return null;
    }
    if (!isStep(ruleParam)) {
      throw new TypeError(STEP_PARAMETER_ERROR);
    }

    // An empty value passes without evaluation (required handles it).
    if (isEmpty(value)) {
      return null;
    }

    const number = numericValue(value);
    if (number === undefined || !isMultiple(number, ruleParam)) {
      return formatMessage(messages?.step ?? 'Please enter a value that is a multiple of {0}.', ruleParam);
    }

    return null;
  },
};
