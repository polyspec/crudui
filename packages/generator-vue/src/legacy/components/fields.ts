/**
 * Field renderers — functional ports of generator-react components/fields/*.
 *
 * Each renderer returns a Vue VNode (or array of VNodes) producing markup
 * byte-equivalent (after parity normalization) to the legacy Legacy PHP
 * golden. Render functions use h() so NO scoped-style/data-v attributes leak.
 * Raw legacy markup (inline-JS specs, file inputs) is set via the
 * `innerHTML` domProp, the Vue analogue of dangerouslySetInnerHTML.
 */

import { h, type VNode } from 'vue';
import type { FieldComponentProps, RenderContext, ReactFieldSpec } from '../types';
import {
  toBracketNotationWithPrefix,
  getLegacyDataAttributes,
  getInputClasses,
  getCheckboxClasses,
  generateUniqid,
} from '../utils/dataAttributes';
import { minifyJs } from '../hooks/legacyDisplay';
import {
  applyDefaultString,
  cleanStr,
  escAttr,
  escText,
  itemEntries,
  leafName,
  legacyDataAttrs,
  nextChoiceToken,
  parseStyleString,
  phpFloatString,
  phpString,
  phpTruthy,
  ruleNameForPath,
} from '../legacyParity';

export interface FieldRenderProps extends FieldComponentProps {
  ctx: RenderContext;
}

/** Drop undefined/null attribute values so h() omits them (PHP-like). */
function attrs(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === false) continue;
    out[k] = v;
  }
  return out;
}

/** Raw-HTML span (prepend/append). */
function rawSpan(cls: string, html: string): VNode {
  return h('span', { class: cls, innerHTML: html });
}

// ---------------------------------------------------------------------------
// Text-like inputs
// ---------------------------------------------------------------------------

function TextField(p: FieldRenderProps): VNode {
  const { spec, value, error, disabled, readonly, path, ctx, buttonsHtml } = p;
  const keyPrefix = ctx.keyPrefix;
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);
  const displayValue = applyDefaultString(value, spec.default);
  const elementStyle = `${(spec.element_style as string) ?? ''}${readonly ? ' pointer-events: none;' : ''}`;

  const classes = ['valid-target', 'form-control'];
  if (spec.element_class) classes.push(spec.element_class as string);
  if (error) classes.push('is-invalid');

  // Legacy-raw branch: dynamic_onchange row buttons.
  if (
    typeof (spec as Record<string, unknown>).dynamic_onchange === 'string' &&
    (spec as Record<string, unknown>).dynamic_onchange !== '' &&
    buttonsHtml
  ) {
    const da = legacyDataAttrs(spec, path);
    const prependHtml = spec.prepend
      ? `<span class="input-group-text${spec.prepend_class ? ` ${spec.prepend_class as string}` : ''}">${spec.prepend}</span>`
      : '';
    const appendHtml = spec.append
      ? `<span class="input-group-text${spec.append_class ? ` ${spec.append_class as string}` : ''}">${spec.append}</span>`
      : '';
    const inputHtml =
      `<input type="text" class="${escAttr(classes.join(' '))}"` +
      ` name="${escAttr(bracketName)}" value="${escAttr(displayValue)}"` +
      ` data-name="${escAttr(da['data-name']!)}"` +
      ` data-rule-name="${escAttr(da['data-rule-name']!)}"` +
      ` data-default="${escAttr(da['data-default']!)}"` +
      (readonly ? ' readonly="readonly"' : '') +
      (disabled ? ' disabled="disabled"' : '') +
      (spec.placeholder ? ` placeholder="${escAttr(ctx.t(spec.placeholder))}"` : '') +
      (elementStyle.trim() ? ` style="${escAttr(elementStyle)}"` : '') +
      (spec.autocomplete ? ` autocomplete="${escAttr(spec.autocomplete as string)}"` : '') +
      ' />';
    return h('div', {
      class: 'input-group',
      innerHTML: prependHtml + inputHtml + appendHtml + buttonsHtml,
    });
  }

  const children: VNode[] = [];
  if (spec.prepend) {
    children.push(
      rawSpan(
        `input-group-text${spec.prepend_class ? ` ${spec.prepend_class as string}` : ''}`,
        spec.prepend as string
      )
    );
  }
  children.push(
    h('input', attrs({
      type: 'text',
      name: bracketName,
      value: displayValue,
      disabled: disabled || undefined,
      readonly: readonly || undefined,
      class: classes.join(' '),
      placeholder: spec.placeholder ? ctx.t(spec.placeholder) : undefined,
      maxlength: spec.maxlength as number | undefined,
      autocomplete: spec.autocomplete as string | undefined,
      style: parseStyleString(elementStyle),
      ...legacyDataAttrs(spec, path),
    }))
  );
  if (spec.append) {
    children.push(
      rawSpan(
        `input-group-text${spec.append_class ? ` ${spec.append_class as string}` : ''}`,
        spec.append as string
      )
    );
  }
  if (p.buttons) children.push(p.buttons as VNode);
  return h('div', { class: 'input-group' }, children);
}

function EmailField(p: FieldRenderProps): VNode {
  const { spec, value, error, disabled, readonly, path, ctx } = p;
  const bracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);
  const displayValue = applyDefaultString(value, spec.default);
  const classes = ['valid-target', 'form-control'];
  if (spec.element_class) classes.push(spec.element_class as string);
  if (error) classes.push('is-invalid');

  const children: VNode[] = [];
  if (spec.prepend) children.push(rawSpan('input-group-text', spec.prepend as string));
  children.push(
    h('input', attrs({
      type: 'email',
      name: bracketName,
      value: displayValue,
      disabled: disabled || undefined,
      readonly: readonly || undefined,
      class: classes.join(' '),
      placeholder: spec.placeholder ? ctx.t(spec.placeholder) : undefined,
      autocomplete: spec.autocomplete as string | undefined,
      ...legacyDataAttrs(spec, path),
    }))
  );
  if (spec.append) children.push(rawSpan('input-group-text', spec.append as string));
  return h('div', { class: 'input-group' }, children);
}

