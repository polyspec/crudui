/**
 * TextareaField Component
 *
 * Multi-line text input field
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation, getInputClasses } from '../../utils/dataAttributes';

/**
 * TextareaField component
 */
export function TextareaField({
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

  // Build style for resize
  const style: React.CSSProperties = {};
  if (spec.resize) {
    style.resize = spec.resize as 'none' | 'both' | 'horizontal' | 'vertical';
  }

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotation(path);

  return (
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
      rows={spec.rows as number | undefined ?? 5}
      cols={spec.cols as number | undefined}
      maxLength={spec.maxlength as number | undefined}
      autoFocus={spec.autofocus === true}
      style={style}
      {...getLimepieDataAttributes(spec, path, language)}
    />
  );
}

export default TextareaField;
