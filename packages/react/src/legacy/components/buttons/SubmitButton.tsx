/**
 * SubmitButton Component
 *
 * Form submit button
 */

import React from 'react';
import type { ButtonSpec } from '@legacy/form-validator/legacy';
import { useI18n } from '../../context/I18nContext';
import type { MultiLangText } from '../../types';

/**
 * Extended ButtonSpec with text property for multi-language support
 */
interface ExtendedButtonSpec extends ButtonSpec {
  text?: MultiLangText;
}

/**
 * SubmitButton props
 */
interface SubmitButtonProps {
  /** Button specification */
  spec?: ExtendedButtonSpec;
  /** Is form submitting */
  isSubmitting?: boolean;
  /** Is form valid */
  isValid?: boolean;
  /** Custom CSS class */
  className?: string;
}

/**
 * SubmitButton component
 */
export function SubmitButton({
  spec,
  isSubmitting = false,
  isValid = true,
  className,
}: SubmitButtonProps) {
  const { t } = useI18n();

  const buttonClasses = ['form-button', 'form-button--submit'];
  if (spec?.class) {
    buttonClasses.push(spec.class);
  }
  if (className) {
    buttonClasses.push(className);
  }
  if (isSubmitting) {
    buttonClasses.push('form-button--loading');
  }

  // Support both 'text' (new format) and 'label' (legacy format)
  const labelText = spec?.text ?? spec?.label;
  const label = labelText ? t(labelText) : t('submit');

  return (
    <button
      type="submit"
      className={buttonClasses.join(' ')}
      disabled={isSubmitting}
    >
      {isSubmitting ? (
        <>
          <span className="form-button__spinner" aria-hidden="true" />
          <span className="form-button__text">{label}</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}

export default SubmitButton;
