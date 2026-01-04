/**
 * ButtonGroup Component
 *
 * Form button group (submit, cancel, etc.)
 */

import React from 'react';
import type { Spec, ButtonSpec } from '@legacy/form-validator/legacy';
import { useI18n } from '../../context/I18nContext';
import { SubmitButton } from './SubmitButton';
import type { MultiLangText } from '../../types';

/**
 * Extended ButtonSpec with text property for multi-language support
 */
interface ExtendedButtonSpec extends ButtonSpec {
  text?: MultiLangText;
  name?: string;
  value?: string;
}

/**
 * Extended Spec to include top-level buttons array
 */
interface ExtendedSpec extends Spec {
  buttons?: ExtendedButtonSpec[];
}

/**
 * ButtonGroup props
 */
interface ButtonGroupProps {
  /** Form specification */
  spec: ExtendedSpec;
  /** Is form submitting */
  isSubmitting?: boolean;
  /** Is form valid */
  isValid?: boolean;
  /** Custom CSS class */
  className?: string;
}

/**
 * ButtonGroup component
 */
export function ButtonGroup({
  spec,
  isSubmitting = false,
  isValid = true,
  className,
}: ButtonGroupProps) {
  const { t } = useI18n();

  // Support both top-level buttons array and action.buttons object
  const topLevelButtons = spec.buttons;
  const actionButtons = spec.action?.buttons ?? {};
  const hasTopLevelButtons = Array.isArray(topLevelButtons) && topLevelButtons.length > 0;
  const hasActionButtons = Object.keys(actionButtons).length > 0;
  const hasButtons = hasTopLevelButtons || hasActionButtons;

  // Bootstrap 5 button group classes
  const groupClasses = ['d-flex', 'gap-2', 'mt-3', 'pt-3', 'border-top'];
  if (className) {
    groupClasses.push(className);
  }

  // If no buttons defined in spec, render default submit button
  if (!hasButtons) {
    return (
      <div className={groupClasses.join(' ')}>
        <SubmitButton isSubmitting={isSubmitting} isValid={isValid} />
      </div>
    );
  }

  // Render top-level buttons array (new format)
  if (hasTopLevelButtons) {
    return (
      <div className={groupClasses.join(' ')}>
        {topLevelButtons!.map((buttonSpec, index) => (
          <FormButton
            key={buttonSpec.name ?? `button-${index}`}
            name={buttonSpec.name ?? `button-${index}`}
            spec={buttonSpec}
            isSubmitting={isSubmitting}
            isValid={isValid}
          />
        ))}
      </div>
    );
  }

  // Render action.buttons object (legacy format)
  return (
    <div className={groupClasses.join(' ')}>
      {Object.entries(actionButtons).map(([key, buttonSpec]) => (
        <FormButton
          key={key}
          name={key}
          spec={buttonSpec}
          isSubmitting={isSubmitting}
          isValid={isValid}
        />
      ))}
    </div>
  );
}

/**
 * FormButton props
 */
interface FormButtonProps {
  /** Button name/key */
  name: string;
  /** Button specification */
  spec: ExtendedButtonSpec;
  /** Is form submitting */
  isSubmitting?: boolean;
  /** Is form valid */
  isValid?: boolean;
}

/**
 * FormButton component
 */
function FormButton({
  name,
  spec,
  isSubmitting = false,
  isValid = true,
}: FormButtonProps) {
  const { t } = useI18n();

  // Support both 'text' (new format) and 'label' (legacy format)
  const labelText = spec.text ?? spec.label;
  const label = labelText ? t(labelText) : name;
  const buttonType = spec.type ?? (name === 'submit' ? 'submit' : 'button');

  // Bootstrap 5 button classes
  const buttonClasses = ['btn', spec.class || 'btn-secondary'];
  // Note: spec.class should contain Bootstrap classes like 'btn-primary', 'btn-secondary', etc.

  // Handle submit button
  if (buttonType === 'submit' || name === 'submit') {
    return (
      <SubmitButton
        spec={spec}
        isSubmitting={isSubmitting}
        isValid={isValid}
        className={buttonClasses.slice(2).join(' ')} // Remove base classes
      />
    );
  }

  // Handle link button (cancel with href)
  if (spec.href) {
    return (
      <a href={spec.href} className={buttonClasses.join(' ')}>
        {label}
      </a>
    );
  }

  // Handle button with onclick
  const handleClick = spec.onclick
    ? () => {
        // Execute onclick as JavaScript (use with caution)
        try {
          // eslint-disable-next-line no-new-func
          const fn = new Function(spec.onclick as string);
          fn();
        } catch (error) {
          console.error('Button onclick error:', error);
        }
      }
    : undefined;

  return (
    <button
      type={buttonType as 'button' | 'reset'}
      className={buttonClasses.join(' ')}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}

export default ButtonGroup;
