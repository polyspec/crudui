/**
 * BrowserImageField Component
 *
 * Image browser/picker field for selecting from existing images
 */

import React, { useCallback, useState } from 'react';
import type { FieldComponentProps, FormValue } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation } from '../../utils/dataAttributes';

interface BrowsedImage {
  url: string;
  thumbnail?: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * BrowserImageField component
 */
export function BrowserImageField({
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [images, setImages] = useState<BrowsedImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Get current image URL
  const currentImage = typeof value === 'string'
    ? value
    : typeof value === 'object' && value !== null
      ? (value as BrowsedImage).url
      : null;

  // API configuration
  const apiUrl = spec.api_server as string | undefined;
  const valueField = (spec.value_field as string) ?? 'url';
  const thumbnailField = (spec.thumbnail_field as string) ?? 'thumbnail';

  // Load images from API
  const loadImages = useCallback(async () => {
    if (!apiUrl) return;

    setIsLoading(true);
    try {
      const response = await fetch(apiUrl);
      const data = await response.json();
      const items = Array.isArray(data) ? data : data.images ?? data.items ?? [];
      setImages(items.map((item: Record<string, unknown>) => ({
        url: item[valueField] as string,
        thumbnail: item[thumbnailField] as string | undefined,
        name: item.name as string | undefined,
        ...item,
      })));
    } catch (err) {
      console.error('Failed to load images:', err);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, valueField, thumbnailField]);

  // Open browser modal
  const handleOpenBrowser = useCallback(() => {
    if (disabled || readonly) return;
    setIsModalOpen(true);
    loadImages();
  }, [disabled, readonly, loadImages]);

  // Select image
  const handleSelectImage = useCallback((image: BrowsedImage) => {
    if (spec.store_object) {
      onChange(image as unknown as FormValue);
    } else {
      onChange(image.url);
    }
    setIsModalOpen(false);
  }, [onChange, spec.store_object]);

  // Clear selection
  const handleClear = useCallback(() => {
    onChange(null);
  }, [onChange]);

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotation(path);

  return (
    <div className={`form-browser-image ${error ? 'is-invalid' : ''}`}>
      {/* Prepend */}
      {spec.prepend && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.prepend }}
        />
      )}

      {/* Preview area */}
      <div
        className={`form-browser-image-preview border rounded p-3 text-center ${currentImage ? 'has-image' : ''}`}
        onClick={handleOpenBrowser}
        role="button"
        tabIndex={disabled || readonly ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleOpenBrowser();
          }
        }}
        style={{ cursor: disabled || readonly ? 'default' : 'pointer', position: 'relative' }}
      >
        {currentImage ? (
          <img
            src={currentImage}
            alt="Selected"
            className="img-fluid"
            style={{ maxHeight: '200px' }}
          />
        ) : (
          <div className="form-browser-image-placeholder py-4">
            <div className="fs-1">+</div>
            <div className="text-muted">
              {spec.placeholder ? t(spec.placeholder) : t('browse')}
            </div>
          </div>
        )}

        {/* Clear button */}
        {currentImage && !disabled && !readonly && (
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

      {/* Hidden input for form */}
      <input
        type="hidden"
        id={path}
        name={bracketName}
        value={currentImage ?? ''}
        onBlur={onBlur}
        {...getLimepieDataAttributes(spec, path, language)}
      />

      {/* Append */}
      {spec.append && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.append }}
        />
      )}

      {/* Browser Modal */}
      {isModalOpen && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{t('select_image') || 'Select Image'}</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setIsModalOpen(false)}
                  aria-label={t('close')}
                />
              </div>

              <div className="modal-body">
                {isLoading ? (
                  <div className="text-center py-5">
                    <div className="spinner-border" role="status">
                      <span className="visually-hidden">{t('loading') || 'Loading...'}</span>
                    </div>
                  </div>
                ) : images.length > 0 ? (
                  <div className="row g-3">
                    {images.map((image, index) => (
                      <div
                        key={image.url || index}
                        className="col-4 col-md-3"
                      >
                        <div
                          className="card h-100"
                          onClick={() => handleSelectImage(image)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              handleSelectImage(image);
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <img
                            src={image.thumbnail ?? image.url}
                            alt={image.name ?? 'Image'}
                            className="card-img-top"
                            style={{ height: '100px', objectFit: 'cover' }}
                          />
                          {image.name && (
                            <div className="card-body p-2">
                              <small className="text-truncate d-block">{image.name}</small>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-5 text-muted">
                    {t('no_images') || 'No images available'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BrowserImageField;
