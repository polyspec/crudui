/**
 * EditorjsField Component
 *
 * Editor.js block editor placeholder
 * Actual Editor.js integration should be done via custom field registration
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation, getInputClasses } from '../../utils/dataAttributes';

/**
 * EditorjsField component
 * This is a placeholder that falls back to textarea with JSON editing
 * For actual Editor.js, register a custom component with Editor.js integration
 */
export function EditorjsField({
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

  // Editor.js stores data as JSON
  const stringValue = typeof value === 'string'
    ? value
    : value ? JSON.stringify(value, null, 2) : '';

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      // Try to parse as JSON, otherwise store as string
      try {
        const parsed = JSON.parse(val);
        onChange(parsed);
      } catch {
        onChange(val);
      }
    },
    [onChange]
  );

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotation(path);

  return (
    <div className="form-editor form-editor--editorjs">
      {/* Prepend */}
      {spec.prepend && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.prepend }}
        />
      )}

      {/* Placeholder notice */}
      <div className="alert alert-info mb-2">
        {t('editorjs_placeholder') || 'Editor.js - Register custom component for full functionality'}
      </div>

      {/* Fallback textarea for JSON */}
      <textarea
        id={path}
        name={bracketName}
        value={stringValue}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readonly}
        className={getInputClasses('', spec, !!error)}
        placeholder={spec.placeholder ? t(spec.placeholder) : '{"blocks": []}'}
        rows={(spec.rows as number) ?? 15}
        style={{ fontFamily: 'monospace' }}
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

export default EditorjsField;
