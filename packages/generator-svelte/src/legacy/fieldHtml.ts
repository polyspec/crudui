/**
 * fieldHtml — pure HTML emitters for each leaf field type. Each function
 * reproduces the SSR output of the corresponding
 * packages/generator-react/src/components/fields/*.tsx component for an
 * empty-data render, byte-for-byte (verified against the golden fixtures
 * through tests/parity/normalize.js).
 *
 * Mirroring React: where a React field used dangerouslySetInnerHTML the raw
 * string is reproduced verbatim; where it emitted JSX elements, the same
 * attributes are serialized here (React omits undefined/false attributes and
 * renders value="" for empty strings — replicated). Attribute ORDER is not
 * load-bearing (the normalizer sorts), but PRESENCE and VALUES are.
 */

import {
  applyDefaultString,
  cleanStr,
  escAttr,
  escText,
  itemEntries,
  leafName,
  limepieDataAttrs,
  nextChoiceToken,
  phpFloatString,
  phpString,
  phpTruthy,
  ruleNameForPath,
  styleString,
  type SpecNode,
} from './components/fields/limepieParity';
import { generateUniqid, toBracketNotationWithPrefix } from './utils';
import { minifyJs } from './legacyDisplay';
import type { MultiLangText } from './i18n';

/** Inputs a field HTML emitter needs to render one leaf field. */
export interface FieldRenderCtx {
  /** The field's spec node. */
  spec: SpecNode;
  /** The field's current value. */
  value: unknown;
  /** Dot-path of the field within the form. */
  path: string;
  /** Name prefix applied to the field's `name`/`id`. */
  keyPrefix: string;
  /** Active language code for translation. */
  language: string;
  /** Translator resolving a multi-language text to a string. */
  t: (text: MultiLangText | undefined | null, fallback?: string) => string;
  /** Effective readonly (globalReadonly || spec.readonly === true). */
  readonly: boolean;
  /** Effective disabled (globalDisabled || spec.disabled === true). */
  disabled: boolean;
  /**
   * Legacy-raw multiple-row buttons HTML (React MultipleLeafField `buttonsHtml`
   * prop) — consumed by a field's raw branch at the `<!--btn-->` slot.
   */
  buttonsHtml?: string;
  /**
   * JSX-equivalent multiple-row buttons HTML (React MultipleLeafField `buttons`
   * prop) — consumed by a field's controlled branch at the same slot.
   */
  buttonsJsx?: string;
}

type FieldHtml = (ctx: FieldRenderCtx) => string;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Render a single HTML attribute or '' when the value should be omitted. */
function attr(name: string, value: string | undefined): string {
  if (value === undefined) return '';
  return ` ${name}="${escAttr(value)}"`;
}

function prependSpan(spec: SpecNode, withClass: boolean): string {
  if (!spec.prepend) return '';
  const cls = withClass && spec.prepend_class ? ` ${String(spec.prepend_class)}` : '';
  return `<span class="input-group-text${cls}">${spec.prepend}</span>`;
}

function appendSpan(spec: SpecNode, withClass: boolean): string {
  if (!spec.append) return '';
  const cls = withClass && spec.append_class ? ` ${String(spec.append_class)}` : '';
  return `<span class="input-group-text${cls}">${spec.append}</span>`;
}

function bracket(ctx: FieldRenderCtx): string {
  return toBracketNotationWithPrefix(ctx.path, ctx.keyPrefix || undefined);
}

// ---------------------------------------------------------------------------
// text / email / password / number / textarea
// ---------------------------------------------------------------------------

const text: FieldHtml = (ctx) => {
  const { spec, t } = ctx;
  const name = bracket(ctx);
  const displayValue = applyDefaultString(ctx.value, spec.default);
  const elementStyle = `${(spec.element_style as string) ?? ''}${ctx.readonly ? ' pointer-events: none;' : ''}`;
  const classes = ['valid-target', 'form-control'];
  if (spec.element_class) classes.push(spec.element_class as string);

  const input =
    `<input type="text" name="${escAttr(name)}" value="${escAttr(displayValue)}"` +
    ` class="${escAttr(classes.join(' '))}"` +
    (ctx.disabled ? ' disabled=""' : '') +
    (ctx.readonly ? ' readonly=""' : '') +
    (spec.placeholder ? ` placeholder="${escAttr(t(spec.placeholder as MultiLangText))}"` : '') +
    (spec.autocomplete ? ` autocomplete="${escAttr(String(spec.autocomplete))}"` : '') +
    (styleString(elementStyle) ? ` style="${escAttr(styleString(elementStyle)!)}"` : '') +
    attrs(limepieDataAttrs(spec, ctx.path)) +
    ' />';
  // dynamic_onchange rows render the raw legacy buttons (onclick attribute on
  // each button); all other rows render the JSX-equivalent buttons.
  const dynActive =
    typeof spec.dynamic_onchange === 'string' && spec.dynamic_onchange !== '' && Boolean(ctx.buttonsHtml);
  const trailing = dynActive ? ctx.buttonsHtml! : (ctx.buttonsJsx ?? '');
  return `<div class="input-group">${prependSpan(spec, true)}${input}${appendSpan(spec, true)}${trailing}</div>`;
};

