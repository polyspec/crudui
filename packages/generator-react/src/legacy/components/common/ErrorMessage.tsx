/**
 * ErrorMessage Component
 *
 * Form field error message display
 */

import React from 'react';

/**
 * ErrorMessage props
 */
interface ErrorMessageProps {
  /** Error message text */
  message: string;
  /** Custom CSS class */
  className?: string;
}

/**
 * ErrorMessage component
 */
export function ErrorMessage({
  message,
  className,
}: ErrorMessageProps) {
  if (!message) {
    return null;
  }

  const errorClasses = ['invalid-feedback', 'd-block'];
  if (className) {
    errorClasses.push(className);
  }

  return (
    <div className={errorClasses.join(' ')} role="alert" aria-live="polite">
      {message}
    </div>
  );
}

export default ErrorMessage;
