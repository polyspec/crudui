/**
 * ButtonField Component
 *
 * Button field for triggering actions (not for form submission)
 */

import React, { useCallback } from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';

/**
 * ButtonField component
 */
export function ButtonField({
  name,
  spec,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  readonly,
  path,
}: FieldComponentProps) {
  const { t } = useI18n();

  const handleClick = useCallback(() => {
    // Emit custom event for button click
    const event = new CustomEvent('form:button:click', {
      detail: {
        name,
        path,
        action: spec.action,
        data: spec.data,
      },
      bubbles: true,
    });
    document.dispatchEvent(event);

    // Also call onChange if handler expects it
    onChange({ clicked: true, timestamp: Date.now() });
  }, [name, path, spec.action, spec.data, onChange]);

  // Button variant - map to Bootstrap classes
  const variantMap: Record<string, string> = {
    default: 'btn-secondary',
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    success: 'btn-success',
    danger: 'btn-danger',
    warning: 'btn-warning',
    info: 'btn-info',
    outline: 'btn-outline-primary',
  };
  const sizeMap: Record<string, string> = {
    sm: 'btn-sm',
    md: '',
    lg: 'btn-lg',
  };
  const variant = (spec.variant as string) ?? 'secondary';
  const size = (spec.size as string) ?? 'md';

  const buttonClasses = ['btn', variantMap[variant] || 'btn-secondary'];
  if (sizeMap[size]) {
    buttonClasses.push(sizeMap[size]);
  }
  if (spec.input_class) {
    buttonClasses.push(spec.input_class);
  }
  if (error) {
    buttonClasses.push('btn-outline-danger');
  }

  // Button label
  const buttonLabel = (spec.button_label ?? spec.label ?? 'button') as string;

  // Icon
  const icon = spec.icon as string | undefined;

  return (
    <div className="input-group">
      {/* Prepend */}
      {spec.prepend && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.prepend }}
        />
      )}

      <button
        type="button"
        id={path}
        name={path}
        onClick={handleClick}
        onBlur={onBlur}
        disabled={disabled || readonly}
        className={buttonClasses.join(' ')}
      >
        {/* Icon before label */}
        {icon && spec.icon_position !== 'after' && (
          <span
            className="me-1"
            dangerouslySetInnerHTML={{ __html: icon }}
          />
        )}

        {/* Label */}
        {t(buttonLabel)}

        {/* Icon after label */}
        {icon && spec.icon_position === 'after' && (
          <span
            className="ms-1"
            dangerouslySetInnerHTML={{ __html: icon }}
          />
        )}
      </button>

      {/* Append */}
      {spec.append && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.append }}
        />
      )}

      {/* Hidden input to track button clicks if needed */}
      <input
        type="hidden"
        name={`${path}_clicked`}
        value={value ? 'true' : 'false'}
      />
    </div>
  );
}

export default ButtonField;