const email: FieldHtml = (ctx) => {
  const { spec, t } = ctx;
  const name = bracket(ctx);
  const displayValue = applyDefaultString(ctx.value, spec.default);
  const classes = ['valid-target', 'form-control'];
  if (spec.element_class) classes.push(spec.element_class as string);

  const input =
    `<input type="email" name="${escAttr(name)}" value="${escAttr(displayValue)}"` +
    ` class="${escAttr(classes.join(' '))}"` +
    (ctx.disabled ? ' disabled=""' : '') +
    (ctx.readonly ? ' readonly=""' : '') +
    (spec.placeholder ? ` placeholder="${escAttr(t(spec.placeholder as MultiLangText))}"` : '') +
    (spec.autocomplete ? ` autocomplete="${escAttr(String(spec.autocomplete))}"` : '') +
    attrs(limepieDataAttrs(spec, ctx.path)) +
    ' />';
  // Email prepend/append spans carry no prepend_class in React.
  return `<div class="input-group">${prependSpan(spec, false)}${input}${appendSpan(spec, false)}</div>`;
};

const password: FieldHtml = (ctx) => {
  const { spec } = ctx;
  const name = bracket(ctx);
  const value = (ctx.value as string) ?? '';
  const input =
    `<input type="password" name="${escAttr(name)}" value="${escAttr(value)}"` +
    ` class="valid-target form-control"` +
    (ctx.disabled ? ' disabled=""' : '') +
    (ctx.readonly ? ' readonly=""' : '') +
    (spec.autocomplete ? ` autocomplete="${escAttr(String(spec.autocomplete))}"` : '') +
    attrs(limepieDataAttrs(spec, ctx.path)) +
    ' />';
  // Password is a BARE input (no input-group wrapper).
  return input;
};

const number: FieldHtml = (ctx) => {
  const { spec, t } = ctx;
  const name = bracket(ctx);
  let displayValue = phpString(ctx.value);
  if (displayValue.length > 0) {
    displayValue = phpFloatString(displayValue);
  } else if (spec.default !== undefined && spec.default !== null) {
    displayValue = phpFloatString(spec.default);
  }
  const elementStyle = `${(spec.element_style as string) ?? ''}${ctx.readonly ? ' pointer-events: none;' : ''}`;
  const classes = ['valid-target', 'form-control'];
  if (spec.element_class) classes.push(spec.element_class as string);

  const input =
    `<input type="number" name="${escAttr(name)}" value="${escAttr(displayValue)}"` +
    ` class="${escAttr(classes.join(' '))}"` +
    (ctx.disabled ? ' disabled=""' : '') +
    (ctx.readonly ? ' readonly=""' : '') +
    (spec.placeholder ? ` placeholder="${escAttr(t(spec.placeholder as MultiLangText))}"` : '') +
    (styleString(elementStyle) ? ` style="${escAttr(styleString(elementStyle)!)}"` : '') +
    attrs(limepieDataAttrs(spec, ctx.path)) +
    ' />';
  return `<div class="input-group">${prependSpan(spec, true)}${input}${appendSpan(spec, true)}</div>`;
};

const textarea: FieldHtml = (ctx) => {
  const { spec } = ctx;
  const name = bracket(ctx);
  const displayValue = applyDefaultString(ctx.value, spec.default);
  const rulesMaxlength = (spec.rules as SpecNode | undefined)?.maxlength;
  const maxLength =
    spec.counter && typeof rulesMaxlength === 'number' ? rulesMaxlength : undefined;
  const rows = (spec.rows as number | undefined) ?? 5;
  const elementStyle = styleString(spec.element_style);
  const classes = ['valid-target', 'form-control'];
  if (spec.element_class) classes.push(spec.element_class as string);

  const ta =
    `<textarea name="${escAttr(name)}" class="${escAttr(classes.join(' '))}"` +
    (ctx.disabled ? ' disabled=""' : '') +
    (ctx.readonly ? ' readonly=""' : '') +
    ` rows="${rows}"` +
    (maxLength !== undefined ? ` maxlength="${maxLength}"` : '') +
    (elementStyle ? ` style="${escAttr(elementStyle)}"` : '') +
    attrs(limepieDataAttrs(spec, ctx.path)) +
    `>${escText(displayValue)}</textarea>`;
  return `<div class="input-group">${prependSpan(spec, true)}${ta}${appendSpan(spec, true)}</div>`;
};

// ---------------------------------------------------------------------------
// select
// ---------------------------------------------------------------------------

function isMultiLangText(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  const keys = Object.keys(obj);
  const langCodes = ['ko', 'en', 'ja', 'zh'];
  return keys.length > 0 && keys.every((key) => langCodes.includes(key));
}

