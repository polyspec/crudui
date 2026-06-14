/**
 * useForm Hook
 *
 * Main hook for form state management
 */

import { useState, useCallback, useMemo, useRef, type ChangeEvent, type FocusEvent } from 'react';
import { Validator } from '@crudui/validator/legacy';
import type { Spec } from '@crudui/validator/legacy';
import type { FormData, FormErrors, FormValue, UseFormReturn } from '../types';
import { getValueByPath, setValueByPath } from '../utils/path';

/**
 * Remove a key from an errors map without mutating the original.
 * Returns the original object when the key is absent (referential stability).
 */
function removeError(errors: FormErrors, path: string): FormErrors {
  if (!(path in errors)) {
    return errors;
  }
  const next = { ...errors };
  delete next[path];
  return next;
}

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

  // Latest form data, updated synchronously by the mutators below.
  // Lets setValue/validate read the current data inside the same act/batch
  // without waiting for a re-render.
  const dataRef = useRef(data);

  // Recreated whenever the spec changes (a ref would keep validating
  // against the first spec forever).
  const validator = useMemo(() => new Validator(spec), [spec]);

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
      const newData = setValueByPath(dataRef.current, path, value);
      dataRef.current = newData;
      setData(newData);
      onChange?.(path, value, newData);

      if (validationMode === 'onChange') {
        // Validate synchronously against the just-computed data
        const error = validator.validateField(path, value, newData as Record<string, unknown>);
        setErrors((prev) => (error ? { ...prev, [path]: error } : removeError(prev, path)));
      } else {
        // Clear stale error when value changes; onBlur/onSubmit modes
        // re-validate later
        setErrors((prev) => removeError(prev, path));
      }
    },
    [onChange, validationMode, validator]
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
      let newData = dataRef.current;
      for (const [path, value] of Object.entries(values)) {
        newData = setValueByPath(newData, path, value);
      }
      dataRef.current = newData;
      setData(newData);
    },
    []
  );

  /**
   * Reset form
   */
  const reset = useCallback((newData?: FormData) => {
    const resetData = newData ?? initialDataRef.current;
    dataRef.current = resetData;
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
      const currentData = dataRef.current;
      const value = getValueByPath(currentData, path);
      const error = validator.validateField(path, value, currentData as Record<string, unknown>);

      setErrors((prev) => (error ? { ...prev, [path]: error } : removeError(prev, path)));

      return error;
    },
    [validator]
  );

  /**
   * Validate entire form
   */
  const validate = useCallback((): FormErrors => {
    const result = validator.validate(dataRef.current as Record<string, unknown>);
    const newErrors: FormErrors = {};

    for (const error of result.errors) {
      newErrors[error.path] = error.message;
    }

    setErrors(newErrors);
    onValidate?.(newErrors);

    return newErrors;
  }, [validator, onValidate]);

  /**
   * Submit form
   */
  const submit = useCallback(async () => {
    setIsSubmitting(true);

    try {
      const formErrors = validate();

      if (onSubmit) {
        await onSubmit(dataRef.current, formErrors);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [validate, onSubmit]);

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
