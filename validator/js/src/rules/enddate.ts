/**
 * End Date validation rule
 *
 * Validates that an end date is greater than or equal to a start date field
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { parseDate } from './date';
import { getValueByPath } from './equalTo';

/**
 * End Date rule definition
 */
export const enddateRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages, allData, pathSegments } = context;

    // Skip if no rule param
    if (ruleParam === null || ruleParam === undefined) {
      return null;
    }

    // Skip validation if value is empty (required rule handles this)
    if (isEmpty(value)) {
      return null;
    }

    // Parse the end date (current field value)
    const endDate = parseDate(value);
    if (endDate === null) {
      return null; // Invalid date format, let date rule handle it
    }

    // Get the start date field path
    let startDatePath = String(ruleParam);

    // Handle relative paths
    if (startDatePath.startsWith('.')) {
      const parentPath = pathSegments.slice(0, -1);
      const relativeParts = startDatePath.split('.');

      for (const part of relativeParts) {
        if (part === '') {
          if (parentPath.length > 0) {
            parentPath.pop();
          }
        } else {
          parentPath.push(part);
        }
      }
      startDatePath = parentPath.join('.');
    }

    // Get the start date value
    const startDateValue = getValueByPath(allData, startDatePath);

    // Skip if start date is empty
    if (isEmpty(startDateValue)) {
      return null;
    }

    // Parse the start date
    const startDate = parseDate(startDateValue);
    if (startDate === null) {
      return null; // Invalid start date, skip validation
    }

    // Compare dates
    if (endDate.getTime() < startDate.getTime()) {
      return messages?.enddate ?? 'End date must be after the start date.';
    }

    return null;
  },

  defaultMessage: 'End date must be after the start date.',
};

export default enddateRule;
