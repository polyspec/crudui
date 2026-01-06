/**
 * ChoiceField Component
 *
 * Radio button group for single selection
 */

import React, { useCallback, useMemo } from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { useFormContext } from '../../context/FormContext';
import { getLimepieDataAttributes, toBracketNotationWithPrefix } from '../../utils/dataAttributes';

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
  const { keyPrefix } = useFormContext();

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
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  // Determine default value from spec
  const defaultValue = spec.default !== undefined ? String(spec.default) : undefined;

  return (
    <div
      className="btn-group btn-group-toggle"
      data-toggle="buttons"
      role="radiogroup"
      aria-labelledby={`${path}-label`}
    >
      {options.map((option, index) => {
        const isChecked = value === option.value;
        const isDefault = defaultValue === option.value;
        const inputId = `${path}-${option.value}`;

        return (
          <React.Fragment key={option.value}>
            <input
              id={inputId}
              type="radio"
              name={bracketName}
              value={option.value}
              checked={isChecked}
              onChange={() => handleChange(option.value)}
              onBlur={index === options.length - 1 ? onBlur : undefined}
              disabled={disabled}
              readOnly={readonly}
              className={`valid-target btn-check ${error ? 'is-invalid' : ''}`}
              data-is-default={isDefault ? 'true' : 'false'}
              {...(index === 0 ? getLimepieDataAttributes(spec, path, language) : {})}
            />
            <label htmlFor={inputId} className="btn btn-switch">
              <span>{option.label}</span>
            </label>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default ChoiceField;