const select: FieldHtml = (ctx) => {
  const { spec, t } = ctx;
  const name = bracket(ctx);
  const items = spec.items;

  // Build the option list mirroring SelectField's controlled (non-raw) JSX
  // branch: ungrouped first, then grouped optgroups; multi-lang labels are
  // localized; the selected value is the effective default.
  const effectiveValue = (() => {
    const v = phpString(ctx.value);
    return v.length === 0 ? phpString(spec.default) : v;
  })();

  const ungrouped: Array<{ value: string; label: string }> = [];
  const groups: Record<string, Array<{ value: string; label: string }>> = [] as never;
  const groupOrder: string[] = [];

  let dynamic = false;
  if (items && typeof items === 'object' && !Array.isArray(items) && 'model' in items) {
    dynamic = true;
  }

  if (items && !dynamic) {
    for (const [key, val] of itemEntries(items)) {
      if (typeof val === 'object' && val !== null) {
        if (isMultiLangText(val)) {
          ungrouped.push({ value: key, label: t(val as Record<string, string>) });
        } else {
          for (const [subKey, subVal] of Object.entries(val as Record<string, unknown>)) {
            if (!groups[key]) {
              groups[key] = [];
              groupOrder.push(key);
            }
            groups[key]!.push({ value: subKey, label: t(subVal as MultiLangText) });
          }
        }
      } else {
        ungrouped.push({ value: key, label: t(val as MultiLangText) });
      }
    }
  }

  const totalOptions = ungrouped.length + groupOrder.reduce((n, g) => n + groups[g]!.length, 0);

  const classes = ['valid-target', 'form-select'];
  if (spec.element_class) classes.push(spec.element_class as string);

  // React renders <select value={effectiveValue}>; renderToStaticMarkup
  // reflects the controlled value as selected="" on the matching option.
  const opt = (value: string, label: string): string => {
    const sel = effectiveValue === value ? ' selected=""' : '';
    return `<option value="${escAttr(value)}"${sel}>${escText(label)}</option>`;
  };

  let optionsHtml = '';
  if (totalOptions === 0) optionsHtml += `<option value="">select</option>`;
  for (const o of ungrouped) optionsHtml += opt(o.value, o.label);
  for (const g of groupOrder) {
    optionsHtml += `<optgroup label="${escAttr(g)}">`;
    for (const o of groups[g]!) optionsHtml += opt(o.value, o.label);
    optionsHtml += `</optgroup>`;
  }

  // Legacy-raw branch: spec-authored inline onchange (Select.php emits
  // ` onchange="minify_js($onchange);"`) and/or dynamic_onchange row buttons.
  const readonlyTruthy = phpTruthy(phpString(spec.readonly));
  const inlineOnchange =
    typeof spec.onchange === 'string' && spec.onchange ? `${minifyJs(spec.onchange)};` : null;
  const dynActive =
    typeof spec.dynamic_onchange === 'string' && spec.dynamic_onchange !== '' && Boolean(ctx.buttonsHtml);

  if ((inlineOnchange && !readonlyTruthy) || dynActive) {
    const dataAttrs = limepieDataAttrs(spec, ctx.path);
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

    // Faithful port of Select.php items loop (simple + optgroup; multi-lang
    // labels resolve by the current language key first).
    const disabledAll = phpTruthy(phpString(spec.disabled)) ? 'disabled="disabled"' : '';
    const disables = Array.isArray(spec.disables)
      ? (spec.disables as unknown[]).map((d) => phpString(d))
      : [];
    let rawOptionHtml = '';
    if (items && typeof items === 'object' && !('model' in items)) {
      for (const [itemValueRaw, itemTextRaw] of Object.entries(items as Record<string, unknown>)) {
        let itemTextVal: unknown = itemTextRaw;
        if (itemTextVal !== null && typeof itemTextVal === 'object' && !Array.isArray(itemTextVal)) {
          const langText = (itemTextVal as Record<string, unknown>)[ctx.language];
          if (langText !== undefined) itemTextVal = langText;
        }
        const itemValue = phpString(itemValueRaw);
        if (itemTextVal !== null && typeof itemTextVal === 'object') {
          rawOptionHtml += `<optgroup label="${escAttr(itemValue)}">`;
          for (const [subValRaw, subTextRaw] of Object.entries(itemTextVal as Record<string, unknown>)) {
            const subVal = phpString(subValRaw);
            const dis = disables.includes(subVal) ? 'disabled="disabled"' : disabledAll;
            const subText = phpString(subTextRaw);
            const lbl = escText(subText ? `${itemValue} > ${subText}` : itemValue);
            rawOptionHtml +=
              effectiveValue === subVal
                ? `<option value="${escAttr(subVal)}" selected="selected"${dis}>${lbl}</option>`
                : `<option value="${escAttr(subVal)}" ${dis}>${lbl}</option>`;
          }
          rawOptionHtml += '</optgroup>';
        } else {
          const dis = disables.includes(itemValue) ? 'disabled="disabled"' : disabledAll;
          const lbl = escText(phpString(itemTextVal));
          rawOptionHtml +=
            effectiveValue === itemValue
              ? `<option value="${escAttr(itemValue)}" selected="selected"${dis}>${lbl}</option>`
              : `<option value="${escAttr(itemValue)}" ${dis}>${lbl}</option>`;
        }
      }
    } else {
      rawOptionHtml = '<option value="">select</option>';
    }

    const prependHtml = spec.prepend ? `<span class="input-group-text">${spec.prepend}</span>` : '';
    const appendHtml = spec.append ? `<span class="input-group-text">${spec.append}</span>` : '';
    const selectHtml =
      `<select class="valid-target form-select${spec.element_class ? ` ${String(spec.element_class)}` : ''}"` +
      (elementStyle.trim() ? ` style="${escAttr(elementStyle)}"` : '') +
      ` name="${escAttr(name)}" data-name="${escAttr(dataAttrs['data-name']!)}"` +
      ` data-rule-name="${escAttr(dataAttrs['data-rule-name']!)}"` +
      onchangeAttr +
      ` data-default="${escAttr(dataAttrs['data-default']!)}">${rawOptionHtml}</select>`;
    return `<div class="input-group">${prependHtml}${selectHtml}${appendHtml}${ctx.buttonsHtml ?? ''}</div>`;
  }

  const sel =
    `<select name="${escAttr(name)}" class="${escAttr(classes.join(' '))}"` +
    (ctx.disabled || ctx.readonly ? ' disabled=""' : '') +
    attrs(limepieDataAttrs(spec, ctx.path)) +
    `>${optionsHtml}</select>`;
  return `<div class="input-group">${prependSpan(spec, false)}${sel}${appendSpan(spec, false)}${ctx.buttonsJsx ?? ''}</div>`;
};

