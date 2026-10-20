/**
 * The raw HTML of the control bytes that the framework adapters write into a real container
 * element: attribute serialization, the void, container and option elements, the prepend and
 * append affixes, the radio and checkbox choices and the search host (SPEC form markup). The
 * adapters share them because each framework's server renderer coerces empty and boolean
 * attributes, which the parity fixtures forbid, and none of them recomputes any value: every
 * class, data attribute, item and script is evaluated by the core.
 */

import type { Affix, Attrs, OptionModel, WidgetModel } from './widget';
import { optionSections } from './widget';
import { escAttr, escText } from './util';

/** True when an attr bag carries any opaque on-event attribute. */
export function hasEventAttr(attrs: Attrs): boolean {
  return Object.keys(attrs).some((k) => /^on[a-z]/.test(k));
}

/** Serialize an attribute map to ` k="v"` pairs; normalization compares order. */
export function serializeAttrs(attrs: Attrs): string {
  let out = '';
  for (const [k, v] of Object.entries(attrs)) {
    out += ` ${k}="${escAttr(v)}"`;
  }
  return out;
}

/** Serialize one void control (input). */
export function rawVoid(tag: string, attrs: Attrs): string {
  return `<${tag}${serializeAttrs(attrs)}>`;
}

/** Serialize one container control (textarea/select) with raw inner html. */
export function rawElement(tag: string, attrs: Attrs, innerHtml: string): string {
  return `<${tag}${serializeAttrs(attrs)}>${innerHtml}</${tag}>`;
}

/** Serialize <option> markup, the options of each group inside an <optgroup> (search/select via raw path). */
export function rawOptions(options: OptionModel[], selectedAttr: 'empty' | 'selected'): string {
  const option = (o: OptionModel) => {
    const sel = o.selected ? (selectedAttr === 'selected' ? ' selected="selected"' : ' selected=""') : '';
    return `<option value="${escAttr(o.value)}"${sel}>${escText(o.label)}</option>`;
  };
  return optionSections(options)
    .map((section) => section.group
      ? `<optgroup label="${escAttr(section.group.label)}">${section.options.map(option).join('')}</optgroup>`
      : section.options.map(option).join(''))
    .join('');
}

/** Raw prepend/append affix span html. */
export function affixHtml(affix?: Affix): string {
  if (!affix) return '';
  const cls = affix.class ? ` class="${escAttr(affix.class)}"` : '';
  const style = affix.style ? ` style="${escAttr(affix.style)}"` : '';
  return `<span${cls}${style}>${escText(affix.text)}</span>`;
}

/** Raw serialization of one main control (input/select/textarea). */
export function rawControl(w: WidgetModel, selectedAttr: 'empty' | 'selected' = 'empty'): string {
  if (w.tag === 'select') {
    return rawElement('select', w.attrs, rawOptions(w.options ?? [], selectedAttr));
  }
  if (w.tag === 'textarea') {
    return rawElement('textarea', w.attrs, escText(w.text ?? ''));
  }
  return rawVoid('input', w.attrs);
}

/** The label class of a choice: the label classes, then the class the choice declares, as single-spaced tokens. */
export function choiceLabelClass(labelClass: string, o: OptionModel): string {
  return [labelClass, o.className ?? ''].join(' ').split(/\s+/).filter(Boolean).join(' ');
}

/** Raw serialization of one choice (input + label). */
export function groupButtonHtml(
  o: OptionModel,
  type: 'radio' | 'checkbox',
  shared: Attrs,
  declared: Attrs,
  labelClass: string
): string {
  const attrs: Attrs = {
    ...shared,
    type,
    value: o.value,
    autocomplete: 'off',
    class: 'valid-target crudui-choices__input',
    ...(o.id ? { id: o.id } : {}),
  };
  if (type === 'radio') attrs['data-is-default'] = o.isDefault ? '1' : '';
  // `checked` is written by hand: serializeAttrs has no boolean form.
  const checked = o.selected ? ' checked=""' : '';
  const input = `<input${serializeAttrs(attrs)}${checked}${serializeAttrs({ ...declared, ...o.attributes })}>`;
  const forAttr = o.id ? ` for="${escAttr(o.id)}"` : '';
  return (
    input +
    `<label${forAttr} class="${escAttr(choiceLabelClass(labelClass, o))}"${o.style ? ` style="${escAttr(o.style)}"` : ''}><span>${escText(o.label)}</span></label>`
  );
}

/** choices full html: `<div {attrs}>` + per-item input/label pairs. */
export function choicesHtml(w: WidgetModel): string {
  const type: 'radio' | 'checkbox' = w.kind === 'choice' ? 'radio' : 'checkbox';
  const shared: Attrs = w.extra?.input ?? {};
  const declared: Attrs = w.extra?.option ?? {};
  const labelClass = w.itemLabelClass ?? '';
  const body = (w.options ?? [])
    .map((o) => groupButtonHtml(o, type, shared, declared, labelClass))
    .join('');
  return `<div${serializeAttrs(w.attrs)}>${body}</div>`;
}

/**
 * search full html: style?/script chrome (`nonce=""`, verbatim) + the select2
 * host `<select>` inside `.crudui-widget--search`. The host select needs
 * `selected="selected"` (select2 contract), so the whole search body is raw.
 */
export function searchHtml(w: WidgetModel): string {
  const fieldSearch =
    `<div class="crudui-widget crudui-widget--search">` +
    affixHtml(w.prepend) +
    rawElement('select', w.attrs, rawOptions(w.options ?? [], 'selected')) +
    affixHtml(w.append) +
    `</div>`;
  const style = w.styleChrome ? `<style nonce="">${w.styleChrome}</style>` : '';
  const script = `<script nonce="">${w.script ?? ''}</script>`;
  return style + script + fieldSearch;
}
