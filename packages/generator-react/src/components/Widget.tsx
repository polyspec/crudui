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
 *  - RAW display html (dummy/image-viewer body) — unescaped content,
 *  - script/style chrome (search/editors) — verbatim JS/CSS text (RawText),
 *  - the `&nbsp;` caption on the file-search button (a literal entity),
 *  - a control's OPAQUE `on*` behavior attributes (React structurally drops
 *    string event attrs) and the select2 host `selected="selected"` — both are
 *    opaque verbatim chrome, serialized into the immediate container by
 *    `RawContainer` (the container stays a real JSX element).
 * Every other node is a JSX element; there is no completed-HTML echo.
 */

import * as React from 'react';
import type { WidgetModel, OptionModel, Affix, Attrs } from '@crudui/generator-core';
import { optionSections } from '@crudui/generator-core/internal';
import type { UnsupportedVM } from '@crudui/generator-core';
import { inputProps, plainProps } from './attrs';
import {
  hasEventAttr,
  rawVoid,
  rawElement,
  rawOptions,
  RawContainer,
  RawText,
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
      {optionSections(w.options ?? []).map((section, i) => section.group ? (
        <optgroup key={i} label={section.group.label}>
          {section.options.map((o, j) => <option key={j} value={o.value}>{o.label}</option>)}
        </optgroup>
      ) : section.options.map((o, j) => <option key={`${i}:${j}`} value={o.value}>{o.label}</option>))}
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
    return <RawContainer className="crudui-widget" html={html} />;
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

/** The output of a range widget: the value the form was rendered with. */
function outputHtml(w: WidgetModel): string {
  const forAttr = w.attrs.id !== undefined ? ` for="${escAttr(w.attrs.id)}"` : '';
  return `<output class="crudui-widget__output"${forAttr}>${escText(w.text ?? '')}</output>`;
}

/** range layout: prepend? + range input + output + append? inside .crudui-widget--range. */
function Range({ w }: { w: WidgetModel }): React.ReactElement {
  if (hasEventAttr(w.attrs)) {
    const html = affixHtml(w.prepend) + rawVoid('input', w.attrs) + outputHtml(w) + affixHtml(w.append);
    return <RawContainer className="crudui-widget crudui-widget--range" html={html} />;
  }
  return (
    <div className="crudui-widget crudui-widget--range">
      {w.prepend ? <AffixSpan affix={w.prepend} /> : null}
      <input {...inputProps(w.attrs)} />
      <output className="crudui-widget__output" htmlFor={w.attrs.id}>{w.text ?? ''}</output>
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
 * The bare, button and host-script layouts with opaque on* attrs need this: the
 * control is a direct child of the node body, so an extra wrapper
 * would break parity. Every other on*-bearing layout has a real container
 * (`.crudui-widget` / `.crudui-choices`) that absorbs the raw body.
 */
export function widgetRootRaw(w: AnyWidget): string | null {
  if (isUnsupported(w)) return null;
  if (w.layout === 'bare' && hasEventAttr(w.attrs)) return rawControl(w);
  if (w.layout === 'button' && hasEventAttr(w.attrs)) return rawElement('button', w.attrs, escText(w.text ?? ''));
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
      <RawText tag="script" nonce="" text={w.script ?? ''} />
    </>
  );
}

/** Raw serialization of a single choice (input + label). */
function groupButtonHtml(
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
  const checked = o.selected ? ' checked=""' : '';
  // Insert checked manually (serializeAttrs has no boolean form).
  const input = `<input${serializeBtn(attrs)}${checked}${serializeBtn(declared)}>`;
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
  declared,
  labelClass,
}: {
  o: OptionModel;
  type: 'radio' | 'checkbox';
  shared: Attrs;
  declared: Attrs;
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
      <input {...attrs} {...(o.selected ? { defaultChecked: true } : {})} {...declared} />
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
  const declared = (w.extra?.option ?? {}) as Attrs;
  const props = plainProps(w.attrs);
  const labelClass = w.itemLabelClass ?? '';
  // Opaque on* attrs live on the per-item inputs → serialize the group body raw.
  if (hasEventAttr(shared)) {
    const html = (w.options ?? [])
      .map((o) => groupButtonHtml(o, type, shared, declared, labelClass))
      .join('');
    return <RawContainer {...props} html={html} />;
  }
  return (
    <div {...props}>
      {(w.options ?? []).map((o, i) => (
        <GroupButton key={i} o={o} type={type} shared={shared} declared={declared} labelClass={labelClass} />
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
    return <RawContainer className="crudui-widget" html={html} />;
  }
  return (
    <div className="crudui-widget">
      {w.prepend ? <AffixSpan affix={w.prepend} /> : null}
      {display ? <input {...inputProps(display)} /> : null}
      {fileEl}
      {display ? (
        <RawContainer tag="button" className="crudui-widget__button" type="button" html={'&nbsp;'} />
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
  // RAW html display (dummy/image-viewer) — unescaped content.
  const props = plainProps(w.attrs);
  return <RawContainer {...props} html={w.rawHtml ?? ''} />;
}

/** search layout: style?/script chrome + select2 host select inside .crudui-widget--search. */
function Search({ w }: { w: WidgetModel }): React.ReactElement {
  // The select2 host <select> needs `selected="selected"` (select2 contract),
  // which React cannot emit via defaultValue. The select is part of the select2
  // host chrome → its options render through the sanctioned chrome passthrough,
  // but the `.crudui-widget--search` div itself is a real JSX element.
  const innerHtml =
    affixHtml(w.prepend) +
    rawElement('select', w.attrs, rawOptions(w.options ?? [], 'selected')) +
    affixHtml(w.append);
  return (
    <>
      {w.styleChrome ? <RawText tag="style" nonce="" text={w.styleChrome} /> : null}
      <RawText tag="script" nonce="" text={w.script ?? ''} />
      <RawContainer className="crudui-widget crudui-widget--search" html={innerHtml} />
    </>
  );
}

/** button layout: a button element with its content (on*-bearing buttons are root-raw). */
function ActionButton({ w }: { w: WidgetModel }): React.ReactElement {
  return <button {...plainProps(w.attrs)}>{w.text ?? ''}</button>;
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
    case 'range':
      return <Range w={w} />;
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