function NumberField(p: FieldRenderProps): VNode {
  const { spec, value, error, disabled, readonly, path, ctx } = p;
  const bracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);
  let displayValue = phpString(value);
  if (displayValue.length > 0) {
    displayValue = phpFloatString(displayValue);
  } else if (spec.default !== undefined && spec.default !== null) {
    displayValue = phpFloatString(spec.default);
  }
  const elementStyle = `${(spec.element_style as string) ?? ''}${readonly ? ' pointer-events: none;' : ''}`;
  const classes = ['valid-target', 'form-control'];
  if (spec.element_class) classes.push(spec.element_class as string);
  if (error) classes.push('is-invalid');

  const children: VNode[] = [];
  if (spec.prepend) {
    children.push(
      rawSpan(
        `input-group-text${spec.prepend_class ? ` ${spec.prepend_class as string}` : ''}`,
        spec.prepend as string
      )
    );
  }
  children.push(
    h('input', attrs({
      type: 'number',
      name: bracketName,
      value: displayValue,
      disabled: disabled || undefined,
      readonly: readonly || undefined,
      class: classes.join(' '),
      placeholder: spec.placeholder ? ctx.t(spec.placeholder) : undefined,
      style: parseStyleString(elementStyle),
      ...legacyDataAttrs(spec, path),
    }))
  );
  if (spec.append) {
    children.push(
      rawSpan(
        `input-group-text${spec.append_class ? ` ${spec.append_class as string}` : ''}`,
        spec.append as string
      )
    );
  }
  return h('div', { class: 'input-group' }, children);
}

function PasswordField(p: FieldRenderProps): VNode {
  const { spec, value, error, disabled, readonly, path, ctx } = p;
  const bracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);
  return h('input', attrs({
    type: 'password',
    name: bracketName,
    value: (value as string) ?? '',
    disabled: disabled || undefined,
    readonly: readonly || undefined,
    class: error ? 'valid-target form-control is-invalid' : 'valid-target form-control',
    autocomplete: spec.autocomplete as string | undefined,
    ...legacyDataAttrs(spec, path),
  }));
}

function TextareaField(p: FieldRenderProps): VNode {
  const { spec, value, error, disabled, readonly, path, ctx } = p;
  const bracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);
  const displayValue = applyDefaultString(value, spec.default);
  const rulesMaxlength = (spec.rules as Record<string, unknown> | undefined)?.maxlength;
  const maxLength =
    spec.counter && typeof rulesMaxlength === 'number' ? rulesMaxlength : undefined;
  const classes = ['valid-target', 'form-control'];
  if (spec.element_class) classes.push(spec.element_class as string);
  if (error) classes.push('is-invalid');

  const children: VNode[] = [];
  if (spec.prepend) {
    children.push(
      rawSpan(
        `input-group-text${spec.prepend_class ? ` ${spec.prepend_class as string}` : ''}`,
        spec.prepend as string
      )
    );
  }
  children.push(
    h('textarea', attrs({
      name: bracketName,
      disabled: disabled || undefined,
      readonly: readonly || undefined,
      class: classes.join(' '),
      rows: (spec.rows as number | undefined) ?? 5,
      maxlength: maxLength,
      style: parseStyleString(spec.element_style),
      ...legacyDataAttrs(spec, path),
    }), displayValue)
  );
  if (spec.append) {
    children.push(
      rawSpan(
        `input-group-text${spec.append_class ? ` ${spec.append_class as string}` : ''}`,
        spec.append as string
      )
    );
  }
  return h('div', { class: 'input-group' }, children);
}

// ---------------------------------------------------------------------------
// Date/Time
// ---------------------------------------------------------------------------

function formatDateValue(value: string | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  try {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0] ?? '';
  } catch { /* invalid */ }
  return value;
}

function DateField(p: FieldRenderProps): VNode {
  const { spec, value, error, disabled, readonly, path, ctx } = p;
  const rawValue = phpString(value) || phpString(spec.default);
  const formattedValue = formatDateValue(rawValue || undefined);
  const bracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);
  const children: VNode[] = [];
  if (spec.prepend) children.push(rawSpan('input-group-text', spec.prepend as string));
  children.push(
    h('input', attrs({
      type: 'date',
      name: bracketName,
      value: formattedValue,
      disabled: disabled || undefined,
      readonly: readonly || undefined,
      class: error ? 'valid-target form-control is-invalid' : 'valid-target form-control',
      ...legacyDataAttrs(spec, path),
    }))
  );
  if (spec.append) children.push(rawSpan('input-group-text', spec.append as string));
  return h('div', { class: 'input-group' }, children);
}

function formatDatetimeValue(value: string | undefined): string {
  if (!value) return '';
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?/.exec(value);
  if (m) return m[1] + (m[2] ?? ':00');
  try {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
      );
    }
  } catch { /* invalid */ }
  return value;
}

interface DatetimeEventSpec { type?: unknown; function?: unknown }

export function datetimeNeedsRawHtml(spec: ReactFieldSpec): boolean {
  const event = (spec as Record<string, unknown>).event as DatetimeEventSpec | undefined;
  if (event && Array.isArray(event.type) && event.type.length > 0) return true;
  const onchange = (spec as Record<string, unknown>).onchange;
  return typeof onchange === 'string' && onchange !== '';
}

function inlineJs(fn: string): string {
  return minifyJs(fn.split('"').join('\\"'));
}

