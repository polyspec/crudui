/**
 * SummernoteField Component
 *
 * Summernote rich text editor placeholder
 * Actual Summernote integration should be done via custom field registration
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation, getInputClasses } from '../../utils/dataAttributes';

/**
 * SummernoteField component
 * This is a placeholder that falls back to textarea
 * For actual Summernote, register a custom component with Summernote integration
 */
export function SummernoteField({
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
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotation(path);

  return (
    <div className="form-editor form-editor--summernote">
      {/* Prepend */}
      {spec.prepend && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.prepend }}
        />
      )}

      {/* Placeholder notice */}
      <div className="alert alert-info mb-2">
        {t('summernote_placeholder') || 'Summernote Editor - Register custom component for full functionality'}
      </div>

      {/* Fallback textarea */}
      <textarea
        id={path}
        name={bracketName}
        value={(value as string) ?? ''}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readonly}
        className={getInputClasses('', spec, !!error)}
        placeholder={spec.placeholder ? t(spec.placeholder) : undefined}
        rows={(spec.rows as number) ?? 10}
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

export default SummernoteField;
