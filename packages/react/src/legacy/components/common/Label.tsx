/**
 * Label Component
 *
 * Form field label with optional required indicator
 */

import React, { type ReactNode } from 'react';

/**
 * Label props
 */
interface LabelProps {
  /** Label text or children */
  children: ReactNode;
  /** HTML for attribute */
  htmlFor?: string;
  /** Show required indicator */
  required?: boolean;
  /** Custom CSS class */
  className?: string;
}

/**
 * Label component
 */
export function Label({
  children,
  htmlFor,
  required = false,
  className,
}: LabelProps) {
  const labelClasses = ['form-label'];
  if (className) {
    labelClasses.push(className);
  }
  if (required) {
    labelClasses.push('form-label--required');
  }

  return (
    <label htmlFor={htmlFor} className={labelClasses.join(' ')}>
      {children}
      {required && <span className="form-label__required" aria-hidden="true"> *</span>}
    </label>
  );
}

export default Label;
