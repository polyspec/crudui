/**
 * useForm Hook
 *
 * Main hook for form state management
 */

import { useState, useCallback, useMemo, useRef, type ChangeEvent, type FocusEvent } from 'react';
import { Validator } from '@limepie/form-validator/legacy';
import type { Spec } from '@limepie/form-validator/legacy';
import type { FormData, FormErrors, FormValue, UseFormReturn } from '../types';
import { getValueByPath, setValueByPath, parsePathString } from '../utils/path';

/**
 * useForm hook options
 */
interface UseFormOptions {
  /** Form specification */
  spec: Spec;
  /** Initial form data */
  initialData?: FormData;
  /** Validation mode: 'onChange' | 'onBlur' | 'onSubmit' */
  validationMode?: 'onChange' | 'onBlur' | 'onSubmit';
  /** Submit handler */
  onSubmit?: (data: FormData, errors: FormErrors) => void | Promise<void>;
  /** Change handler */
  onChange?: (name: string, value: FormValue, data: FormData) => void;
  /** Validation handler */
  onValidate?: (errors: FormErrors) => void;
}

/**
 * useForm hook
 */
export function useForm({
  spec,
  initialData = {},
  validationMode = 'onBlur',
  onSubmit,
  onChange,
  onValidate,
}: UseFormOptions): UseFormReturn {
  const [data, setData] = useState<FormData>(() => initialData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initialDataRef = useRef(initialData);
  const validatorRef = useRef<Validator | null>(null);

  // Create validator
  if (!validatorRef.current) {
    validatorRef.current = new Validator(spec);
  }

  /**
   * Check if form is dirty (has changes)
   */
  const isDirty = useMemo(() => {
    return JSON.stringify(data) !== JSON.stringify(initialDataRef.current);
  }, [data]);

  /**
   * Check if form is valid
   */
  const isValid = useMemo(() => {
    return Object.keys(errors).length === 0;
  }, [errors]);

  /**
   * Set value at path
   */
  const setValue = useCallback(
    (path: string, value: FormValue) => {
      setData((prev: FormData) => {
        const newData = setValueByPath({ ...prev }, path, value);
        onChange?.(path, value, newData);
        return newData;
      });

      // Always validate on change - rules are checked sequentially
      // and first failed rule shows error immediately
      const validator = validatorRef.current;
      if (validator) {
        // Defer validation to next tick to use updated data
        setTimeout(() => {
          setData((currentData: FormData) => {
            const error = validator.validateField(path, value, currentData as Record<string, unknown>);
            if (error) {
              setErrors((prev) => ({ ...prev, [path]: error }));
            } else {
              // Clear error if validation passes
              setErrors((prev) => {
                if (prev[path]) {
                  const { [path]: _, ...rest } = prev;
                  return rest;
                }
                return prev;
              });
            }
            return currentData;
          });
        }, 0);
      }
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
   * Set multiple values
   */
  const setValues = useCallback(
    (values: FormData) => {
      setData((prev: FormData) => {
        let newData = { ...prev };
        for (const [path, value] of Object.entries(values)) {
          newData = setValueByPath(newData, path, value);
        }
        return newData;
      });
    },
    []
  );

  /**
   * Reset form
   */
  const reset = useCallback((newData?: FormData) => {
    const resetData = newData ?? initialDataRef.current;
    setData(resetData);
    setErrors({});
    if (newData) {
      initialDataRef.current = newData;
    }
  }, []);

  /**
   * Validate single field
   */
  const validateField = useCallback(
    (path: string): string | null => {
      const validator = validatorRef.current;
      if (!validator) return null;

      const value = getValueByPath(data, path);
      const error = validator.validateField(path, value, data as Record<string, unknown>);

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
  const validate = useCallback((): FormErrors => {
    const validator = validatorRef.current;
    if (!validator) return {};

    const result = validator.validate(data as Record<string, unknown>);
    const newErrors: FormErrors = {};

    for (const error of result.errors) {
      newErrors[error.path] = error.message;
    }

    setErrors(newErrors);
    onValidate?.(newErrors);

    return newErrors;
  }, [data, onValidate]);

  /**
   * Submit form
   */
  const submit = useCallback(async () => {
    setIsSubmitting(true);

    try {
      const formErrors = validate();

      if (onSubmit) {
        await onSubmit(data, formErrors);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [validate, data, onSubmit]);

  /**
   * Handle input change event
   */
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, type } = e.target;
      let value: FormValue;

      if (type === 'checkbox') {
        value = (e.target as HTMLInputElement).checked;
      } else if (type === 'file') {
        const files = (e.target as HTMLInputElement).files;
        value = files?.length === 1 ? files[0] : files;
      } else if (type === 'number') {
        const numValue = parseFloat(e.target.value);
        value = isNaN(numValue) ? e.target.value : numValue;
      } else {
        value = e.target.value;
      }

      setValue(name, value);
    },
    [setValue]
  );

  /**
   * Handle input blur event
   */
  const handleBlur = useCallback(
    (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name } = e.target;

      if (validationMode === 'onBlur') {
        validateField(name);
      }
    },
    [validationMode, validateField]
  );

  return {
    data,
    errors,
    isValid,
    isDirty,
    isSubmitting,
    setValue,
    getValue,
    setValues,
    reset,
    validateField,
    validate,
    submit,
    handleChange,
    handleBlur,
  };
}

export default useForm;