export function datetimeLegacyRawHtml(
  spec: ReactFieldSpec,
  path: string,
  keyPrefix: string | undefined,
  value: unknown
): string {
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix);
  const rawValue = phpString(value) || phpString(spec.default);
  const formattedValue = formatDatetimeValue(rawValue || undefined);

  let onchange = '';
  const event = (spec as Record<string, unknown>).event as DatetimeEventSpec | undefined;
  if (event) {
    const fn = typeof event.function === 'string' ? event.function : '';
    const types = Array.isArray(event.type) ? event.type : [];
    for (const ev of types) {
      if (ev === 'onchange') onchange += ` onchange="${escAttr(inlineJs(fn))}"`;
      if (ev === 'onload') onchange += ` data-onload="${escAttr(inlineJs(fn))}"`;
    }
  }
  const specOnchange = (spec as Record<string, unknown>).onchange;
  if (typeof specOnchange === 'string' && specOnchange !== '') {
    onchange += ` onchange="${escAttr(inlineJs(specOnchange))}"`;
  }
  const readonly = spec.readonly ? ' readonly="readonly"' : '';
  const style =
    typeof spec.style === 'string' && spec.style ? ` style="${escAttr(spec.style)}"` : '';
  return (
    `<input type="datetime-local" class="valid-target form-control"` +
    ` name="${escAttr(bracketName)}" data-name="${escAttr(leafName(path))}"` +
    ` data-rule-name="${escAttr(ruleNameForPath(path))}"` +
    ` value="${escAttr(formattedValue)}" data-default="${escAttr(phpString(spec.default))}"` +
    `${readonly}${onchange}${style} />`
  );
}

function DatetimeField(p: FieldRenderProps): VNode {
  const { spec, value, error, disabled, readonly, path, ctx } = p;
  const rawValue = phpString(value) || phpString(spec.default);
  const formattedValue = formatDatetimeValue(rawValue || undefined);
  const bracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);
  return h('input', attrs({
    type: 'datetime-local',
    name: bracketName,
    value: formattedValue,
    disabled: disabled || undefined,
    readonly: readonly || undefined,
    class: error ? 'valid-target form-control is-invalid' : 'valid-target form-control',
    style: parseStyleString(spec.style),
    ...legacyDataAttrs(spec, path),
  }));
}

function TimeField(p: FieldRenderProps): VNode {
  const { spec, value, error, disabled, readonly, path, ctx } = p;
  const bracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);
  const children: VNode[] = [];
  if (spec.prepend) children.push(rawSpan('input-group-text', spec.prepend as string));
  children.push(
    h('input', attrs({
      type: 'time',
      name: bracketName,
      value: (value as string) ?? '',
      disabled: disabled || undefined,
      readonly: readonly || undefined,
      class: getInputClasses('', spec, !!error),
      min: spec.min as string | undefined,
      max: spec.max as string | undefined,
      step: spec.step as number | undefined,
      ...getLegacyDataAttributes(spec, path),
    }))
  );
  if (spec.append) children.push(rawSpan('input-group-text', spec.append as string));
  return h('div', { class: 'input-group' }, children);
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

function SelectField(p: FieldRenderProps): VNode {
  const { spec, value, error, disabled, readonly, path, ctx, language, buttonsHtml } = p;
  const t = ctx.t;
  const bracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);

  const effectiveValue = (() => {
    const v = phpString(value);
    return v.length === 0 ? phpString(spec.default) : v;
  })();

  const classes = ['valid-target', 'form-select'];
  if (spec.element_class) classes.push(spec.element_class as string);
  if (error) classes.push('is-invalid');

  const readonlyTruthy = phpTruthy(phpString(spec.readonly));
  const inlineOnchange =
    typeof spec.onchange === 'string' && spec.onchange ? `${minifyJs(spec.onchange as string)};` : null;
  const dynActive =
    typeof (spec as Record<string, unknown>).dynamic_onchange === 'string' &&
    (spec as Record<string, unknown>).dynamic_onchange !== '' &&
    Boolean(buttonsHtml);

  if ((inlineOnchange && !readonlyTruthy) || dynActive) {
    const da = legacyDataAttrs(spec, path);
    let elementStyle = (spec.element_style as string) ?? '';
    if (readonlyTruthy) {
      elementStyle +=
        "-webkit-appearance: none; -moz-appearance: none; text-indent: 1px;text-overflow: ''; pointer-events: none;";
    }
    const onchangeAttr = readonlyTruthy
      ? ` readonly onfocus="this.initialSelect = this.selectedIndex;" onchange="this.selectedIndex = this.initialSelect;"`
      : inlineOnchange
        ? ` onchange="${escAttr(inlineOnchange)}"`
        : '';
    const disabledAll = phpTruthy(phpString(spec.disabled)) ? 'disabled="disabled"' : '';
    const disables = Array.isArray((spec as Record<string, unknown>).disables)
      ? ((spec as Record<string, unknown>).disables as unknown[]).map((d) => phpString(d))
      : [];
    let optionHtml = '';
    const items = spec.items;
    if (items && typeof items === 'object' && !('model' in items)) {
      for (const [itemValueRaw, itemTextRaw] of Object.entries(items as Record<string, unknown>)) {
        let itemText: unknown = itemTextRaw;
        if (itemText !== null && typeof itemText === 'object' && !Array.isArray(itemText)) {
          const langText = (itemText as Record<string, unknown>)[language];
          if (langText !== undefined) itemText = langText;
        }
        const itemValue = phpString(itemValueRaw);
        if (itemText !== null && typeof itemText === 'object') {
          optionHtml += `<optgroup label="${escAttr(itemValue)}">`;
          for (const [subValRaw, subTextRaw] of Object.entries(itemText as Record<string, unknown>)) {
            const subVal = phpString(subValRaw);
            const dis = disables.includes(subVal) ? 'disabled="disabled"' : disabledAll;
            const subText = phpString(subTextRaw);
            const label = escText(subText ? `${itemValue} > ${subText}` : itemValue);
            optionHtml +=
              effectiveValue === subVal
                ? `<option value="${escAttr(subVal)}" selected="selected"${dis}>${label}</option>`
                : `<option value="${escAttr(subVal)}" ${dis}>${label}</option>`;
          }
          optionHtml += '</optgroup>';
        } else {
          const dis = disables.includes(itemValue) ? 'disabled="disabled"' : disabledAll;
          const label = escText(phpString(itemText));
          optionHtml +=
            effectiveValue === itemValue
              ? `<option value="${escAttr(itemValue)}" selected="selected"${dis}>${label}</option>`
              : `<option value="${escAttr(itemValue)}" ${dis}>${label}</option>`;
        }
      }
    } else {
      optionHtml = '<option value="">select</option>';
    }
    const prependHtml = spec.prepend ? `<span class="input-group-text">${spec.prepend}</span>` : '';
    const appendHtml = spec.append ? `<span class="input-group-text">${spec.append}</span>` : '';
    const selectHtml =
      `<select class="valid-target form-select${spec.element_class ? ` ${spec.element_class as string}` : ''}"` +
      (elementStyle.trim() ? ` style="${escAttr(elementStyle)}"` : '') +
      ` name="${escAttr(bracketName)}" data-name="${escAttr(da['data-name']!)}"` +
      ` data-rule-name="${escAttr(da['data-rule-name']!)}"` +
      onchangeAttr +
      ` data-default="${escAttr(da['data-default']!)}">${optionHtml}</select>`;
    return h('div', {
      class: 'input-group',
      innerHTML: prependHtml + selectHtml + appendHtml + (buttonsHtml ?? ''),
    });
  }

  // Non-raw branch: faithful PHP option loop rendered through h().
  const items = spec.items;
  const optionNodes: VNode[] = [];
  if (items && typeof items === 'object' && !('model' in items)) {
    for (const [keyRaw, val] of itemEntries(items)) {
      const itemValue = phpString(keyRaw);
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        // Could be multi-lang label OR optgroup. Detect language-code map.
        const keys = Object.keys(val);
        const langCodes = ['ko', 'en', 'ja', 'zh'];
        const isLang = keys.length > 0 && keys.every((k) => langCodes.includes(k));
        if (isLang) {
          optionNodes.push(
            h('option', attrs({ value: itemValue, selected: effectiveValue === itemValue || undefined }), t(val as Record<string, string>))
          );
        } else {
          const subNodes: VNode[] = [];
          for (const [subKey, subVal] of Object.entries(val as Record<string, unknown>)) {
            subNodes.push(
              h('option', attrs({ value: subKey, selected: effectiveValue === subKey || undefined }), t(subVal as string | Record<string, string>))
            );
          }
          optionNodes.push(h('optgroup', { label: itemValue }, subNodes));
        }
      } else {
        optionNodes.push(
          h('option', attrs({ value: itemValue, selected: effectiveValue === itemValue || undefined }), t(val as string))
        );
      }
    }
  } else {
    optionNodes.push(h('option', { value: '' }, 'select'));
  }

  const children: VNode[] = [];
  if (spec.prepend) children.push(rawSpan('input-group-text', spec.prepend as string));
  children.push(
    h('select', attrs({
      name: bracketName,
      disabled: disabled || readonly || undefined,
      class: classes.join(' '),
      ...legacyDataAttrs(spec, path),
    }), optionNodes)
  );
  if (spec.append) children.push(rawSpan('input-group-text', spec.append as string));
  if (p.buttons) children.push(p.buttons as VNode);
  return h('div', { class: 'input-group' }, children);
}

