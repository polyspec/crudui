/**
 * DummyField Component
 *
 * Non-input UI element for dividers, headings, etc.
 */

import React, { useMemo } from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';

/**
 * DummyField component
 */
export function DummyField({
  name,
  spec,
  path,
}: FieldComponentProps) {
  const { t } = useI18n();

  // Process template with placeholders
  const content = useMemo(() => {
    // If template is provided
    if (spec.template) {
      let html = spec.template as string;

      // Replace {{label}} placeholder
      if (spec.label) {
        html = html.replace(/\{\{label\}\}/g, t(spec.label));
      }

      // Replace {{description}} placeholder
      if (spec.description) {
        html = html.replace(/\{\{description\}\}/g, t(spec.description));
      }

      return html;
    }

    // If html is provided directly
    if (spec.html) {
      return spec.html as string;
    }

    // Default: render label and description
    let defaultHtml = '';

    if (spec.label) {
      defaultHtml += `<h4 class="form-dummy__label">${t(spec.label)}</h4>`;
    }

    if (spec.description) {
      defaultHtml += `<p class="form-dummy__description">${t(spec.description)}</p>`;
    }

    return defaultHtml || '<hr class="form-dummy__divider" />';
  }, [spec.template, spec.html, spec.label, spec.description, t]);

  return (
    <div
      className="form-dummy"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

export default DummyField;
