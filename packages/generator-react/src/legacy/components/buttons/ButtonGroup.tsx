/**
 * ButtonGroup Component
 *
 * Form footer — a verbatim port of Legacy PHP Generator::write()'s footer:
 *
 *   <hr /> <div class="clearfix">
 *     ... buttons ...
 *   </div>
 *
 * Default branch (no spec.buttons):
 *   <input type="submit" value="{submit_button_text|저장}" class="btn btn-primary" />
 *   [<a href="../" class="btn btn-secondary float-end">{list_button_text|목록}</a>]
 * The list link is suppressed by spec.remove_list_button. The 저장/목록
 * defaults are hardcoded in PHP (NOT localized) — reference fixtures pin them.
 *
 * spec.buttons / spec.add_buttons arrays go through a port of
 * Generator::addButtons(); string onclick attributes cannot be expressed as
 * React props, so that branch renders raw HTML.
 */

import React from 'react';
import type { Spec, ButtonSpec } from '@form-spec/validator/legacy';
import { useI18n } from '../../context/I18nContext';
import type { MultiLangText } from '../../types';

/**
 * Legacy button entry (Legacy spec.buttons / spec.add_buttons item)
 */
interface LegacyButtonSpec extends ButtonSpec {
  text?: MultiLangText;
  name?: string;
  value?: string;
  string?: string;
  description?: MultiLangText;
}

/**
 * Extended Spec with the legacy footer keys
 */
interface ExtendedSpec extends Spec {
  buttons?: LegacyButtonSpec[];
  add_buttons?: LegacyButtonSpec[];
  submit_button_text?: string;
  list_button_text?: string;
  remove_list_button?: boolean;
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
 * Port of Generator::addButtons(). Returns raw HTML — PHP emits string
 * onclick/onChange attributes that React props cannot express.
 */
function renderLegacyButtons(
  buttons: LegacyButtonSpec[],
  t: (text: MultiLangText) => string
): string {
  let html = '';

  for (const button of buttons) {
    const type = button.type ?? '';
    const text = button.text !== undefined ? t(button.text) : '';
    const cls = button.class ?? '';
    const onclick = button.onclick ? ` onclick="${button.onclick}"` : '';
    const name = button.name ? ` name="${button.name}"` : '';
    const value = button.value ? ` value="${button.value}"` : '';

    if (type === 'a') {
      const href = button.href ?? '';
      html += `<a data-href="${href}" href="${href}" class="btn ${cls}">${text}</a>`;
    } else {
      html += `<button type="${type}"${name} class="btn ${cls}"${value}${onclick}>${text}</button>`;
    }
  }

  return html;
}

/**
 * ButtonGroup component
 */
export function ButtonGroup({
  spec,
  isSubmitting = false,
  className,
}: ButtonGroupProps) {
  const { t } = useI18n();

  const buttons = spec.buttons;
  const addButtons = spec.add_buttons;
  const hasButtons = Array.isArray(buttons) && buttons.length > 0;
  const hasAddButtons = Array.isArray(addButtons) && addButtons.length > 0;

  // spec.buttons replaces the whole footer content (PHP: if isset buttons)
  if (hasButtons) {
    return (
      <>
        <hr />
        <div
          className={className ? `clearfix ${className}` : 'clearfix'}
          dangerouslySetInnerHTML={{ __html: renderLegacyButtons(buttons!, t) }}
        />
      </>
    );
  }

  const submitText =
    typeof spec.submit_button_text === 'string' && spec.submit_button_text
      ? spec.submit_button_text
      : '저장';

  const listText =
    typeof spec.list_button_text === 'string' && spec.list_button_text
      ? spec.list_button_text
      : '목록';

  const showListButton = !spec.remove_list_button;

  return (
    <>
      <hr />
      <div className={className ? `clearfix ${className}` : 'clearfix'}>
        <input
          type="submit"
          value={submitText}
          className="btn btn-primary"
          disabled={isSubmitting}
        />
        {hasAddButtons && (
          <span
            dangerouslySetInnerHTML={{ __html: renderLegacyButtons(addButtons!, t) }}
          />
        )}
        {showListButton && (
          <a href="../" className="btn btn-secondary float-end">
            {listText}
          </a>
        )}
      </div>
    </>
  );
}

export default ButtonGroup;