// ---------------------------------------------------------------------------
// Checkbox / Switcher
// ---------------------------------------------------------------------------

function CheckboxField(p: FieldRenderProps): VNode {
  const { spec, value, error, disabled, readonly, path, ctx } = p;
  const title = spec.label ? ctx.t(spec.label) : '';
  const fullBracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);

  let checked: boolean;
  if (typeof value === 'boolean') {
    checked = value;
  } else {
    const v = phpString(value);
    const effective = v.length === 0 ? phpString(spec.default) : v;
    checked = phpTruthy(effective);
  }

  return h('div', {}, [
    h('input', attrs({
      type: 'checkbox',
      name: fullBracketName,
      value: '1',
      checked: checked || undefined,
      disabled: disabled || readonly || undefined,
      class: error ? 'valid-target is-invalid' : 'valid-target',
      'data-name': leafName(path),
      'data-rule-name': ruleNameForPath(path),
      style: parseStyleString(spec.style),
    })),
    ' ',
    h('span', {}, title),
  ]);
}

function SwitcherField(p: FieldRenderProps): VNode {
  const { spec, value, error, disabled, readonly, path, ctx } = p;
  const bracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);
  const onLabel = (spec.on_label as string) ?? ctx.t('on') ?? 'On';
  const children: (VNode | string)[] = [];
  if (spec.prepend) children.push(h('span', { innerHTML: spec.prepend as string }));
  children.push(
    h('input', attrs({
      type: 'checkbox',
      name: bracketName,
      value: '1',
      checked: Boolean(value) || undefined,
      disabled: disabled || readonly || undefined,
      class: getCheckboxClasses(spec, !!error),
      ...getLegacyDataAttributes(spec, path),
    }))
  );
  children.push(' ');
  if (spec.show_labels !== false) children.push(h('span', {}, onLabel));
  if (spec.append) children.push(h('span', { innerHTML: spec.append as string }));
  return h('div', {}, children);
}

// ---------------------------------------------------------------------------
// Choice / Multichoice
// ---------------------------------------------------------------------------

