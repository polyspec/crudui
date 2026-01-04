/**
 * ImageField Component
 *
 * Image upload field with preview
 */

import React, { useCallback, useRef, useState, useMemo, type ChangeEvent } from 'react';
import type { FieldComponentProps, FormValue } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation } from '../../utils/dataAttributes';

/**
 * ImageField component
 */
export function ImageField({
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Generate preview URL for File
  const currentPreview = useMemo(() => {
    if (previewUrl) return previewUrl;

    if (value instanceof File) {
      return URL.createObjectURL(value);
    }

    if (typeof value === 'string' && value) {
      return value;
    }

    return null;
  }, [value, previewUrl]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;

      if (!files || files.length === 0) {
        onChange(null);
        setPreviewUrl(null);
        return;
      }

      const file = files[0];
      if (file) {
        onChange(file as FormValue);

        // Create preview URL
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      }
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    onChange(null);
    setPreviewUrl(null);
  }, [onChange]);

  const handleClick = useCallback(() => {
    if (!disabled && !readonly && inputRef.current) {
      inputRef.current.click();
    }
  }, [disabled, readonly]);

  // Default accept for images
  const accept = (spec.accept as string) ?? 'image/*';

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotation(path);

  return (
    <div className="form-image">
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        id={path}
        name={bracketName}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled || readonly}
        className="valid-target form-control"
        accept={accept}
        style={{ display: 'none' }}
        {...getLimepieDataAttributes(spec, path, language)}
      />

      {/* Preview area */}
      <div
        className={`form-image-preview ${currentPreview ? 'has-image' : ''} ${error ? 'is-invalid' : ''}`}
        onClick={handleClick}
        role="button"
        tabIndex={disabled || readonly ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleClick();
          }
        }}
      >
        {currentPreview ? (
          <img
            src={currentPreview}
            alt="Preview"
            className="form-image-img"
          />
        ) : (
          <div className="form-image-placeholder">
            <span className="form-image-placeholder-icon">+</span>
            <span className="form-image-placeholder-text">
              {spec.placeholder ? t(spec.placeholder) : t('add')}
            </span>
          </div>
        )}

        {/* Clear button */}
        {currentPreview && !disabled && !readonly && (
          <button
            type="button"
            className="btn-close position-absolute top-0 end-0 m-2"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            aria-label={t('remove')}
          />
        )}
      </div>

      {/* File info */}
      {value instanceof File && (
        <div className="form-image-info mt-2 small text-muted">
          <span className="me-2">{value.name}</span>
          <span>({formatFileSize(value.size)})</span>
        </div>
      )}
    </div>
  );
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

export default ImageField;
