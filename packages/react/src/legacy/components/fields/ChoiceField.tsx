/**
 * ChoiceField Component
 *
 * Radio button group for single selection
 */

import React, { useCallback, useMemo } from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation } from '../../utils/dataAttributes';

/**
 * ChoiceField component
 */
export function ChoiceField({
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

  const handleChange = useCallback(
    (optionValue: string) => {
      if (!disabled && !readonly) {
        onChange(optionValue);
      }
    },
    [onChange, disabled, readonly]
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
  const bracketName = toBracketNotation(path);

  return (
    <div
      className={isHorizontal ? 'd-flex flex-wrap gap-3' : ''}
      role="radiogroup"
      aria-labelledby={`${path}-label`}
    >
      {options.map((option, index) => {
        const optionId = `${path}-${option.value}`;
        const isChecked = value === option.value;

        return (
          <div key={option.value} className="form-check">
            <input
              type="radio"
              id={optionId}
              name={bracketName}
              value={option.value}
              checked={isChecked}
              onChange={() => handleChange(option.value)}
              onBlur={index === options.length - 1 ? onBlur : undefined}
              disabled={disabled}
              readOnly={readonly}
              className={`valid-target form-check-input ${error ? 'is-invalid' : ''}`}
              {...(index === 0 ? getLimepieDataAttributes(spec, path, language) : {})}
            />
            <label className="form-check-label" htmlFor={optionId}>
              {option.label}
            </label>
          </div>
        );
      })}
    </div>
  );
}

export default ChoiceField;