function ChoiceField(p: FieldRenderProps): VNode {
  const { spec, value, error, path, ctx } = p;
  const t = ctx.t;
  const token = nextChoiceToken();
  const bracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);

  let options: Array<{ value: string; label: string }> = [];
  const items = spec.items;
  if (items && typeof items === 'object' && !(!Array.isArray(items) && 'model' in items)) {
    options = itemEntries(items).map(([key, label]) => ({
      value: key,
      label: t(label as string | Record<string, string>),
    }));
  }

  const defaultStr =
    spec.default !== undefined && spec.default !== null && !Array.isArray(spec.default)
      ? phpString(spec.default)
      : null;
  const effectiveValue = (() => {
    const v = phpString(value);
    return v.length === 0 ? (defaultStr ?? '') : v;
  })();

  const idPrefix = `choice-${cleanStr(bracketName)}`;

  const readonlyMap = new Set<string>();
  const ro = spec.readonly as unknown;
  if (ro && typeof ro === 'object' && !Array.isArray(ro)) {
    const list = (ro as Record<string, string[]>)[effectiveValue];
    if (Array.isArray(list)) for (const k of list) readonlyMap.add(String(k));
  }
  if (Array.isArray(spec.disableds)) {
    for (const k of spec.disableds as unknown[]) readonlyMap.add(String(k));
  }

  const containerClass =
    'btn-group btn-group-toggle' +
    (spec.readonly === true ? ' pe-none bg-secondary' : '') +
    (spec.button_class ? ` ${spec.button_class as string}` : '');

  const dataName = leafName(path);
  const dataRuleName = ruleNameForPath(path);

  const inlineOnchange =
    typeof spec.onchange === 'string' && spec.onchange ? minifyJs(spec.onchange as string) : null;
  const inlineOnclick =
    typeof spec.onclick === 'string' && spec.onclick ? minifyJs(spec.onclick as string) : null;
  const initChange = Boolean((spec as Record<string, unknown>)['data-init-change']);

  if (inlineOnchange || inlineOnclick) {
    const inputClass = `valid-target btn-check${spec.input_class ? ` ${spec.input_class as string}` : ''}${error ? ' is-invalid' : ''}`;
    const html = options
      .map((option, index) => {
        const inputId = `${idPrefix}-${token}-${index + 1}`;
        const isDefault = (defaultStr ?? '') === option.value && defaultStr !== null;
        const isChecked = effectiveValue === option.value;
        const pe = readonlyMap.has(option.value) ? ' pe-none' : '';
        const labelClass = `btn btn-switch${spec.element_class ? ` ${spec.element_class as string}` : ''}${pe}`;
        return (
          `<input id="${escAttr(inputId)}" class="${escAttr(inputClass)}" type="radio"` +
          ` name="${escAttr(bracketName)}" autocomplete="off"` +
          ` data-name="${escAttr(dataName)}" data-rule-name="${escAttr(dataRuleName)}"` +
          ` value="${escAttr(option.value)}" data-is-default="${isDefault ? '1' : ''}"` +
          (inlineOnchange ? ` onchange="${escAttr(inlineOnchange)}"` : '') +
          (inlineOnclick ? ` onclick="${escAttr(inlineOnclick)}"` : '') +
          (initChange ? ' data-init-change="true"' : '') +
          (isChecked ? ' checked="checked"' : '') +
          `><label for="${escAttr(inputId)}" class="${escAttr(labelClass)}">` +
          `<span>${escText(option.label)}</span></label>`
        );
      })
      .join('');
    return h('div', { class: containerClass, 'data-toggle': 'buttons', innerHTML: html });
  }

  const children: VNode[] = [];
  options.forEach((option, index) => {
    const isChecked = effectiveValue === option.value;
    const isDefault = (defaultStr ?? '') === option.value && defaultStr !== null;
    const inputId = `${idPrefix}-${token}-${index + 1}`;
    const pe = readonlyMap.has(option.value) ? ' pe-none' : '';
    children.push(
      h('input', attrs({
        id: inputId,
        type: 'radio',
        name: bracketName,
        value: option.value,
        checked: isChecked || undefined,
        disabled: p.disabled || undefined,
        autocomplete: 'off',
        class: `valid-target btn-check${spec.input_class ? ` ${spec.input_class as string}` : ''}${error ? ' is-invalid' : ''}`,
        'data-name': dataName,
        'data-rule-name': dataRuleName,
        'data-is-default': isDefault ? '1' : '',
      }))
    );
    children.push(
      h('label', {
        for: inputId,
        class: `btn btn-switch${spec.element_class ? ` ${spec.element_class as string}` : ''}${pe}`,
      }, [h('span', {}, option.label)])
    );
  });
  return h('div', { class: containerClass, 'data-toggle': 'buttons' }, children);
}

function MultichoiceField(p: FieldRenderProps): VNode {
  const { spec, value, error, path, ctx } = p;
  const t = ctx.t;

  let selectedValues: string[];
  if (Array.isArray(value)) selectedValues = (value as unknown[]).map(String);
  else if (value) selectedValues = [String(value)];
  else selectedValues = [];
  if (selectedValues.length === 0 && spec.default !== undefined && spec.default !== null) {
    selectedValues = Array.isArray(spec.default)
      ? (spec.default as unknown[]).map((d) => phpString(d))
      : [phpString(spec.default)];
  }

  let options: Array<{ value: string; label: string }> = [];
  const items = spec.items;
  if (items && typeof items === 'object' && !(!Array.isArray(items) && 'model' in items)) {
    options = itemEntries(items).map(([key, label]) => ({
      value: key,
      label: t(label as string | Record<string, string>),
    }));
  }

  const bracketBase = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);
  const bracketName = leafName(path).endsWith('[]') ? `${bracketBase}[]` : bracketBase;
  const idPrefix = `mchoice-${cleanStr(bracketName)}`;
  const dataName = leafName(path);
  const dataRuleName = ruleNameForPath(path);

  const children: VNode[] = [];
  options.forEach((option, index) => {
    const isChecked = selectedValues.includes(option.value);
    const inputId = `${idPrefix}${index + 1}`;
    children.push(
      h('input', attrs({
        type: 'checkbox',
        id: inputId,
        name: bracketName,
        value: option.value,
        checked: isChecked || undefined,
        disabled: p.disabled || undefined,
        autocomplete: 'off',
        class: `valid-target btn-check${error ? ' is-invalid' : ''}`,
        'data-name': dataName,
        'data-rule-name': dataRuleName,
      }))
    );
    children.push(
      h('label', {
        for: inputId,
        class: `btn btn-switch btn-mswitch${spec.element_class ? ` ${spec.element_class as string}` : ''}`,
      }, [h('span', {}, option.label)])
    );
  });
  return h('div', { class: 'btn-group flex-wrap btn-group-toggle' }, children);
}

// ---------------------------------------------------------------------------
// Hidden / Dummy / DummyInput / Button
// ---------------------------------------------------------------------------

function HiddenField(p: FieldRenderProps): VNode {
  const { spec, value, path, ctx } = p;
  const bracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);
  return h('input', attrs({
    type: 'hidden',
    name: bracketName,
    value: (value as string) ?? (spec.default as string) ?? '',
    ...getLegacyDataAttributes(spec, path),
  }));
}

function nl2br(s: string): string {
  return s.replace(/(\r\n|\n\r|\r|\n)/g, '<br />$1');
}

