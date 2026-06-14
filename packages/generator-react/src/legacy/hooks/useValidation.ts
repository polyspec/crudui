/**
 * useValidation Hook
 *
 * Hook for form validation using @crudui/validator
 */

import { useCallback, useMemo } from 'react';
import { Validator, getRule } from '@crudui/validator/legacy';
import type { Spec, ValidationContext } from '@crudui/validator/legacy';
import type { FormData, FormErrors, FormValue, UseValidationReturn } from '../types';
import { parsePathString } from '../utils/path';

/**
 * useValidation hook options
 */
interface UseValidationOptions {
  /** Form specification */
  spec: Spec;
}

/**
 * useValidation hook
 */
export function useValidation({ spec }: UseValidationOptions): UseValidationReturn {
  // Recreated whenever the spec changes (a lazily-filled ref would keep
  // validating against the first spec forever).
  const validator = useMemo(() => new Validator(spec), [spec]);
  const getValidator = useCallback(() => validator, [validator]);

  /**
   * Validate single field
   */
  const validateField = useCallback(
    (path: string, value: FormValue): string | null => {
      const validator = getValidator();
      const allData: Record<string, FormValue> = {};

      // Set the value in a mock data object
      const segments = parsePathString(path);
      let current: Record<string, unknown> = allData;

      for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i]!;
        if (!current[segment]) {
          current[segment] = {};
        }
        current = current[segment] as Record<string, unknown>;
      }

      const lastSegment = segments[segments.length - 1];
      if (lastSegment) {
        current[lastSegment] = value;
      }

      return validator.validateField(path, value, allData as Record<string, unknown>);
    },
    [getValidator]
  );

  /**
   * Validate multiple fields
   */
  const validateFields = useCallback(
    (fields: Record<string, FormValue>): FormErrors => {
      const errors: FormErrors = {};
      const validator = getValidator();

      for (const [path, value] of Object.entries(fields)) {
        const error = validator.validateField(path, value, fields as Record<string, unknown>);
        if (error) {
          errors[path] = error;
        }
      }

      return errors;
    },
    [getValidator]
  );

  /**
   * Validate entire form data
   */
  const validateForm = useCallback(
    (data: FormData): FormErrors => {
      const validator = getValidator();
      const result = validator.validate(data as Record<string, unknown>);
      const errors: FormErrors = {};

      for (const error of result.errors) {
        errors[error.path] = error.message;
      }

      return errors;
    },
    [getValidator]
  );

  /**
   * Check if value is valid for a specific rule
   */
  const checkRule = useCallback(
    (ruleName: string, value: FormValue, param: unknown): boolean => {
      const rule = getRule(ruleName);

      if (!rule) {
        // Unknown rule, assume valid
        return true;
      }

      const context: ValidationContext = {
        path: '',
        field: '',
        value,
        allData: {},
        spec: { type: 'text' },
        pathSegments: [],
        ruleParam: param,
      };

      const error = rule.validate(context);
      return error === null;
    },
    []
  );

  return {
    validateField,
    validateFields,
    validateForm,
    checkRule,
  };
}

export default useValidation;
