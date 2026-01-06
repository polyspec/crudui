/**
 * CoverField Component
 *
 * Cover image field with aspect ratio support
 */

import React, { useCallback, useRef, useState, useMemo, type ChangeEvent } from 'react';
import type { FieldComponentProps, FormValue } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation } from '../../utils/dataAttributes';

/**
 * CoverField component
 */
export function CoverField({
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

  // Aspect ratio configuration
  const aspectRatio = (spec.aspect_ratio as string) ?? '16:9';
  const [ratioWidth, ratioHeight] = aspectRatio.split(':').map(Number);
  const paddingBottom = ratioHeight && ratioWidth
    ? `${(ratioHeight / ratioWidth) * 100}%`
    : '56.25%'; // Default 16:9

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
    <div className={`form-cover ${error ? 'is-invalid' : ''}`}>
      {/* Prepend */}
      {spec.prepend && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.prepend }}
        />
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        name={bracketName}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled || readonly}
        className="valid-target form-control"
        accept={accept}
        style={{ display: 'none' }}
        {...getLimepieDataAttributes(spec, path, language)}
      />

      {/* Cover preview area with aspect ratio */}
      <div
        className="form-cover-container position-relative border rounded overflow-hidden"
        style={{ paddingBottom }}
        onClick={handleClick}
        role="button"
        tabIndex={disabled || readonly ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleClick();
          }
        }}
      >
        <div className="form-cover-inner position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center">
          {currentPreview ? (
            <img
              src={currentPreview}
              alt="Cover preview"
              className="form-cover-img w-100 h-100"
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <div className="form-cover-placeholder text-center text-muted">
              <div className="fs-1">+</div>
              <div>
                {spec.placeholder ? t(spec.placeholder) : t('add_cover')}
              </div>
              <div className="small">
                {aspectRatio}
              </div>
            </div>
          )}

          {/* Clear button */}
          {currentPreview && !disabled && !readonly && (
            <button
              type="button"
              className="btn-close position-absolute top-0 end-0 m-2 bg-white rounded-circle p-2"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              aria-label={t('remove')}
            />
          )}
        </div>
      </div>

      {/* Append */}
      {spec.append && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.append }}
        />
      )}

      {/* File info */}
      {value instanceof File && (
        <div className="form-cover-info mt-2 small text-muted">
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

export default CoverField;