function DummyField(p: FieldRenderProps): VNode {
  const { spec, value } = p;
  let v: unknown = value;
  if ((v === null || v === undefined) && phpTruthy(phpString(spec.default))) v = spec.default;
  const items = spec.items;
  if (items && typeof items === 'object' && !Array.isArray(items) && !('model' in items)) {
    const looked = (items as Record<string, unknown>)[phpString(v)];
    if (looked !== undefined) v = looked;
  }
  const text = phpString(v);
  const html = phpTruthy(text) ? nl2br(text) : text;
  return h('div', {
    class: spec.element_class ? String(spec.element_class) : undefined,
    style: parseStyleString(spec.element_style),
    innerHTML: html,
  });
}

function DummyInputField(p: FieldRenderProps): VNode {
  const { spec, value, disabled, path, ctx } = p;
  const bracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);
  const displayValue = applyDefaultString(value, spec.default);
  const elementStyle = `${(spec.element_style as string) ?? ''}${spec.readonly ? ' pointer-events: none;' : ''}`;
  const children: VNode[] = [];
  if (spec.prepend) children.push(rawSpan('input-group-text', spec.prepend as string));
  children.push(
    h('input', attrs({
      type: 'text',
      name: bracketName,
      value: displayValue,
      readonly: true,
      disabled: disabled || spec.disabled === true || undefined,
      class: `form-control${spec.element_class ? ` ${spec.element_class as string}` : ''}`,
      placeholder: spec.placeholder ? ctx.t(spec.placeholder) : undefined,
      style: parseStyleString(elementStyle),
      'data-default': phpString(spec.default),
    }))
  );
  if (spec.append) children.push(rawSpan('input-group-text', spec.append as string));
  return h('div', { class: 'input-group' }, children);
}

function ButtonField(p: FieldRenderProps): VNode[] {
  const { spec, value, path, readonly, ctx } = p;
  const bracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);
  const id = bracketName.split('[').join('_').split(']').join('');
  const da = legacyDataAttrs(spec, path);
  const ruleName =
    typeof (spec as Record<string, unknown>).rule_name === 'string'
      ? ((spec as Record<string, unknown>).rule_name as string)
      : da['data-rule-name']!;
  const initScript =
    typeof (spec as Record<string, unknown>).init_script === 'string'
      ? ((spec as Record<string, unknown>).init_script as string)
      : '';
  const onclick = typeof spec.onclick === 'string' ? (spec.onclick as string) : '';
  const script =
    `\n$(function() {\n    ${initScript}\n    $("#btn${id}").on('click', function() {\n        ${onclick}\n    });\n});\n`;
  const displayValue = applyDefaultString(value, spec.default);
  const text = spec.text !== undefined ? ctx.t(spec.text as string) : '';
  const isReadonly = readonly || phpString(spec.readonly) === '1' || spec.readonly === true;
  return [
    h('script', { nonce: '', innerHTML: script }),
    h('input', attrs({
      type: 'hidden',
      class: 'valid-target form-control',
      readonly: true,
      name: bracketName,
      'data-name': da['data-name'],
      'data-rule-name': ruleName,
      value: displayValue,
      'data-default': da['data-default'],
    })),
    h('input', attrs({
      type: 'button',
      class: `btn${spec.button_class ? ` ${spec.button_class as string}` : ''}`,
      name: `btn${bracketName}`,
      id: `btn${id}`,
      value: text,
      readonly: isReadonly || undefined,
    })),
  ];
}

// ---------------------------------------------------------------------------
// Image (file input-group, legacy-raw)
// ---------------------------------------------------------------------------

const FILE_ARRAY_KEYS = [
  'name', 'type', 'size', 'tmp_name', 'error', 'full_path', 'file_name_alias_seq', 'url',
] as const;

function isFileArrayValue(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).name === 'string' &&
    ('url' in value || 'size' in value || 'tmp_name' in value)
  );
}

function ImageField(p: FieldRenderProps): VNode {
  const { spec, value, path, ctx, language, buttonsHtml } = p;
  const bracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);
  const specRec = spec as Record<string, unknown>;
  const rules = (spec.rules ?? {}) as Record<string, unknown>;
  const accept = typeof rules.accept === 'string' ? rules.accept : 'image/*';
  const maxWidth = phpString(specRec['max-width']) || '0';
  const minWidth = phpString(specRec['min-width']) || '0';
  const maxHeight = phpString(specRec['max-height']) || '0';
  const minHeight = phpString(specRec['min-height']) || '0';
  const viewWidth = phpString(specRec['preview-max-width']) || '0';
  const viewHeight = phpString(specRec['preview-max-height']) || '0';

  let prependHtml = '';
  if (specRec.prepend) {
    const prependClass = specRec.prepend_class ? ` ${String(specRec.prepend_class)}` : '';
    let prependText: string;
    if (specRec.prepend !== null && typeof specRec.prepend === 'object' && !Array.isArray(specRec.prepend)) {
      prependText = phpString((specRec.prepend as Record<string, unknown>)[language]);
    } else {
      prependText = phpString(specRec.prepend);
    }
    prependHtml = `<span class="input-group-text${escAttr(prependClass)}">${prependText}</span>`;
  }

  const sizeAttrs =
    ` data-max-width="${escAttr(maxWidth)}" data-min-width="${escAttr(minWidth)}"` +
    ` data-max-height="${escAttr(maxHeight)}" data-min-height="${escAttr(minHeight)}"` +
    ` data-preview-max-width="${escAttr(viewWidth)}" data-preview-max-height="${escAttr(viewHeight)}"`;
  const validAttrs =
    ` data-name="${escAttr(leafName(path))}" data-rule-name="${escAttr(ruleNameForPath(path))}"`;

  if (isFileArrayValue(value)) {
    const fileArray = value;
    const fileName = phpString(fileArray.name);
    let html =
      `<div class="input-group">${prependHtml}` +
      `<input type="text" class="form-control form-control-file" value="${escAttr(fileName)}" readonly="readonly" />`;
    for (const key of FILE_ARRAY_KEYS) {
      if (!(key in fileArray)) continue;
      if (key === 'name') {
        html +=
          `<input type="text" class="valid-target form-control-file form-control-filetext form-control-image"` +
          `${sizeAttrs} name="${escAttr(bracketName)}[name]"${validAttrs}` +
          ` value="${escAttr(fileName)}" accept="${escAttr(accept)}" />`;
      } else if (key !== 'tmp_name') {
        html +=
          `<input type="hidden" class="clone-element" name="${escAttr(bracketName)}[${key}]"` +
          ` value="${escAttr(phpString(fileArray[key]))}" />`;
      }
    }
    html +=
      '<button class="btn btn-search btn-file-search-text" type="button">&nbsp;</button>' +
      (buttonsHtml ?? '') + '</div>';
    const url = phpString(fileArray.url);
    const previewStyle = viewWidth !== '0' ? ` style="max-width:${escAttr(viewWidth)}px"` : '';
    html +=
      `<div class="form-preview clone-element"><div><a href="${escAttr(url)}" target="_new">` +
      `<img${previewStyle} src="${escAttr(url)}" class="form-preview-image"></a></div></div>`;
    return h('div', { style: 'display:contents', innerHTML: html });
  }

  const html =
    prependHtml +
    '<input type="text" class="form-control form-control-file" value="" readonly="readonly" />' +
    `<input type="file" class="valid-target form-control-file form-control-image"${sizeAttrs}` +
    ` name="${escAttr(bracketName)}"${validAttrs} value="" accept="${escAttr(accept)}" />` +
    '<button class="btn btn-search btn-file-search" type="button">&nbsp;</button>' +
    (buttonsHtml ?? '');
  return h('div', { class: 'input-group', innerHTML: html });
}

