/**
 * SubmitButton Component
 *
 * Form submit button
 */

import React from 'react';
import type { ButtonSpec } from '@form-spec/validator';
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
  className,
}: SubmitButtonProps) {
  const { t } = useI18n();

  // Bootstrap 5 button classes
  const buttonClasses = ['btn', spec?.class || 'btn-primary'];
  if (className) {
    buttonClasses.push(className);
  }
  if (isSubmitting) {
    buttonClasses.push('disabled');
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
          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
          {label}
        </>
      ) : (
        label
      )}
    </button>
  );
}

export default SubmitButton;
