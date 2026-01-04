/**
 * FileField Component
 *
 * File upload field
 */

import React, { useCallback, useRef, type ChangeEvent } from 'react';
import type { FieldComponentProps, FormValue } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation, getInputClasses } from '../../utils/dataAttributes';

/**
 * FileField component
 */
export function FileField({
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
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;

      if (!files || files.length === 0) {
        onChange(null);
        return;
      }

      // Single or multiple files
      if (spec.multiple) {
        onChange(files as FormValue);
      } else {
        onChange(files[0] as FormValue);
      }
    },
    [onChange, spec.multiple]
  );

  const handleClear = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    onChange(null);
  }, [onChange]);

  // Determine accept attribute
  const accept = spec.accept as string | string[] | undefined;
  const acceptString = Array.isArray(accept) ? accept.join(',') : accept;

  // Get current file info
  const fileInfo = getFileInfo(value);

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotation(path);

  return (
    <div className="input-group">
      <input
        ref={inputRef}
        type="file"
        id={path}
        name={bracketName}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled || readonly}
        className={getInputClasses('', spec, !!error)}
        accept={acceptString}
        multiple={spec.multiple === true}
        {...getLimepieDataAttributes(spec, path, language)}
      />

      {/* File info */}
      {fileInfo && (
        <div className="input-group-text">
          <span className="me-2">{fileInfo.name}</span>
          {fileInfo.size && (
            <span className="text-muted">({formatFileSize(fileInfo.size)})</span>
          )}
          {!disabled && !readonly && (
            <button
              type="button"
              className="btn-close ms-2"
              onClick={handleClear}
              aria-label={t('remove')}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Get file info from value
 */
function getFileInfo(value: FormValue): { name: string; size?: number } | null {
  if (!value) return null;

  if (value instanceof File) {
    return { name: value.name, size: value.size };
  }

  if (value instanceof FileList && value.length > 0) {
    if (value.length === 1) {
      return { name: value[0]!.name, size: value[0]!.size };
    }
    return { name: `${value.length} files` };
  }

  if (typeof value === 'string' && value) {
    // Existing file path
    const parts = value.split('/');
    return { name: parts[parts.length - 1] ?? value };
  }

  return null;
}

/**
 * Format file size
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default FileField;