// ---------------------------------------------------------------------------
// Search (select2, legacy-raw)
// ---------------------------------------------------------------------------

function itemTextLocalized(v: unknown, language: string): string {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    const localized = (v as Record<string, unknown>)[language];
    if (typeof localized === 'string') return localized;
  }
  return phpString(v);
}

function SearchField(p: FieldRenderProps): VNode[] {
  const { spec, value, disabled, readonly, path, ctx, language } = p;
  const uniq = generateUniqid().slice(2, -2);
  const bracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);
  const id = `${cleanStr(bracketName)}_${uniq}`;
  const specRec = spec as Record<string, unknown>;

  const keywordMinLength = specRec.keyword_min_length ? String(specRec.keyword_min_length) : '2';
  const hideSearching = specRec.hide_searching !== undefined && !specRec.hide_searching ? false : true;
  const delay = specRec.delay ? String(specRec.delay) : '250';
  const apiServer =
    typeof specRec.api_server === 'string' && specRec.api_server ? minifyJs(specRec.api_server) : '';

  const effectiveValue = (() => {
    const v = phpString(value);
    return v.length === 0 ? phpString(spec.default) : v;
  })();

  let elementStyle = typeof specRec.element_style === 'string' ? specRec.element_style : '';
  if (spec.readonly || readonly) {
    elementStyle +=
      "-webkit-appearance: none; -moz-appearance: none; text-indent: 1px;text-overflow: ''; pointer-events: none;";
  }
  const styleAttr = elementStyle ? ` style="${escAttr(elementStyle)}"` : '';
  const elementClass = specRec.element_class ? ` ${String(specRec.element_class)}` : '';
  const globalDisabledAttr = spec.disabled || disabled ? 'disabled="disabled"' : '';
  const disables = Array.isArray(specRec.disables) ? (specRec.disables as unknown[]).map(String) : [];

  let prependHtml = '';
  if (specRec.prepend) {
    const prependClass = specRec.prepend_class ? ` ${String(specRec.prepend_class)}` : '';
    const prependText = itemTextLocalized(specRec.prepend, language);
    prependHtml = `<span class="input-group-text ${prependClass}">${prependText}</span>`;
  }
  let appendHtml = '';
  if (specRec.append) appendHtml = `<span class="input-group-text">${String(specRec.append)}</span>`;

  let containerClass = '';
  if (!prependHtml) containerClass += ' input-group-first';
  if (!appendHtml && !specRec.multiple) containerClass += ' input-group-last';

  let optionHtml = '';
  if (specRec.items !== undefined && specRec.items !== null) {
    for (const [itemKey, itemValue] of itemEntries(specRec.items)) {
      let coverUrl = '';
      let text: string;
      let prependText = '';
      let appendText = '';
      let optionClass = '';
      if (itemValue !== null && typeof itemValue === 'object' && 'id' in (itemValue as object)) {
        const o = itemValue as Record<string, unknown>;
        coverUrl = phpString(o.cover_url);
        text = itemTextLocalized(o.text, language);
        prependText = phpString(o.prepend_text);
        appendText = phpString(o.append_text);
        if (o.class) optionClass = ` ${String(o.class)}`;
      } else {
        text = itemTextLocalized(itemValue, language);
      }
      const optionDisabled = disables.includes(itemKey) ? 'disabled="disabled"' : globalDisabledAttr;
      const selected = effectiveValue === String(itemKey);
      optionHtml +=
        `<option data-prepend-text="${escAttr(prependText)}" data-append-text="${escAttr(appendText)}"` +
        ` data-cover-url="${escAttr(coverUrl)}" value="${escAttr(itemKey)}"` +
        (selected ? ' selected="selected"' : ' ') +
        `${optionDisabled} data-class="${escAttr(optionClass)}">${escText(text)}</option>`;
    }
  } else {
    optionHtml = '<option value="">select</option>';
  }

  let onchangeAttr = '';
  if (typeof specRec.onchange === 'string' && specRec.onchange) {
    onchangeAttr = ` onchange="${escAttr(minifyJs(specRec.onchange))}"`;
  } else if (spec.readonly || readonly) {
    onchangeAttr =
      " readonly onFocus='this.initialSelect = this.selectedIndex;'" +
      " onChange='this.selectedIndex = this.initialSelect;'";
  }

  const selectHtml =
    `<select class="valid-target form-control${escAttr(elementClass)}"${styleAttr}` +
    ` name="${escAttr(bracketName)}" data-class="${escAttr(containerClass)}"` +
    ` data-keyword-min-length="${escAttr(keywordMinLength)}" data-delay="${escAttr(delay)}"` +
    ` data-api-server="${escAttr(apiServer)}" data-name="${escAttr(leafName(path))}"` +
    ` data-rule-name="${escAttr(ruleNameForPath(path))}" id="${escAttr(id)}"${onchangeAttr}` +
    ` data-default="${escAttr(phpString(spec.default))}">${optionHtml}</select>`;

  const callback =
    typeof specRec.callback === 'string' && specRec.callback
      ? `$('#${id}').on('select2:select', ${specRec.callback});`
      : '';

  const out: VNode[] = [];
  if (hideSearching) {
    out.push(
      h('style', { nonce: '', innerHTML: `.${id}_select2 .loading-results { display: none; }` })
    );
  }
  out.push(
    h('script', {
      nonce: '',
      innerHTML: `$(function() {select2('${id}', '${keywordMinLength}', '${delay}', '${containerClass}');${callback}});`,
    })
  );
  out.push(h('div', { class: 'input-group field-search', innerHTML: prependHtml + selectHtml + appendHtml }));
  return out;
}

