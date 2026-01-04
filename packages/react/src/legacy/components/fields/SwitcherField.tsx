/**
 * SwitcherField Component
 *
 * Boolean toggle switch
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation } from '../../utils/dataAttributes';

/**
 * SwitcherField component
 */
export function SwitcherField({
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

  // Labels for on/off states
  const onLabel = (spec.on_label as string) ?? t('on') ?? 'On';
  const offLabel = (spec.off_label as string) ?? t('off') ?? 'Off';

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotation(path);

  return (
    <div className="form-check form-switch">
      {/* Prepend */}
      {spec.prepend && (
        <span
          className="me-2"
          dangerouslySetInnerHTML={{ __html: spec.prepend }}
        />
      )}

      {spec.show_labels !== false && (
        <span className="me-2 text-muted">{offLabel}</span>
      )}

      <input
        type="checkbox"
        id={path}
        name={bracketName}
        checked={Boolean(value)}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled || readonly}
        className={`valid-target form-check-input ${error ? 'is-invalid' : ''}`}
        role="switch"
        aria-checked={Boolean(value)}
        {...getLimepieDataAttributes(spec, path, language)}
      />

      {spec.show_labels !== false && (
        <label className="form-check-label ms-2" htmlFor={path}>
          {onLabel}
        </label>
      )}

      {/* Append */}
      {spec.append && (
        <span
          className="ms-2"
          dangerouslySetInnerHTML={{ __html: spec.append }}
        />
      )}
    </div>
  );
}

export default SwitcherField;
