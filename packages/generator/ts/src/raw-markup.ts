/**
 * The raw HTML of the control bytes that the framework adapters write into a real container
 * element: attribute serialization, the void, container and option elements, the prepend and
 * append affixes, the radio and checkbox choices and the search host (SPEC form markup). The
 * adapters share them because each framework's server renderer coerces empty and boolean
 * attributes, which the parity fixtures forbid, and none of them recomputes any value: every
 * class, data attribute, item and script is evaluated by the core.
 */

import type { ActionVM } from './list';
import type { UnsupportedVM } from './viewmodel';
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

/**
 * One action's raw `<a>` or `<button>` html. The opaque `behavior` event attributes are kept verbatim, so a framework
 * serializes the whole action chrome as one raw boundary: a `link` format action becomes an `<a>` (its `href` is the
 * un-interpolated template, since toolbar actions are row-agnostic), any other action a `<button>`.
 */
export function actionHtml(action: ActionVM): string {
  const behavior = Object.entries(action.behavior ?? {})
    .map(([attribute, script]) => ` ${escAttr(attribute)}="${escAttr(script)}"`)
    .join('');
  const label = escText(action.label);
  const cls = action.design?.main.class ? ` class="${escAttr(action.design.main.class)}"` : '';
  const style = action.design?.main.style ? ` style="${escAttr(action.design.main.style)}"` : '';
  if (action.format?.type === 'link') {
    const href = typeof action.format.options.href === 'string' ? action.format.options.href : '#';
    const target = typeof action.format.options.target === 'string' ? ` target="${escAttr(action.format.options.target)}"` : '';
    return `<a href="${escAttr(href)}"${target}${cls}${style}${behavior}>${label}</a>`;
  }
  return `<button type="button"${cls}${style}${behavior}>${label}</button>`;
}

/** A widget the core evaluated, or the marker of a field type the renderers do not support. */
export type AnyWidget = WidgetModel | UnsupportedVM;

/** True when the core marked a widget unsupported. */
export function isUnsupported(w: AnyWidget): w is UnsupportedVM {
  return 'unsupported' in w && w.unsupported;
}

/**
 * The raw html of a widget that the node body injects whole, or null when the framework renders it as a real container:
 * bare controls (`bare` serializes one, null keeps a stable real element), host-script widgets (an editor or tagify and
 * its script), buttons, choices and search carry empty, boolean or opaque on-event attributes that a server renderer
 * would mangle.
 */
export function widgetRootHtml(w: AnyWidget, bare: (widget: WidgetModel) => string | null = rawControl): string | null {
  if (isUnsupported(w)) return null;
  if (w.layout === 'bare') return bare(w);
  if (w.layout === 'host-script') return rawControl(w) + `<script nonce="">${w.script ?? ''}</script>`;
  if (w.layout === 'button') return rawElement('button', w.attrs, escText(w.text ?? ''));
  if (w.layout === 'choices') return choicesHtml(w);
  if (w.layout === 'search') return searchHtml(w);
  return null;
}