// ---------------------------------------------------------------------------
// Tinymce (textarea + bootstrap script)
// ---------------------------------------------------------------------------

function TinymceField(p: FieldRenderProps): VNode[] {
  const { spec, value, disabled, readonly, path, ctx } = p;
  const idRaw = generateUniqid().slice(2, -2);
  const bracketName = toBracketNotationWithPrefix(path, ctx.keyPrefix || undefined);
  const rows = (spec.rows as number | undefined) ?? 3;
  const height = (spec as Record<string, unknown>).height ?? 300;
  const upload = ((spec as Record<string, unknown>).fileserver as string | undefined) ?? 'upload';
  const readonlyJs = spec.readonly !== undefined ? (spec.readonly ? 'true' : 'false') : 'false';
  const displayValue = applyDefaultString(value, spec.default);
  const editorId = `tinymce${idRaw}`;
  return [
    h('textarea', attrs({
      id: editorId,
      class: 'valid-target form-control tinymcearea',
      name: bracketName,
      disabled: disabled || undefined,
      readonly: readonly || undefined,
      rows,
      'data-type': spec.type ?? 'tinymce',
      'data-height': String(height),
      'data-upload-server': upload,
      ...legacyDataAttrs(spec, path),
    }), displayValue),
    h('script', {
      nonce: '',
      innerHTML: `$(function() {editor_tinymce('#${editorId}', ${String(height)}, '${upload}', ${readonlyJs});});`,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Tagify (non-faithful placeholder, mirrors React; not in strict golden path)
// ---------------------------------------------------------------------------

function TagifyField(p: FieldRenderProps): VNode {
  const { spec, value, error, disabled, readonly, path, ctx } = p;
  const t = ctx.t;
  const tags: string[] = Array.isArray(value)
    ? (value as unknown[]).filter((v): v is string => typeof v === 'string')
    : typeof value === 'string' && value
      ? value.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  const maxTags = spec.max_tags as number | undefined;
  const bracketName = toBracketNotationWithPrefix(path);

  const children: VNode[] = [];
  if (spec.prepend) children.push(rawSpan('input-group-text', spec.prepend as string));
  const inner: VNode[] = [];
  for (const tag of tags) {
    inner.push(h('span', { class: 'badge bg-primary d-flex align-items-center gap-1' }, [h('span', {}, tag)]));
  }
  if (!disabled && !readonly && (!maxTags || tags.length < maxTags)) {
    inner.push(
      h('input', attrs({
        type: 'text',
        name: bracketName,
        value: '',
        class: 'valid-target border-0 flex-grow-1',
        style: 'outline: none; min-width: 100px',
        placeholder: tags.length === 0 && spec.placeholder ? t(spec.placeholder) : '',
        ...getLegacyDataAttributes(spec, path),
      }))
    );
  }
  children.push(
    h('div', {
      class: `form-control d-flex flex-wrap align-items-center gap-1 ${disabled ? 'disabled' : ''} ${error ? 'is-invalid' : ''}`,
      style: 'min-height: 38px; cursor: text',
    }, inner)
  );
  if (spec.append) children.push(rawSpan('input-group-text', spec.append as string));
  if (spec.helper) children.push(h('div', { class: 'form-text' }, t(spec.helper as string)));
  return h('div', { class: 'form-tagify-wrapper' }, children);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export type FieldRenderer = (p: FieldRenderProps) => VNode | VNode[];

const registry = new Map<string, FieldRenderer>();
registry.set('text', TextField);
registry.set('string', TextField);
registry.set('number', NumberField);
registry.set('integer', NumberField);
registry.set('float', NumberField);
registry.set('decimal', NumberField);
registry.set('email', EmailField);
registry.set('password', PasswordField);
registry.set('textarea', TextareaField);
registry.set('time', TimeField);
registry.set('select', SelectField);
registry.set('dropdown', SelectField);
registry.set('choice', ChoiceField);
registry.set('radio', ChoiceField);
registry.set('multichoice', MultichoiceField);
registry.set('checkboxes', MultichoiceField);
registry.set('checkbox', CheckboxField);
registry.set('bool', CheckboxField);
registry.set('boolean', CheckboxField);
registry.set('date', DateField);
registry.set('datetime', DatetimeField);
registry.set('datetime-local', DatetimeField);
registry.set('file', ImageField);
registry.set('image', ImageField);
registry.set('search', SearchField);
registry.set('autocomplete', SearchField);
registry.set('tagify', TagifyField);
registry.set('tags', TagifyField);
registry.set('tinymce', TinymceField);
registry.set('wysiwyg', TinymceField);
registry.set('switcher', SwitcherField);
registry.set('switch', SwitcherField);
registry.set('toggle', SwitcherField);
registry.set('button', ButtonField);
registry.set('action', ButtonField);
registry.set('hidden', HiddenField);
registry.set('dummy', DummyField);
registry.set('html', DummyField);
registry.set('static', DummyField);
registry.set('dummy-input', DummyInputField);

/**
 * Look up the renderer for a field `type` (case-insensitive). Returns the
 * registered {@link FieldRenderer}, or `undefined` for an unknown type.
 */
export function getFieldRenderer(type: string): FieldRenderer | undefined {
  return registry.get(type.toLowerCase());
}
