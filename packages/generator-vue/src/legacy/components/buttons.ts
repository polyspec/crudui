/**
 * Row/footer button helpers — ports of generator-react FormGroup button
 * builders and ButtonGroup (the form footer).
 */

import { h, type VNode } from 'vue';
import type { FieldSpec, Spec, RenderContext, MultiLangText } from '../types';

/** PHP addcslashes($str, '"') — quote escaping for inline-attr JS. */
function addCSlashesQuote(s: string): string {
  return s.split('"').join('\\"');
}

export function hasDynamicOnchange(spec: FieldSpec): boolean {
  const d = (spec as Record<string, unknown>).dynamic_onchange;
  return typeof d === 'string' && d !== '';
}

/** Raw legacy row-buttons HTML — verbatim port of Fields::addElement. */
export function legacyRowButtonsHtml(spec: FieldSpec): string {
  const dynRaw = (spec as Record<string, unknown>).dynamic_onchange;
  const dyn =
    typeof dynRaw === 'string' && dynRaw !== '' ? ` onclick="${addCSlashesQuote(dynRaw)}"` : '';
  const sortable = (spec as { sortable?: boolean }).sortable === true;
  const mm = (spec as Record<string, unknown>).multiple_max;
  const max = mm !== undefined && mm !== null ? `data-multiple-max="${String(mm)}"` : '';

  let html = '';
  if (sortable) {
    html += `<button  type="button" class="btn btn-move-up"${dyn}>&nbsp;</button>`;
    html += `<button  type="button" class="btn btn-move-down"${dyn}>&nbsp;</button>`;
  }
  html += `<button class="btn btn-plus" ${max} type="button"${dyn}>&nbsp;</button>`;
  let minusBtn = 'btn-minus';
  if ((spec as Record<string, unknown>).multiple_copy) {
    html += `<button class="btn btn-copy" type="button"${dyn}>&nbsp;</button>`;
    minusBtn = 'btn-minus btn-delete';
  }
  html += `<button class="btn ${minusBtn}" type="button"${dyn}>&nbsp;</button>`;
  return html;
}

/** Legacy row buttons (sortable move-up/down + plus[+max] + minus). */
export function multipleRowButtons(spec: FieldSpec): VNode[] {
  const sortable = (spec as { sortable?: boolean }).sortable === true;
  const multipleMax = (spec as Record<string, unknown>).multiple_max;
  const maxAttr =
    multipleMax !== undefined && multipleMax !== null
      ? { 'data-multiple-max': String(multipleMax) }
      : {};
  const out: VNode[] = [];
  if (sortable) {
    out.push(h('button', { type: 'button', class: 'btn btn-move-up' }, ' '));
    out.push(h('button', { type: 'button', class: 'btn btn-move-down' }, ' '));
  }
  out.push(h('button', { type: 'button', class: 'btn btn-plus', ...maxAttr }, ' '));
  out.push(h('button', { type: 'button', class: 'btn btn-minus' }, ' '));
  return out;
}

// ---------------------------------------------------------------------------
// Form footer (ButtonGroup)
// ---------------------------------------------------------------------------

interface LegacyButtonSpec {
  type?: string;
  text?: MultiLangText;
  class?: string;
  onclick?: string;
  name?: string;
  value?: string;
  href?: string;
}

interface ExtendedSpec extends Spec {
  buttons?: LegacyButtonSpec[];
  add_buttons?: LegacyButtonSpec[];
  submit_button_text?: string;
  list_button_text?: string;
  remove_list_button?: boolean;
}

function renderLegacyButtons(
  buttons: LegacyButtonSpec[],
  t: (text: MultiLangText | undefined) => string
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

/** Port of Generator::write() footer. Returns [<hr/>, <div.clearfix>]. */
export function renderButtonGroup(spec: ExtendedSpec, ctx: RenderContext): VNode[] {
  const t = ctx.t;
  const buttons = spec.buttons;
  const addButtons = spec.add_buttons;
  const hasButtons = Array.isArray(buttons) && buttons.length > 0;
  const hasAddButtons = Array.isArray(addButtons) && addButtons.length > 0;

  if (hasButtons) {
    return [
      h('hr'),
      h('div', { class: 'clearfix', innerHTML: renderLegacyButtons(buttons!, t) }),
    ];
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

  const inner: VNode[] = [
    h('input', { type: 'submit', value: submitText, class: 'btn btn-primary' }),
  ];
  if (hasAddButtons) {
    inner.push(h('span', { innerHTML: renderLegacyButtons(addButtons!, t) }));
  }
  if (showListButton) {
    inner.push(h('a', { href: '../', class: 'btn btn-secondary float-end' }, listText));
  }
  return [h('hr'), h('div', { class: 'clearfix' }, inner)];
}
