/**
 * Equal To validation rule
 *
 * Validates that a value matches another field's value
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import {
  getValueByPath as getValueBySegments,
  parsePathString,
  resolveFieldReference,
} from '../parser/PathResolver';

/**
 * Get value from form data by dot-notation path string.
 * Thin wrapper over the PathResolver implementation (single source of truth
 * for path traversal).
 */
export function getValueByPath(
  data: Record<string, unknown>,
  path: string
): unknown {
  return getValueBySegments(data, parsePathString(path.replace(/^\.*/, '')));
}

/**
 * Resolve a rule param that references another field (relative or absolute).
 * Shares the relative-path semantics of condition expressions:
 * ".x" = sibling, "..x" = parent group's sibling (array indices skipped).
 */
export function resolveFieldParam(
  param: string,
  context: ValidationContext
): unknown {
  return resolveFieldReference(param, {
    currentPath: context.pathSegments,
    formData: context.allData,
  });
}

/**
 * Equal To rule definition
 */
export const equalToRule: RuleDefinition = {
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

    // Resolve the target field's value via the shared path resolver
    const targetValue = resolveFieldParam(String(ruleParam), context);

    // Compare values
    if (value !== targetValue) {
      return messages?.equalTo ?? 'Please enter the same value again.';
    }

    return null;
  },
};
