/**
 * TagifyField Component
 *
 * Tag input field for multiple values
 */

import React, { useCallback, useState, useRef, type KeyboardEvent, type ChangeEvent } from 'react';
import type { FieldComponentProps, FormValue } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation } from '../../utils/dataAttributes';

/**
 * TagifyField component
 */
export function TagifyField({
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
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse current tags
  const tags: string[] = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : typeof value === 'string' && value
      ? value.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

  // Settings from spec
  const maxTags = spec.max_tags as number | undefined;
  const minTags = spec.min_tags as number | undefined;
  const delimiter = (spec.delimiter as string) ?? ',';
  const allowDuplicates = spec.allow_duplicates === true;

  // Add tag
  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;

    // Check for duplicates
    if (!allowDuplicates && tags.includes(trimmed)) return;

    // Check max
    if (maxTags && tags.length >= maxTags) return;

    const newTags = [...tags, trimmed];
    onChange(newTags as unknown as FormValue);
    setInputValue('');
  }, [tags, onChange, allowDuplicates, maxTags]);

  // Remove tag
  const removeTag = useCallback((index: number) => {
    if (minTags && tags.length <= minTags) return;

    const newTags = tags.filter((_, i) => i !== index);
    onChange(newTags.length > 0 ? (newTags as unknown as FormValue) : null);
  }, [tags, onChange, minTags]);

  // Handle input change
  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;

    // Check for delimiter
    if (delimiter && val.includes(delimiter)) {
      const parts = val.split(delimiter);
      parts.forEach((part, i) => {
        if (i < parts.length - 1) {
          addTag(part);
        } else {
          setInputValue(part);
        }
      });
    } else {
      setInputValue(val);
    }
  }, [delimiter, addTag]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }, [inputValue, tags, addTag, removeTag]);

  // Focus input when clicking container
  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotation(path);

  return (
    <div className="form-tagify-wrapper">
      {/* Prepend */}
      {spec.prepend && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.prepend }}
        />
      )}

      <div
        className={`form-control d-flex flex-wrap align-items-center gap-1 ${disabled ? 'disabled' : ''} ${error ? 'is-invalid' : ''}`}
        onClick={handleContainerClick}
        style={{ minHeight: '38px', cursor: 'text' }}
      >
        {/* Tags */}
        {tags.map((tag, index) => (
          <span key={`${tag}-${index}`} className="badge bg-primary d-flex align-items-center gap-1">
            <span>{tag}</span>
            {!disabled && !readonly && (
              <button
                type="button"
                className="btn-close btn-close-white"
                style={{ fontSize: '0.6rem' }}
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(index);
                }}
                aria-label={t('remove')}
              />
            )}
          </span>
        ))}

        {/* Input */}
        {!disabled && !readonly && (!maxTags || tags.length < maxTags) && (
          <input
            ref={inputRef}
            type="text"
            name={bracketName}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={onBlur}
            className="valid-target border-0 flex-grow-1"
            style={{ outline: 'none', minWidth: '100px' }}
            placeholder={tags.length === 0 && spec.placeholder ? t(spec.placeholder) : ''}
            autoFocus={spec.autofocus === true}
            {...getLimepieDataAttributes(spec, path, language)}
          />
        )}
      </div>

      {/* Append */}
      {spec.append && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.append }}
        />
      )}

      {/* Helper text */}
      {spec.helper && (
        <div className="form-text">
          {t(spec.helper as string)}
        </div>
      )}
    </div>
  );
}

export default TagifyField;