// ---------------------------------------------------------------------------
// choice / multichoice
// ---------------------------------------------------------------------------

const choice: FieldHtml = (ctx) => {
  const { spec, t } = ctx;
  const name = bracket(ctx);
  const token = nextChoiceToken();

  const items = spec.items;
  let options: Array<{ value: string; label: string }> = [];
  if (items && typeof items === 'object' && !(!Array.isArray(items) && 'model' in items)) {
    options = itemEntries(items).map(([key, label]) => ({
      value: key,
      label: t(label as MultiLangText),
    }));
  }

  const defaultStr =
    spec.default !== undefined && spec.default !== null && !Array.isArray(spec.default)
      ? phpString(spec.default)
      : null;
  const effectiveValue = (() => {
    const v = phpString(ctx.value);
    return v.length === 0 ? (defaultStr ?? '') : v;
  })();

  const idPrefix = `choice-${cleanStr(name)}`;
  const containerClass =
    'btn-group btn-group-toggle' +
    (spec.readonly === true ? ' pe-none bg-secondary' : '') +
    (spec.button_class ? ` ${String(spec.button_class)}` : '');

  const dataName = leafName(ctx.path);
  const dataRuleName = ruleNameForPath(ctx.path);

  // readonly map (per-item pe-none) — matches ChoiceField.readonlyMap.
  const readonlyMap = new Set<string>();
  const ro = spec.readonly as unknown;
  if (ro && typeof ro === 'object' && !Array.isArray(ro)) {
    const arr = (ro as Record<string, string[]>)[effectiveValue];
    if (Array.isArray(arr)) for (const k of arr) readonlyMap.add(String(k));
  }
  if (Array.isArray(spec.disableds)) {
    for (const k of spec.disableds as unknown[]) readonlyMap.add(String(k));
  }

  // Inline onchange/onclick JS (spec-authored or generated by the legacy
  // display_switch transform). PHP Choice.php puts the minified JS on every
  // input; the whole group then renders as the raw inline-JS markup, exactly
  // like ChoiceField's dangerouslySetInnerHTML branch.
  const inlineOnchange =
    typeof spec.onchange === 'string' && spec.onchange ? minifyJs(spec.onchange) : null;
  const inlineOnclick =
    typeof spec.onclick === 'string' && spec.onclick ? minifyJs(spec.onclick) : null;
  const initChange = Boolean(spec['data-init-change']);

  let inner = '';
  options.forEach((option, index) => {
    const isChecked = effectiveValue === option.value;
    const isDefault = (defaultStr ?? '') === option.value && defaultStr !== null;
    const inputId = `${idPrefix}-${token}-${index + 1}`;
    const pe = readonlyMap.has(option.value) ? ' pe-none' : '';
    const inputClass = `valid-target btn-check${spec.input_class ? ` ${String(spec.input_class)}` : ''}`;
    const labelClass = `btn btn-switch${spec.element_class ? ` ${String(spec.element_class)}` : ''}${pe}`;
    inner +=
      `<input id="${escAttr(inputId)}" type="radio" name="${escAttr(name)}"` +
      ` value="${escAttr(option.value)}"` +
      (inlineOnchange ? ` onchange="${escAttr(inlineOnchange)}"` : '') +
      (inlineOnclick ? ` onclick="${escAttr(inlineOnclick)}"` : '') +
      (initChange ? ' data-init-change="true"' : '') +
      (isChecked ? ' checked=""' : '') +
      (ctx.disabled ? ' disabled=""' : '') +
      ` autocomplete="off" class="${escAttr(inputClass)}"` +
      ` data-name="${escAttr(dataName)}" data-rule-name="${escAttr(dataRuleName)}"` +
      ` data-is-default="${isDefault ? '1' : ''}"/>` +
      `<label for="${escAttr(inputId)}" class="${escAttr(labelClass)}">` +
      `<span>${escText(option.label)}</span></label>`;
  });

  return `<div class="${escAttr(containerClass)}" data-toggle="buttons">${inner}</div>`;
};

const multichoice: FieldHtml = (ctx) => {
  const { spec, t } = ctx;
  const bracketBase = bracket(ctx);
  const name = leafName(ctx.path).endsWith('[]') ? `${bracketBase}[]` : bracketBase;

  const items = spec.items;
  let options: Array<{ value: string; label: string }> = [];
  if (items && typeof items === 'object' && !(!Array.isArray(items) && 'model' in items)) {
    options = itemEntries(items).map(([key, label]) => ({
      value: key,
      label: t(label as MultiLangText),
    }));
  }

  let selectedValues: string[];
  if (Array.isArray(ctx.value)) selectedValues = (ctx.value as unknown[]).map(String);
  else if (ctx.value) selectedValues = [String(ctx.value)];
  else selectedValues = [];
  if (selectedValues.length === 0 && spec.default !== undefined && spec.default !== null) {
    selectedValues = Array.isArray(spec.default)
      ? (spec.default as unknown[]).map((d) => phpString(d))
      : [phpString(spec.default)];
  }

  const idPrefix = `mchoice-${cleanStr(name)}`;
  const dataName = leafName(ctx.path);
  const dataRuleName = ruleNameForPath(ctx.path);

  let inner = '';
  options.forEach((option, index) => {
    const isChecked = selectedValues.includes(option.value);
    const inputId = `${idPrefix}${index + 1}`;
    const labelClass = `btn btn-switch btn-mswitch${spec.element_class ? ` ${String(spec.element_class)}` : ''}`;
    inner +=
      `<input type="checkbox" id="${escAttr(inputId)}" name="${escAttr(name)}"` +
      ` value="${escAttr(option.value)}"` +
      (isChecked ? ' checked=""' : '') +
      (ctx.disabled ? ' disabled=""' : '') +
      ` autocomplete="off" class="valid-target btn-check"` +
      ` data-name="${escAttr(dataName)}" data-rule-name="${escAttr(dataRuleName)}"/>` +
      `<label for="${escAttr(inputId)}" class="${escAttr(labelClass)}">` +
      `<span>${escText(option.label)}</span></label>`;
  });

  return `<div class="btn-group flex-wrap btn-group-toggle">${inner}</div>`;
};

