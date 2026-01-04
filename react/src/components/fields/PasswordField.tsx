/**
 * PasswordField Component
 *
 * Password input field with optional show/hide toggle
 */

import React, { useCallback, useState, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation, getInputClasses } from '../../utils/dataAttributes';

/**
 * PasswordField component
 */
export function PasswordField({
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
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const toggleVisibility = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

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
        type={showPassword ? 'text' : 'password'}
        id={path}
        name={bracketName}
        value={(value as string) ?? ''}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readonly}
        className={getInputClasses('', spec, !!error)}
        placeholder={spec.placeholder ? t(spec.placeholder) : undefined}
        maxLength={spec.maxlength as number | undefined}
        autoFocus={spec.autofocus === true}
        autoComplete={spec.autocomplete as string | undefined}
        {...getLimepieDataAttributes(spec, path, language)}
      />

      {/* Toggle visibility button */}
      {spec.show_toggle !== false && (
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={toggleVisibility}
          disabled={disabled}
          aria-label={showPassword ? t('hide') : t('show')}
          tabIndex={-1}
        >
          {showPassword ? '👁' : '👁‍🗨'}
        </button>
      )}

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

export default PasswordField;
