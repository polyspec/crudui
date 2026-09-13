/**
 * CRUDUI React widget components — true JSX, one per layout family.
 *
 * Each component receives the core's evaluated `WidgetModel` (markup-free) and
 * returns a real React element tree: `<input>` / `<select><option>` / `<textarea>`
 * / `<div className="crudui-widget">`. It RECOMPUTES NOTHING — every class string,
 * data-* value, item list, and script is already evaluated by the core. React
 * performs all attribute/text escaping (no util.escAttr/escText here).
 *
 * Sanctioned non-JSX passthrough (per parity strategy), and ONLY these:
 *  - RAW display html (dummy/image-viewer body) — unescaped legacy parity content,
 *  - script/style chrome (search/editors/button) — verbatim JS/CSS text,
 *  - the `&nbsp;` caption on the file-search button (a literal entity),
 *  - a control's OPAQUE `on*` behavior attributes (React structurally drops
 *    string event attrs) and the select2 host `selected="selected"` — both are
 *    opaque verbatim chrome, serialized via the immediate container's
 *    dangerouslySetInnerHTML (the container stays a real JSX element).
 * Every other node is a JSX element; there is no completed-HTML echo.
 */

import * as React from 'react';
import type { WidgetModel, OptionModel, Affix, Attrs } from '@crudui/generator-core';
import type { UnsupportedVM } from '@crudui/generator-core';
import { inputProps, plainProps } from './attrs';
import {
  hasEventAttr,
  rawVoid,
  rawElement,
  rawOptions,
  escAttr,
  escText,
} from './raw';

/** Widget model accepted by the renderer, including unsupported markers. */
export type AnyWidget = WidgetModel | UnsupportedVM;

function isUnsupported(w: AnyWidget): w is UnsupportedVM {
  return (w as UnsupportedVM).unsupported === true;
}

/** Prepend/append affix span (real JSX). */
function AffixSpan({ affix }: { affix: Affix }): React.ReactElement {
  return (
    <span
      {...plainProps({
        ...(affix.class ? { class: affix.class } : {}),
        ...(affix.style ? { style: affix.style } : {}),
      })}
    >
      {affix.text}
    </span>
  );
}

/** Raw affix span html (for raw-path containers). */
function affixHtml(affix?: Affix): string {
  if (!affix) return '';
  const cls = affix.class ? ` class="${escAttr(affix.class)}"` : '';
  const style = affix.style ? ` style="${escAttr(affix.style)}"` : '';
  return `<span${cls}${style}>${escText(affix.text)}</span>`;
}