// ---------------------------------------------------------------------------
// date / datetime
// ---------------------------------------------------------------------------

function formatDateValue(value: string | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  try {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0] ?? '';
  } catch {
    /* invalid */
  }
  return value;
}

const date: FieldHtml = (ctx) => {
  const { spec } = ctx;
  const name = bracket(ctx);
  const rawValue = phpString(ctx.value) || phpString(spec.default);
  const formattedValue = formatDateValue(rawValue || undefined);
  const input =
    `<input type="date" name="${escAttr(name)}" value="${escAttr(formattedValue)}"` +
    ` class="valid-target form-control"` +
    (ctx.disabled ? ' disabled=""' : '') +
    (ctx.readonly ? ' readonly=""' : '') +
    attrs(limepieDataAttrs(spec, ctx.path)) +
    ' />';
  return `<div class="input-group">${prependSpan(spec, false)}${input}${appendSpan(spec, false)}</div>`;
};

function formatDatetimeValue(value: string | undefined): string {
  if (!value) return '';
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?/.exec(value);
  if (m) return m[1] + (m[2] ?? ':00');
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
        `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      );
    }
  } catch {
    /* invalid */
  }
  return value;
}

interface DatetimeEventSpec {
  type?: unknown;
  function?: unknown;
}

/** True when a datetime spec carries inline-JS attributes (raw-wrapper case). */
export function datetimeNeedsRawHtml(spec: SpecNode): boolean {
  const event = spec.event as DatetimeEventSpec | undefined;
  if (event && Array.isArray(event.type) && event.type.length > 0) return true;
  const onchange = spec.onchange;
  return typeof onchange === 'string' && onchange !== '';
}

function inlineJs(fn: string): string {
  return minifyJs(fn.split('"').join('\\"'));
}

/**
 * Verbatim port of Fields/Datetime.php inline-JS markup — rendered on the
 * .input-group-wrapper by FormField (the bare input has no own container).
 */
export function datetimeLegacyRawHtml(ctx: FieldRenderCtx): string {
  const { spec } = ctx;
  const name = bracket(ctx);
  const rawValue = phpString(ctx.value) || phpString(spec.default);
  const formattedValue = formatDatetimeValue(rawValue || undefined);

  let onchange = '';
  const event = spec.event as DatetimeEventSpec | undefined;
  if (event) {
    const fn = typeof event.function === 'string' ? event.function : '';
    const types = Array.isArray(event.type) ? event.type : [];
    for (const ev of types) {
      if (ev === 'onchange') onchange += ` onchange="${escAttr(inlineJs(fn))}"`;
      if (ev === 'onload') onchange += ` data-onload="${escAttr(inlineJs(fn))}"`;
    }
  }
  const specOnchange = spec.onchange;
  if (typeof specOnchange === 'string' && specOnchange !== '') {
    onchange += ` onchange="${escAttr(inlineJs(specOnchange))}"`;
  }
  const readonly = spec.readonly ? ' readonly="readonly"' : '';
  const style =
    typeof spec.style === 'string' && spec.style ? ` style="${escAttr(spec.style)}"` : '';
  return (
    `<input type="datetime-local" class="valid-target form-control"` +
    ` name="${escAttr(name)}" data-name="${escAttr(leafName(ctx.path))}"` +
    ` data-rule-name="${escAttr(ruleNameForPath(ctx.path))}"` +
    ` value="${escAttr(formattedValue)}" data-default="${escAttr(phpString(spec.default))}"` +
    `${readonly}${onchange}${style} />`
  );
}

const datetime: FieldHtml = (ctx) => {
  const { spec } = ctx;
  const name = bracket(ctx);
  const rawValue = phpString(ctx.value) || phpString(spec.default);
  const formattedValue = formatDatetimeValue(rawValue || undefined);
  const style = styleString(spec.style);
  // Bare input (no input-group wrapper).
  return (
    `<input type="datetime-local" name="${escAttr(name)}" value="${escAttr(formattedValue)}"` +
    ` class="valid-target form-control"` +
    (ctx.disabled ? ' disabled=""' : '') +
    (ctx.readonly ? ' readonly=""' : '') +
    (style ? ` style="${escAttr(style)}"` : '') +
    attrs(limepieDataAttrs(spec, ctx.path)) +
    ' />'
  );
};

// ---------------------------------------------------------------------------
// dummy
// ---------------------------------------------------------------------------

function nl2br(s: string): string {
  return s.replace(/(\r\n|\n\r|\r|\n)/g, '<br />$1');
}

const dummy: FieldHtml = (ctx) => {
  const { spec } = ctx;
  let v: unknown = ctx.value;
  if ((v === null || v === undefined) && phpTruthy(phpString(spec.default))) {
    v = spec.default;
  }
  const items = spec.items;
  if (items && typeof items === 'object' && !Array.isArray(items) && !('model' in items)) {
    const looked = (items as Record<string, unknown>)[phpString(v)];
    if (looked !== undefined) v = looked;
  }
  const textVal = phpString(v);
  const html = phpTruthy(textVal) ? nl2br(textVal) : textVal;
  const cls = spec.element_class ? String(spec.element_class) : '';
  const style = styleString(spec.element_style);
  return (
    `<div${cls ? ` class="${escAttr(cls)}"` : ' class=""'}` +
    (style ? ` style="${escAttr(style)}"` : '') +
    `>${html}</div>`
  );
};

// ---------------------------------------------------------------------------
// dummy-input — always-readonly display input (Fields/DummyInput.php)
// ---------------------------------------------------------------------------

const dummyInput: FieldHtml = (ctx) => {
  const { spec, t } = ctx;
  const name = bracket(ctx);
  const displayValue = applyDefaultString(ctx.value, spec.default);
  const elementStyle = `${(spec.element_style as string) ?? ''}${spec.readonly ? ' pointer-events: none;' : ''}`;
  const style = styleString(elementStyle);
  const input =
    `<input type="text" name="${escAttr(name)}" value="${escAttr(displayValue)}"` +
    ` readonly=""` +
    (ctx.disabled || spec.disabled === true ? ' disabled=""' : '') +
    ` class="form-control${spec.element_class ? ` ${String(spec.element_class)}` : ''}"` +
    (spec.placeholder ? ` placeholder="${escAttr(t(spec.placeholder as MultiLangText))}"` : '') +
    (style ? ` style="${escAttr(style)}"` : '') +
    ` data-default="${escAttr(phpString(spec.default))}"` +
    '/>';
  return `<div class="input-group">${prependSpan(spec, false)}${input}${appendSpan(spec, false)}</div>`;
};

// ---------------------------------------------------------------------------
// image (verbatim raw, empty branch)
// ---------------------------------------------------------------------------

const image: FieldHtml = (ctx) => {
  const { spec } = ctx;
  const name = bracket(ctx);
  const rules = (spec.rules ?? {}) as Record<string, unknown>;
  const accept = typeof rules.accept === 'string' ? rules.accept : 'image/*';
  const maxWidth = phpString(spec['max-width']) || '0';
  const minWidth = phpString(spec['min-width']) || '0';
  const maxHeight = phpString(spec['max-height']) || '0';
  const minHeight = phpString(spec['min-height']) || '0';
  const viewWidth = phpString(spec['preview-max-width']) || '0';
  const viewHeight = phpString(spec['preview-max-height']) || '0';

  let prependHtml = '';
  if (spec.prepend) {
    const prependClass = spec.prepend_class ? ` ${String(spec.prepend_class)}` : '';
    let prependText: string;
    if (spec.prepend !== null && typeof spec.prepend === 'object' && !Array.isArray(spec.prepend)) {
      prependText = phpString((spec.prepend as Record<string, unknown>)[ctx.language]);
    } else {
      prependText = phpString(spec.prepend);
    }
    prependHtml = `<span class="input-group-text${escAttr(prependClass)}">${prependText}</span>`;
  }

  const sizeAttrs =
    ` data-max-width="${escAttr(maxWidth)}" data-min-width="${escAttr(minWidth)}"` +
    ` data-max-height="${escAttr(maxHeight)}" data-min-height="${escAttr(minHeight)}"` +
    ` data-preview-max-width="${escAttr(viewWidth)}" data-preview-max-height="${escAttr(viewHeight)}"`;
  const validAttrs =
    ` data-name="${escAttr(leafName(ctx.path))}" data-rule-name="${escAttr(ruleNameForPath(ctx.path))}"`;

  const html =
    prependHtml +
    '<input type="text" class="form-control form-control-file" value="" readonly="readonly" />' +
    `<input type="file" class="valid-target form-control-file form-control-image"${sizeAttrs}` +
    ` name="${escAttr(name)}"${validAttrs} value="" accept="${escAttr(accept)}" />` +
    '<button class="btn btn-search btn-file-search" type="button">&nbsp;</button>' +
    (ctx.buttonsHtml ?? '');
  return `<div class="input-group">${html}</div>`;
};

// ---------------------------------------------------------------------------
// search (style/script siblings + raw select)
// ---------------------------------------------------------------------------

function itemText(v: unknown, language: string): string {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    const localized = (v as Record<string, unknown>)[language];
    if (typeof localized === 'string') return localized;
  }
  return phpString(v);
}

const search: FieldHtml = (ctx) => {
  const { spec } = ctx;
  const uniq = generateUniqid().slice(2, -2);
  const name = bracket(ctx);
  const id = `${cleanStr(name)}_${uniq}`;

  const keywordMinLength = spec.keyword_min_length ? String(spec.keyword_min_length) : '2';
  const hideSearching = spec.hide_searching !== undefined && !spec.hide_searching ? false : true;
  const delay = spec.delay ? String(spec.delay) : '250';
  const apiServer = typeof spec.api_server === 'string' && spec.api_server ? minifyJs(spec.api_server) : '';

  const effectiveValue = (() => {
    const v = phpString(ctx.value);
    return v.length === 0 ? phpString(spec.default) : v;
  })();

  let elementStyle = typeof spec.element_style === 'string' ? spec.element_style : '';
  if (spec.readonly) {
    elementStyle +=
      "-webkit-appearance: none; -moz-appearance: none; text-indent: 1px;text-overflow: ''; pointer-events: none;";
  }
  const styleAttr = elementStyle ? ` style="${escAttr(elementStyle)}"` : '';
  const elementClass = spec.element_class ? ` ${String(spec.element_class)}` : '';
  const globalDisabledAttr = spec.disabled ? 'disabled="disabled"' : '';
  const disables = Array.isArray(spec.disables) ? (spec.disables as unknown[]).map(String) : [];

  let prependHtml = '';
  if (spec.prepend) {
    const prependClass = spec.prepend_class ? ` ${String(spec.prepend_class)}` : '';
    const prependText = itemText(spec.prepend, ctx.language);
    prependHtml = `<span class="input-group-text ${prependClass}">${prependText}</span>`;
  }
  let appendHtml = '';
  if (spec.append) appendHtml = `<span class="input-group-text">${String(spec.append)}</span>`;

  let containerClass = '';
  if (!prependHtml) containerClass += ' input-group-first';
  if (!appendHtml && !spec.multiple) containerClass += ' input-group-last';

  let optionHtml = '';
  if (spec.items !== undefined && spec.items !== null) {
    for (const [itemKey, itemValue] of itemEntries(spec.items)) {
      let coverUrl = '';
      let txt: string;
      let prependText = '';
      let appendText = '';
      let optionClass = '';
      if (itemValue !== null && typeof itemValue === 'object' && 'id' in (itemValue as object)) {
        const o = itemValue as Record<string, unknown>;
        coverUrl = phpString(o.cover_url);
        txt = itemText(o.text, ctx.language);
        prependText = phpString(o.prepend_text);
        appendText = phpString(o.append_text);
        if (o.class) optionClass = ` ${String(o.class)}`;
      } else {
        txt = itemText(itemValue, ctx.language);
      }
      const optionDisabled = disables.includes(itemKey) ? 'disabled="disabled"' : globalDisabledAttr;
      const selected = effectiveValue === String(itemKey);
      optionHtml +=
        `<option data-prepend-text="${escAttr(prependText)}" data-append-text="${escAttr(appendText)}"` +
        ` data-cover-url="${escAttr(coverUrl)}" value="${escAttr(itemKey)}"` +
        (selected ? ' selected="selected"' : ' ') +
        `${optionDisabled} data-class="${escAttr(optionClass)}">${escText(txt)}</option>`;
    }
  } else {
    optionHtml = '<option value="">select</option>';
  }

  let onchangeAttr = '';
  if (typeof spec.onchange === 'string' && spec.onchange) {
    onchangeAttr = ` onchange="${escAttr(minifyJs(spec.onchange))}"`;
  } else if (spec.readonly) {
    onchangeAttr =
      " readonly onFocus='this.initialSelect = this.selectedIndex;'" +
      " onChange='this.selectedIndex = this.initialSelect;'";
  }

  const selectHtml =
    `<select class="valid-target form-control${escAttr(elementClass)}"${styleAttr}` +
    ` name="${escAttr(name)}" data-class="${escAttr(containerClass)}"` +
    ` data-keyword-min-length="${escAttr(keywordMinLength)}" data-delay="${escAttr(delay)}"` +
    ` data-api-server="${escAttr(apiServer)}" data-name="${escAttr(leafName(ctx.path))}"` +
    ` data-rule-name="${escAttr(ruleNameForPath(ctx.path))}" id="${escAttr(id)}"${onchangeAttr}` +
    ` data-default="${escAttr(phpString(spec.default))}">${optionHtml}</select>`;

  const callback =
    typeof spec.callback === 'string' && spec.callback
      ? `$('#${id}').on('select2:select', ${spec.callback});`
      : '';

  const styleTag = hideSearching
    ? `<style nonce="">.${id}_select2 .loading-results { display: none; }</style>`
    : '';
  const scriptTag = `<script nonce="">$(function() {select2('${id}', '${keywordMinLength}', '${delay}', '${containerClass}');${callback}});</script>`;
  const divTag = `<div class="input-group field-search">${prependHtml}${selectHtml}${appendHtml}</div>`;
  return styleTag + scriptTag + divTag;
};

// ---------------------------------------------------------------------------
// tinymce
// ---------------------------------------------------------------------------

const tinymce: FieldHtml = (ctx) => {
  const { spec } = ctx;
  const id = generateUniqid().slice(2, -2);
  const name = bracket(ctx);
  const rows = (spec.rows as number | undefined) ?? 3;
  const height = spec.height ?? 300;
  const upload = (spec.fileserver as string | undefined) ?? 'upload';
  const readonlyJs = spec.readonly !== undefined ? (spec.readonly ? 'true' : 'false') : 'false';
  const displayValue = applyDefaultString(ctx.value, spec.default);
  const editorId = `tinymce${id}`;

  const ta =
    `<textarea id="${escAttr(editorId)}" class="valid-target form-control tinymcearea"` +
    ` name="${escAttr(name)}" rows="${rows}"` +
    ` data-type="${escAttr(String(spec.type ?? 'tinymce'))}" data-height="${escAttr(String(height))}"` +
    ` data-upload-server="${escAttr(upload)}"` +
    attrs(limepieDataAttrs(spec, ctx.path)) +
    `>${escText(displayValue)}</textarea>`;
  const scriptTag = `<script nonce="">$(function() {editor_tinymce('#${editorId}', ${String(height)}, '${upload}', ${readonlyJs});});</script>`;
  return ta + scriptTag;
};

// ---------------------------------------------------------------------------
// button
// ---------------------------------------------------------------------------

const button: FieldHtml = (ctx) => {
  const { spec, t } = ctx;
  const name = bracket(ctx);
  const id = name.split('[').join('_').split(']').join('');
  const dataAttrs = limepieDataAttrs(spec, ctx.path);
  const ruleName = typeof spec.rule_name === 'string' ? spec.rule_name : dataAttrs['data-rule-name']!;
  const initScript = typeof spec.init_script === 'string' ? spec.init_script : '';
  const onclick = typeof spec.onclick === 'string' ? spec.onclick : '';
  const script =
    `\n$(function() {\n    ${initScript}\n    $("#btn${id}").on('click', function() {\n        ${onclick}\n    });\n});\n`;
  const displayValue = applyDefaultString(ctx.value, spec.default);
  const textVal = spec.text !== undefined ? t(spec.text as MultiLangText) : '';
  const isReadonly = phpString(spec.readonly) === '1' || spec.readonly === true;

  // The script is injected RAW (React dangerouslySetInnerHTML; legacy does not
  // minify or escape here) — the YAML source may already contain HTML entities
  // (e.g. &amp;&amp;, &gt;) that must survive verbatim.
  const scriptTag = `<script nonce="">${script}</script>`;
  const hidden =
    `<input type="hidden" class="valid-target form-control" readonly=""` +
    ` name="${escAttr(name)}" data-name="${escAttr(dataAttrs['data-name']!)}"` +
    ` data-rule-name="${escAttr(ruleName)}" value="${escAttr(displayValue)}"` +
    ` data-default="${escAttr(dataAttrs['data-default']!)}"/>`;
  const btn =
    `<input type="button" class="btn${spec.button_class ? ` ${String(spec.button_class)}` : ''}"` +
    ` name="btn${escAttr(name)}" id="btn${escAttr(id)}" value="${escAttr(textVal)}"` +
    (isReadonly ? ' readonly=""' : '') +
    '/>';
  return scriptTag + hidden + btn;
};

// ---------------------------------------------------------------------------
// switcher (mirrors SwitcherField, but routed through the checkbox wrapper in
// FormField — here we return the inner div>input+span markup)
// ---------------------------------------------------------------------------

/** Emits the inner markup for a switcher/toggle field (re-exported as `switcherHtml`). */
const switcher: FieldHtml = (ctx) => {
  const { spec, t } = ctx;
  const name = bracket(ctx);
  const onLabel = (spec.on_label as string) ?? t('on') ?? 'On';
  const dataAttrs = limepieDataAttrs(spec, ctx.path);
  const prepend = spec.prepend ? `<span>${spec.prepend}</span>` : '';
  const append = spec.append ? `<span>${spec.append}</span>` : '';
  const showLabel = spec.show_labels !== false ? `<span>${escText(onLabel)}</span>` : '';
  const input =
    `<input type="checkbox" name="${escAttr(name)}" value="1" class="valid-target"` +
    ` data-rule-name="${escAttr(dataAttrs['data-rule-name']!)}"` +
    ` data-name="${escAttr(dataAttrs['data-name']!)}" data-default="${escAttr(dataAttrs['data-default']!)}"/>`;
  return `<div>${prepend}${input} ${showLabel}${append}</div>`;
};

// ---------------------------------------------------------------------------
// checkbox (single boolean) — CheckboxField inner markup: div>input+span
// ---------------------------------------------------------------------------

/** Emits the inner markup for a single boolean checkbox field. */
export function checkboxInnerHtml(ctx: FieldRenderCtx): string {
  const { spec, t } = ctx;
  const title = spec.label ? t(spec.label as MultiLangText) : '';
  const fullBracketName = bracket(ctx);

  let checked: boolean;
  if (typeof ctx.value === 'boolean') {
    checked = ctx.value;
  } else {
    const v = phpString(ctx.value);
    const effective = v.length === 0 ? phpString(spec.default) : v;
    checked = phpTruthy(effective);
  }
  const style = styleString(spec.style);
  const input =
    `<input type="checkbox" name="${escAttr(fullBracketName)}" value="1"` +
    (checked ? ' checked=""' : '') +
    (ctx.disabled || ctx.readonly ? ' disabled=""' : '') +
    ` class="valid-target"` +
    ` data-name="${escAttr(leafName(ctx.path))}" data-rule-name="${escAttr(ruleNameForPath(ctx.path))}"` +
    (style ? ` style="${escAttr(style)}"` : '') +
    '/>';
  return `<div>${input} <span>${escText(title)}</span></div>`;
}

// ---------------------------------------------------------------------------
// helper: serialize a data-attr record
// ---------------------------------------------------------------------------

function attrs(rec: Record<string, string>): string {
  let out = '';
  for (const [k, v] of Object.entries(rec)) out += ` ${k}="${escAttr(v)}"`;
  return out;
}

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

const REGISTRY: Record<string, FieldHtml> = {
  text,
  string: text,
  email,
  password,
  number,
  integer: number,
  float: number,
  decimal: number,
  textarea,
  select,
  dropdown: select,
  choice,
  radio: choice,
  multichoice,
  checkboxes: multichoice,
  date,
  datetime,
  'datetime-local': datetime,
  dummy,
  html: dummy,
  static: dummy,
  'dummy-input': dummyInput,
  image,
  search,
  autocomplete: search,
  tinymce,
  wysiwyg: tinymce,
  button,
  action: button,
  switcher,
  switch: switcher,
  toggle: switcher,
};

/** Returns the field HTML emitter registered for a field `type`, or undefined. */
export function getFieldHtml(type: string): FieldHtml | undefined {
  return REGISTRY[type.toLowerCase()];
}

export { switcher as switcherHtml };
