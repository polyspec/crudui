/**
 * Description Component
 *
 * Form field description/help text
 */

import React from 'react';

/**
 * Description props
 */
interface DescriptionProps {
  /** Description text */
  text: string;
  /** Custom CSS class */
  className?: string;
}

/**
 * Description component
 */
export function Description({
  text,
  className,
}: DescriptionProps) {
  if (!text) {
    return null;
  }

  const descClasses = ['form-description'];
  if (className) {
    descClasses.push(className);
  }

  return (
    <p className={descClasses.join(' ')}>
      {text}
    </p>
  );
}

export default Description;
