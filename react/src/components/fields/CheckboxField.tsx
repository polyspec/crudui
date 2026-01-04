/**
 * CheckboxField Component
 *
 * Single checkbox for boolean values
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation, getCheckboxClasses } from '../../utils/dataAttributes';

/**
 * CheckboxField component
 */
export function CheckboxField({
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
      onChange(e.target.checked);
    },
    [onChange]
  );

  // Determine the label text
  const checkboxLabel = spec.checkbox_label ?? spec.label;

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotation(path);

  return (
    <div className="form-check">
      {/* Prepend */}
      {spec.prepend && (
        <span
          className="form-check-prepend"
          dangerouslySetInnerHTML={{ __html: spec.prepend }}
        />
      )}

      <input
        type="checkbox"
        id={path}
        name={bracketName}
        checked={Boolean(value)}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled || readonly}
        className={getCheckboxClasses(spec, !!error)}
        {...getLimepieDataAttributes(spec, path, language)}
      />
      {checkboxLabel && (
        <label
          className="form-check-label"
          htmlFor={path}
          dangerouslySetInnerHTML={{ __html: t(checkboxLabel) }}
        />
      )}

      {/* Append */}
      {spec.append && (
        <span
          className="form-check-append"
          dangerouslySetInnerHTML={{ __html: spec.append }}
        />
      )}
    </div>
  );
}

export default CheckboxField;
