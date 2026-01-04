/**
 * NumberField Component
 *
 * Numeric input field
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation, getInputClasses } from '../../utils/dataAttributes';

/**
 * NumberField component
 */
export function NumberField({
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
    (e: ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;

      // Handle empty input
      if (inputValue === '') {
        onChange('');
        return;
      }

      // Parse as number
      const numValue = parseFloat(inputValue);
      if (!isNaN(numValue)) {
        onChange(numValue);
      } else {
        onChange(inputValue);
      }
    },
    [onChange]
  );

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotation(path);

  return (
    <div className="input-group">
      {/* Prepend */}
      {spec.prepend && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.prepend }}
        />
      )}

      <input
        type="number"
        id={path}
        name={bracketName}
        value={(value as string | number) ?? ''}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readonly}
        className={getInputClasses('', spec, !!error)}
        placeholder={spec.placeholder ? t(spec.placeholder) : undefined}
        min={spec.min as number | undefined}
        max={spec.max as number | undefined}
        step={spec.step as number | undefined}
        autoFocus={spec.autofocus === true}
        {...getLimepieDataAttributes(spec, path, language)}
      />

      {/* Append */}
      {spec.append && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.append }}
        />
      )}
    </div>
  );
}

export default NumberField;
