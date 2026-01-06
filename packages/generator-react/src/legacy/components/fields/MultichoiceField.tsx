/**
 * MultichoiceField Component
 *
 * Checkbox group for multiple selection
 */

import React, { useCallback, useMemo } from 'react';
import type { FieldComponentProps, FormValue } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { useFormContext } from '../../context/FormContext';
import { getLimepieDataAttributes, toBracketNotationWithPrefix } from '../../utils/dataAttributes';

/**
 * MultichoiceField component
 */
export function MultichoiceField({
  name,
  spec,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  readonly,
  path,
  language,
}: FieldComponentProps) {
  const { t } = useI18n();
  const { keyPrefix } = useFormContext();

  // Ensure value is an array
  const selectedValues = useMemo((): string[] => {
    if (Array.isArray(value)) {
      return value.map(String);
    }
    if (value) {
      return [String(value)];
    }
    return [];
  }, [value]);

  const handleChange = useCallback(
    (optionValue: string, checked: boolean) => {
      if (disabled || readonly) return;

      let newValues: string[];

      if (checked) {
        // Add value
        newValues = [...selectedValues, optionValue];
      } else {
        // Remove value
        newValues = selectedValues.filter((v) => v !== optionValue);
      }

      onChange(newValues as FormValue);
    },
    [selectedValues, onChange, disabled, readonly]
  );

  // Parse items
  const options = useMemo(() => {
    const items = spec.items;

    if (!items || typeof items !== 'object') {
      return [];
    }

    // Check if items is dynamic
    if ('model' in items) {
      return [];
    }

    return Object.entries(items as Record<string, unknown>).map(([key, label]) => ({
      value: key,
      label: t(label as string | Record<string, string>),
    }));
  }, [spec.items, t]);

  // Layout direction
  const isHorizontal = spec.layout === 'horizontal' || spec.inline === true;

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  return (
    <div
      className={isHorizontal ? 'd-flex flex-wrap gap-3' : ''}
      role="group"
      aria-labelledby={`${path}-label`}
    >
      {options.map((option, index) => {
        const isChecked = selectedValues.includes(option.value);

        return (
          <div key={option.value} className="form-check">
            <input
              type="checkbox"
              name={`${bracketName}[]`}
              value={option.value}
              checked={isChecked}
              onChange={(e) => handleChange(option.value, e.target.checked)}
              onBlur={index === options.length - 1 ? onBlur : undefined}
              disabled={disabled}
              readOnly={readonly}
              className={`valid-target form-check-input ${error ? 'is-invalid' : ''}`}
              {...(index === 0 ? getLimepieDataAttributes(spec, path, language) : {})}
            />
            {' '}
            <span className="form-check-label">
              {option.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default MultichoiceField;