/** A real <select> driven by defaultValue; selected only when an option is. */
function SelectControl({ w }: { w: WidgetModel }): React.ReactElement {
  const selected = (w.options ?? []).filter((o) => o.selected).map(o => o.value);
  const multiple = Object.prototype.hasOwnProperty.call(w.attrs, 'multiple');
  const props = plainProps(w.attrs);
  return (
    <select {...props} {...(multiple ? { multiple: true, defaultValue: selected } : selected.length ? { defaultValue: selected[0] } : {})}>
      {(w.options ?? []).map((o, i) => (
        <option key={i} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Raw serialization of a control (input/textarea/select) carrying on* attrs. */
function rawControl(w: WidgetModel): string {
  if (w.tag === 'select') {
    return rawElement('select', w.attrs, rawOptions(w.options ?? [], 'empty'));
  }
  if (w.tag === 'textarea') {
    return rawElement('textarea', w.attrs, escText(w.text ?? ''));
  }
  return rawVoid('input', w.attrs);
}

/** widget layout: prepend? + control + append? inside .crudui-widget. */
function WidgetGroup({ w }: { w: WidgetModel }): React.ReactElement {
  // Opaque on* attrs → serialize the whole widget body raw (container JSX).
  if (hasEventAttr(w.attrs)) {
    const html = affixHtml(w.prepend) + rawControl(w) + affixHtml(w.append);
    return <div className="crudui-widget" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  let control: React.ReactElement;
  if (w.tag === 'select') {
    control = <SelectControl w={w} />;
  } else if (w.tag === 'textarea') {
    control = <textarea {...inputProps(w.attrs)} defaultValue={w.text ?? ''} />;
  } else {
    control = <input {...inputProps(w.attrs)} />;
  }
  return (
    <div className="crudui-widget">
      {w.prepend ? <AffixSpan affix={w.prepend} /> : null}
      {control}
      {w.append ? <AffixSpan affix={w.append} /> : null}
    </div>
  );
}

/** bare layout: control alone (password/hidden/datetime). */
function Bare({ w }: { w: WidgetModel }): React.ReactElement {
  // A bare control with opaque on* attrs is serialized at its CONTAINER root
  // (widgetRootRaw) so no wrapper element is introduced; see Field's slot render.
  return <input {...inputProps(w.attrs)} />;
}

/**
 * When a widget must be serialized raw AT its container root (no wrapper element
 * is allowed), return the raw html; else null and the widget renders as JSX.
 * Only the bare layout with opaque on* attrs needs this (datetime + behavior):
 * the control is a direct child of the node body, so an extra wrapper
 * would break parity. Every other on*-bearing layout has a real container
 * (`.crudui-widget` / `.crudui-choices`) that absorbs the raw body.
 */
export function widgetRootRaw(w: AnyWidget): string | null {
  if (isUnsupported(w)) return null;
  if (w.layout === 'bare' && hasEventAttr(w.attrs)) return rawControl(w);
  if (w.layout === 'host-script' && hasEventAttr(w.attrs)) {
    // control + trailing <script> chrome, both opaque verbatim.
    return rawControl(w) + `<script nonce="">${w.script ?? ''}</script>`;
  }
  return null;
}

/** host-script layout: control + trailing <script> chrome (editors/tagify). */
function HostScript({ w }: { w: WidgetModel }): React.ReactElement {
  // on*-bearing host-script controls are root-raw (handled by widgetRootRaw).
  const control =
    w.tag === 'textarea' ? (
      <textarea {...inputProps(w.attrs)} defaultValue={w.text ?? ''} />
    ) : (
      <input {...inputProps(w.attrs)} />
    );
  return (
    <>
      {control}
      <script nonce="" dangerouslySetInnerHTML={{ __html: w.script ?? '' }} />
    </>
  );
}

/** Raw serialization of a single choice (input + label). */
function groupButtonHtml(
  o: OptionModel,
  type: 'radio' | 'checkbox',
  shared: Attrs,
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
  const checked = o.selected ? ' checked=""' : '';
  // Insert checked manually (serializeAttrs has no boolean form).
  const input = `<input${serializeBtn(attrs)}${checked}>`;
  const forAttr = o.id ? ` for="${escAttr(o.id)}"` : '';
  return (
    input +
    `<label${forAttr} class="${escAttr(labelClass)}"><span>${escText(o.label)}</span></label>`
  );
}

function serializeBtn(attrs: Attrs): string {
  let out = '';
  for (const [k, v] of Object.entries(attrs)) out += ` ${k}="${escAttr(v)}"`;
  return out;
}

/** A single radio/checkbox button as JSX (no behavior). */
function GroupButton({
  o,
  type,
  shared,
  labelClass,
}: {
  o: OptionModel;
  type: 'radio' | 'checkbox';
  shared: Attrs;
  labelClass: string;
}): React.ReactElement {
  const attrs: Record<string, unknown> = {
    ...shared,
    type,
    value: o.value,
    autoComplete: 'off',
    className: 'valid-target crudui-choices__input',
    ...(o.id ? { id: o.id } : {}),
  };
  if (type === 'radio') attrs['data-is-default'] = o.isDefault ? '1' : '';
  return (
    <>
      <input {...attrs} {...(o.selected ? { defaultChecked: true } : {})} />
      <label htmlFor={o.id} className={labelClass}>
        <span>{o.label}</span>
      </label>
    </>
  );
}

/** choices layout: choice (radios) / multichoice (checkboxes). */
function Choices({ w }: { w: WidgetModel }): React.ReactElement {
  const type: 'radio' | 'checkbox' = w.kind === 'choice' ? 'radio' : 'checkbox';
  const shared = (w.extra?.input ?? {}) as Attrs;
  const props = plainProps(w.attrs);
  const labelClass = w.itemLabelClass ?? '';
  // Opaque on* attrs live on the per-item inputs → serialize the group body raw.
  if (hasEventAttr(shared)) {
    const html = (w.options ?? [])
      .map((o) => groupButtonHtml(o, type, shared, labelClass))
      .join('');
    return <div {...props} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return (
    <div {...props}>
      {(w.options ?? []).map((o, i) => (
        <GroupButton key={i} o={o} type={type} shared={shared} labelClass={labelClass} />
      ))}
    </div>
  );
}

/** file layout: image/file (display+file+button) or cover (single file). */
function FileGroup({ w }: { w: WidgetModel }): React.ReactElement {
  const display = w.extra?.display;
  const fileAttrs = w.extra?.file ?? {};
  const fileEl = hasEventAttr(fileAttrs) ? null : <input {...inputProps(fileAttrs)} />;
  if (!fileEl) {
    // file input carries opaque on* attrs → serialize the widget body raw.
    const html =
      affixHtml(w.prepend) +
      (display
        ? `<input class="${escAttr(display.class ?? '')}" readonly="" type="text" value="">`
        : '') +
      rawVoid('input', fileAttrs) +
      (display ? `<button class="crudui-widget__button" type="button">&nbsp;</button>` : '');
    return <div className="crudui-widget" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return (
    <div className="crudui-widget">
      {w.prepend ? <AffixSpan affix={w.prepend} /> : null}
      {display ? <input {...inputProps(display)} /> : null}
      {fileEl}
      {display ? (
        <button
          className="crudui-widget__button"
          type="button"
          dangerouslySetInnerHTML={{ __html: '&nbsp;' }}
        />
      ) : null}
    </div>
  );
}

/** display layout: dummy/dummy-input/image-viewer. */
function Display({ w }: { w: WidgetModel }): React.ReactElement {
  if (w.kind === 'dummy-input') {
    // dummy-input is a widget control, not a RAW div.
    return <WidgetGroup w={w} />;
  }
  // RAW html display (dummy/image-viewer) — unescaped legacy parity content.
  const props = plainProps(w.attrs);
  return <div {...props} dangerouslySetInnerHTML={{ __html: w.rawHtml ?? '' }} />;
}

/** search layout: style?/script chrome + select2 host select inside .crudui-widget--search. */
function Search({ w }: { w: WidgetModel }): React.ReactElement {
  // The select2 host <select> needs `selected="selected"` (legacy select2 contract),
  // which React cannot emit via defaultValue. The select is part of the select2
  // host chrome → its options render through the sanctioned chrome passthrough,
  // but the `.crudui-widget--search` div itself is a real JSX element.
  const innerHtml =
    affixHtml(w.prepend) +
    rawElement('select', w.attrs, rawOptions(w.options ?? [], 'selected')) +
    affixHtml(w.append);
  return (
    <>
      {w.styleChrome ? (
        <style nonce="" dangerouslySetInnerHTML={{ __html: w.styleChrome }} />
      ) : null}
      <script nonce="" dangerouslySetInnerHTML={{ __html: w.script ?? '' }} />
      <div className="crudui-widget crudui-widget--search" dangerouslySetInnerHTML={{ __html: innerHtml }} />
    </>
  );
}

/** button layout: script chrome + hidden field + button. */
function ActionButton({ w }: { w: WidgetModel }): React.ReactElement {
  const hidden = w.extra?.hidden ?? {};
  return (
    <>
      <script nonce="" dangerouslySetInnerHTML={{ __html: w.script ?? '' }} />
      <input {...inputProps(hidden)} />
      <input {...inputProps(w.attrs)} />
    </>
  );
}

/** Render one widget model (or surfaced unsupported marker) as JSX. */
export function Widget({ w }: { w: AnyWidget }): React.ReactElement | null {
  if (isUnsupported(w)) {
    return <div className="crudui-widget crudui-widget--unsupported" data-unsupported-type={w.type} />;
  }
  switch (w.layout) {
    case 'widget':
      return <WidgetGroup w={w} />;
    case 'bare':
      return <Bare w={w} />;
    case 'host-script':
      return <HostScript w={w} />;
    case 'choices':
      return <Choices w={w} />;
    case 'file':
      return <FileGroup w={w} />;
    case 'display':
      return <Display w={w} />;
    case 'search':
      return <Search w={w} />;
    case 'button':
      return <ActionButton w={w} />;
    default:
      return null;
  }
}
