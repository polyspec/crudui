/**
 * Form Context Provider
 *
 * Provides form state and methods to all form components
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { Validator, parseCondition, evaluateCondition } from '@legacy/form-validator/legacy';
import type { Spec, FieldSpec, PathContext } from '@legacy/form-validator/legacy';
import type {
  FormContextValue,
  FormData,
  FormErrors,
  FormValue,
  FieldComponentProps,
} from '../types';
import { getValueByPath, setValueByPath, parsePathString } from '../utils/path';

/**
 * Form context
 */
const FormContext = createContext<FormContextValue | null>(null);

/**
 * Form context provider props
 */
interface FormContextProviderProps {
  children: ReactNode;
  spec: Spec;
  initialData?: FormData;
  disabled?: boolean;
  readonly?: boolean;
  customFields?: Record<string, React.ComponentType<FieldComponentProps>>;
  onChange?: (name: string, value: FormValue, data: FormData) => void;
  onValidate?: (errors: FormErrors) => void;
}

/**
 * Form context provider component
 */
export function FormContextProvider({
  children,
  spec,
  initialData = {},
  disabled = false,
  readonly = false,
  customFields = {},
  onChange,
  onValidate,
}: FormContextProviderProps) {
  const [data, setData] = useState<FormData>(() => initialData);
  const [errors, setErrors] = useState<FormErrors>({});
  const registeredFields = useRef<Set<string>>(new Set());
  const validatorRef = useRef<Validator | null>(null);

  // Create validator instance
  if (!validatorRef.current) {
    validatorRef.current = new Validator(spec);
  }

  /**
   * Set value at path
   */
  const setValue = useCallback(
    (path: string, value: FormValue) => {
      let newData: FormData = {};
      setData((prev: FormData) => {
        newData = setValueByPath({ ...prev }, path, value);
        onChange?.(path, value, newData);
        return newData;
      });
      // Re-validate if there was an error, otherwise clear
      setErrors((prev) => {
        if (prev[path] && validatorRef.current) {
          // Re-validate with new value
          const error = validatorRef.current.validateField(path, value, newData as Record<string, unknown>);
          if (error) {
            return { ...prev, [path]: error };
          }
          const { [path]: _, ...rest } = prev;
          return rest;
        }
        return prev;
      });
    },
    [onChange]
  );

  /**
   * Get value at path
   */
  const getValue = useCallback(
    (path: string): FormValue => {
      return getValueByPath(data, path);
    },
    [data]
  );

  /**
   * Set error for field
   */
  const setError = useCallback((path: string, error: string) => {
    setErrors((prev) => ({ ...prev, [path]: error }));
  }, []);

  /**
   * Clear error for field
   */
  const clearError = useCallback((path: string) => {
    setErrors((prev) => {
      if (prev[path]) {
        const { [path]: _, ...rest } = prev;
        return rest;
      }
      return prev;
    });
  }, []);

  /**
   * Validate single field
   */
  const validateField = useCallback(
    (path: string): string | null => {
      if (!validatorRef.current) return null;

      const value = getValueByPath(data, path);
      const error = validatorRef.current.validateField(path, value, data as Record<string, unknown>);

      if (error) {
        setErrors((prev) => ({ ...prev, [path]: error }));
      } else {
        setErrors((prev) => {
          if (prev[path]) {
            const { [path]: _, ...rest } = prev;
            return rest;
          }
          return prev;
        });
      }

      return error;
    },
    [data]
  );

  /**
   * Validate entire form
   */
  const validateForm = useCallback((): FormErrors => {
    if (!validatorRef.current) return {};

    const result = validatorRef.current.validate(data as Record<string, unknown>);
    const newErrors: FormErrors = {};

    for (const error of result.errors) {
      newErrors[error.path] = error.message;
    }

    setErrors(newErrors);
    onValidate?.(newErrors);

    return newErrors;
  }, [data, onValidate]);

  /**
   * Check if field should be visible based on conditional display rules
   */
  const isFieldVisible = useCallback(
    (path: string): boolean => {
      // Find field spec
      const pathSegments = parsePathString(path);
      const fieldSpec = getFieldSpecByPath(spec.properties, pathSegments);

      if (!fieldSpec) return true;

      // Check display_switch condition
      if (fieldSpec.display_switch) {
        try {
          const ast = parseCondition(fieldSpec.display_switch);
          const context: PathContext = {
            currentPath: pathSegments,
            formData: data as Record<string, unknown>,
          };
          return evaluateCondition(ast, context, 'CURRENT');
        } catch {
          return true;
        }
      }

      // Check display_target condition
      if (fieldSpec.display_target) {
        const targetValue = getValueByPath(data, fieldSpec.display_target);
        // Field is visible if target field has a truthy value
        return Boolean(targetValue);
      }

      return true;
    },
    [spec, data]
  );

  /**
   * Register field
   */
  const registerField = useCallback((path: string) => {
    registeredFields.current.add(path);
  }, []);

  /**
   * Unregister field
   */
  const unregisterField = useCallback((path: string) => {
    registeredFields.current.delete(path);
  }, []);

  const contextValue = useMemo<FormContextValue>(
    () => ({
      spec,
      data,
      errors,
      setValue,
      getValue,
      setError,
      clearError,
      validateField,
      validateForm,
      isFieldVisible,
      registerField,
      unregisterField,
      disabled,
      readonly,
      customFields,
    }),
    [
      spec,
      data,
      errors,
      setValue,
      getValue,
      setError,
      clearError,
      validateField,
      validateForm,
      isFieldVisible,
      registerField,
      unregisterField,
      disabled,
      readonly,
      customFields,
    ]
  );

  return <FormContext.Provider value={contextValue}>{children}</FormContext.Provider>;
}

/**
 * Get field spec by path
 */
function getFieldSpecByPath(
  properties: Record<string, FieldSpec>,
  pathSegments: string[]
): FieldSpec | null {
  let current: Record<string, FieldSpec> = properties;
  let fieldSpec: FieldSpec | null = null;

  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i]!;

    // Skip numeric indices and unique keys
    if (/^\d+$/.test(segment) || /^__[a-z0-9]{13}__$/.test(segment)) {
      continue;
    }

    fieldSpec = current[segment] ?? null;

    if (!fieldSpec) {
      return null;
    }

    if (fieldSpec.properties && i < pathSegments.length - 1) {
      current = fieldSpec.properties;
    }
  }

  return fieldSpec;
}

/**
 * Hook to use form context
 */
export function useFormContext(): FormContextValue {
  const context = useContext(FormContext);

  if (!context) {
    throw new Error('useFormContext must be used within a FormContextProvider');
  }

  return context;
}

export { FormContext };
