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
import { Validator, parseCondition, evaluateCondition } from '@form-spec/validator';
import type { Spec, FieldSpec, PathContext } from '@form-spec/validator';
import type {
  FormContextValue,
  FormData,
  FormErrors,
  FormValue,
  FieldComponentProps,
} from '../types';
import { getValueByPath, setValueByPath, parsePathString } from '../utils/path';
import {
  applyDisplaySwitchTransform,
  hasDisplayTargetConditionMaps,
} from '../hooks/legacyDisplay';
import { applyLangAppendTransform } from '../hooks/legacyLang';

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
  /** Key prefix for field names (e.g., "product" -> "product[field][name]") */
  keyPrefix?: string;
  /** UI language — legacy parser-stage label localization (lang: append). */
  language?: string;
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
  keyPrefix = '',
  language = 'ko',
}: FormContextProviderProps) {
  const [data, setData] = useState<FormData>(() => initialData);
  const [errors, setErrors] = useState<FormErrors>({});
  const registeredFields = useRef<Set<string>>(new Set());

  // Create the validator from the ORIGINAL spec — the Phase B validator owns
  // display_switch/display_target validation semantics and must never see the
  // render-side legacy transform below. Recreated whenever the spec changes:
  // a ref-guarded singleton would keep validating against the FIRST spec
  // forever after a spec swap (same fix as useForm.ts).
  const validator = useMemo(() => new Validator(spec), [spec]);

  // Render spec: legacy Parser ports, in parser order — the `lang:` element
  // expansion (LanguageHandler, incl. the display_switch list patch) runs
  // BEFORE Parser\ElementVisibilityManager. Map-form display_switch rewrites
  // SIBLING specs (identifying class + display:none style + display_target
  // condition maps) and puts the inline onchange JS on the controlling
  // field. Memoized — the transform draws random tokens.
  const renderSpec = useMemo(
    () => applyDisplaySwitchTransform(applyLangAppendTransform(spec, language)),
    [spec, language]
  );

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
        if (prev[path]) {
          // Re-validate with new value
          const error = validator.validateField(path, value, newData as Record<string, unknown>);
          if (error) {
            return { ...prev, [path]: error };
          }
          const rest = { ...prev };
          delete rest[path];
          return rest;
        }
        return prev;
      });
    },
    [onChange, validator]
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
        const rest = { ...prev };
        delete rest[path];
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
      const value = getValueByPath(data, path);
      const error = validator.validateField(path, value, data as Record<string, unknown>);

      if (error) {
        setErrors((prev) => ({ ...prev, [path]: error }));
      } else {
        setErrors((prev) => {
          if (prev[path]) {
            const rest = { ...prev };
            delete rest[path];
            return rest;
          }
          return prev;
        });
      }

      return error;
    },
    [data, validator]
  );

  /**
   * Validate entire form
   */
  const validateForm = useCallback((): FormErrors => {
    const result = validator.validate(data as Record<string, unknown>);
    const newErrors: FormErrors = {};

    for (const error of result.errors) {
      newErrors[error.path] = error.message;
    }

    setErrors(newErrors);
    onValidate?.(newErrors);

    return newErrors;
  }, [data, onValidate, validator]);

  /**
   * Check if field should be visible based on conditional display rules
   */
  const isFieldVisible = useCallback(
    (path: string): boolean => {
      // Find field spec (render spec — post display_switch transform)
      const pathSegments = parsePathString(path);
      const fieldSpec = getFieldSpecByPath(renderSpec.properties, pathSegments);

      if (!fieldSpec) return true;

      // Check display_switch condition
      if (fieldSpec.display_switch) {
        // Boolean true = unconditional on; the legacy map form controls
        // SIBLING presentation, never this field's own visibility (string
        // form is a condition expression; boolean false never enters here).
        if (typeof fieldSpec.display_switch !== 'string') {
          return true;
        }
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

      // Check display_target condition. Truthy-target semantics apply only
      // WITHOUT legacy condition maps — with maps, the wrapper stays in the
      // DOM and resolveDisplayTargetParts owns its style/class (golden:
      // ProductNft option groups render hidden, never removed).
      if (
        fieldSpec.display_target &&
        !hasDisplayTargetConditionMaps(fieldSpec as Record<string, unknown>)
      ) {
        const targetValue = getValueByPath(data, fieldSpec.display_target);
        // Field is visible if target field has a truthy value
        return Boolean(targetValue);
      }

      return true;
    },
    [renderSpec, data]
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
      spec: renderSpec,
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
      keyPrefix,
    }),
    [
      renderSpec,
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
      keyPrefix,
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
