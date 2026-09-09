/**
 * CRUDUI React field dispatcher — the envelope, as a real JSX tree.
 *
 * Consumes one core `FieldViewModel` and renders the form containers:
 * `.form-element-wrapper` (show=false → style display:none, DOM kept) > `<h6>`
 * label (omitted for hidden) + `.description` + `.form-element` >
 * `.input-group-wrapper[data-uniqid]` > widget. It dispatches the four field
 * shapes (leaf / group / multiple-leaf|group / lang) plus the checkbox/switcher
 * special envelope. Every node is a JSX element — no string concatenation, no
 * dangerouslySetInnerHTML at the envelope level (only the leaf widgets use the
 * sanctioned RAW/script passthrough).
 *
 * Appearance/visibility come pre-evaluated from the core's ResolvedDesign; this
 * component only maps evaluated strings to className/style. eval is never called.
 */

import * as React from 'react';
import type { FieldViewModel, RowVM, WidgetModel, UnsupportedVM } from '@crudui/generator-core';
import { Widget, widgetRootRaw } from './Widget';
import { resolvedStyleProps, styleObject } from './attrs';
import { RowButtons, rowButtonsHtml } from './RowButtons';
import { escText, rawElement } from './raw';

type AnyWidget = WidgetModel | UnsupportedVM;

/** form-element-wrapper open: class+style from design.wrapper + show. */
function wrapperStyleObj(vm: FieldViewModel): React.CSSProperties | undefined {
  const hidden = vm.design.show ? '' : 'display: none';
  const extra = vm.design.wrapper.style?.trim() ?? '';
  const merged = [hidden, extra].filter((s) => s).join('; ');
  return styleObject(merged);
}

function wrapperClass(vm: FieldViewModel): string {
  return ['form-element-wrapper', vm.design.wrapper.class]
    .filter((s) => s && s.trim())
    .join(' ')
    .trim();
}

/** Shared props for the .form-element-wrapper open element. */
function wrapperProps(vm: FieldViewModel): Record<string, unknown> {
  const style = wrapperStyleObj(vm);
  return {
    className: wrapperClass(vm),
    'data-field-path': vm.path,
    ...resolvedStyleProps(style),
  };
}

function Label({ vm }: { vm: FieldViewModel }): React.ReactElement | null {
  if (!vm.label || vm.omitLabel) return null;
  const cls = vm.design.label.class;
  const style = styleObject(vm.design.label.style);
  return (
    <h6 {...(cls ? { className: cls } : {})} {...resolvedStyleProps(style)}>
      {vm.widget && !('unsupported' in vm.widget) && (vm.widget.attrs.id || vm.widget.extra?.file?.id)
        ? <label htmlFor={vm.widget.extra?.file?.id ?? vm.widget.attrs.id}>{vm.label}</label>
        : vm.label}
    </h6>
  );
}

function Description({ vm }: { vm: FieldViewModel }): React.ReactElement | null {
  if (!vm.description) return null;
  return <p className="description">{vm.description}</p>;
}

/** input-group-wrapper for a single field (leaf/group/lang). */
function inputGroupWrapperClass(vm: FieldViewModel): string {
  return ['input-group-wrapper', vm.design.wrapper.class]
    .filter((s) => s && s.trim())
    .join(' ')
    .trim();
}

function CheckboxEnvelope({ vm }: { vm: FieldViewModel }): React.ReactElement {
  return (
    <div {...wrapperProps(vm)}>
      <div className="checkbox">
        <h6>
          <div className={inputGroupWrapperClass(vm)} data-uniqid={vm.uniqid}>
            <div>
              <input
                className={vm.checkboxClass}
                id={vm.checkboxId}
                name={vm.checkboxName}
                type="checkbox"
                value="1"
                defaultChecked={vm.checkboxChecked}
              />
              <label htmlFor={vm.checkboxId}>{vm.label}</label>
            </div>
          </div>
        </h6>
        <Description vm={vm} />
      </div>
    </div>
  );
}

/**
 * Render single, repeated and language widgets in their existing container.
 * Declared control behavior uses the same raw serialization in every field shape.
 */
function WidgetContainer({
  w,
  className,
  uniqid,
  language,
  buttons,
}: {
  w: AnyWidget | undefined;
  className: string;
  uniqid?: string;
  language?: string;
  buttons?: FieldViewModel['multiple'];
}): React.ReactElement {
  const attrs = { className, ...(uniqid === undefined ? {} : { 'data-uniqid': uniqid }), ...(language === undefined ? {} : { 'data-lang': language }) };
  if (w) {
    const raw = widgetRootRaw(w);
    if (raw !== null) {
      const label = language === undefined ? '' : rawElement('span', { class: 'input-group-text lang-code' }, escText(language));
      return <div {...attrs} dangerouslySetInnerHTML={{ __html: label + raw + rowButtonsHtml(buttons) }} />;
    }
  }
  return (
    <div {...attrs}>
      {language === undefined ? null : <span className="input-group-text lang-code">{language}</span>}
      {w ? <Widget w={w} /> : null}
      <RowButtons settings={buttons} />
    </div>
  );
}

function LeafField({ vm }: { vm: FieldViewModel }): React.ReactElement {
  if (vm.checkbox) return <CheckboxEnvelope vm={vm} />;
  return (
    <div {...wrapperProps(vm)}>
      <Label vm={vm} />
      <Description vm={vm} />
      <div className="form-element">
        <WidgetContainer w={vm.widget} className={inputGroupWrapperClass(vm)} uniqid={vm.uniqid} />
      </div>
    </div>
  );
}

function GroupField({ vm }: { vm: FieldViewModel }): React.ReactElement {
  return (
    <div {...wrapperProps(vm)}>
      <Label vm={vm} />
      <Description vm={vm} />
      <div className="form-element">
        <div className={inputGroupWrapperClass(vm)} data-uniqid={vm.uniqid}>
          <div
            className={vm.groupClass}
            {...resolvedStyleProps(styleObject(vm.groupStyle))}
          >
            {(vm.children ?? []).map((c) => (
              <Field key={c.path} vm={c} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MultipleLeafRow({ row, vm }: { row: RowVM; vm: FieldViewModel }): React.ReactElement {
  return <WidgetContainer w={row.widget} className={row.wrapperClass} uniqid={row.uniqid} buttons={vm.multiple} />;
}

function MultipleLeafField({ vm }: { vm: FieldViewModel }): React.ReactElement {
  return (
    <div {...wrapperProps(vm)}>
      <Label vm={vm} />
      <Description vm={vm} />
      <div className="form-element">
        {(vm.rows ?? []).map((row) => (
          <MultipleLeafRow key={row.uniqid} row={row} vm={vm} />
        ))}
        {vm.rows?.length === 0 ? <button type="button" className="btn btn-plus" aria-label="+"> </button> : null}
      </div>
    </div>
  );
}

function MultipleGroupRow({ row, vm }: { row: RowVM; vm: FieldViewModel }): React.ReactElement {
  return (
    <div className={row.wrapperClass} data-uniqid={row.uniqid}>
      <div className={row.groupClass}>
        {(row.children ?? []).map((c) => (
          <Field key={c.path} vm={c} />
        ))}
      </div>
      <span className="btn-group input-group-btn">
        <RowButtons settings={vm.multiple} />
      </span>
    </div>
  );
}

function MultipleGroupField({ vm }: { vm: FieldViewModel }): React.ReactElement {
  return (
    <div {...wrapperProps(vm)}>
      <Label vm={vm} />
      <Description vm={vm} />
      <div className="form-element">
        {(vm.rows ?? []).map((row) => (
          <MultipleGroupRow key={row.uniqid} row={row} vm={vm} />
        ))}
        {vm.rows?.length === 0 ? <button type="button" className="btn btn-plus" aria-label="+"> </button> : null}
      </div>
    </div>
  );
}

function LangField({ vm }: { vm: FieldViewModel }): React.ReactElement {
  const lang = vm.lang!;
  return (
    <div {...wrapperProps(vm)}>
      <Label vm={vm} />
      <Description vm={vm} />
      <div className="form-element">
        <div className={inputGroupWrapperClass(vm)} data-uniqid={vm.uniqid}>
          <div className={lang.groupClass}>
            {lang.title ? <div className="lang-title">{lang.title}</div> : null}
            {lang.children.map((c, i) => (
              <WidgetContainer key={i} w={c.widget} className="lang-child" language={c.code} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Dispatch one field view model to its shape component. */
export function Field({ vm }: { vm: FieldViewModel }): React.ReactElement {
  switch (vm.shape) {
    case 'group':
      return <GroupField vm={vm} />;
    case 'multiple-leaf':
      return <MultipleLeafField vm={vm} />;
    case 'multiple-group':
      return <MultipleGroupField vm={vm} />;
    case 'lang':
      return <LangField vm={vm} />;
    case 'leaf':
    default:
      return <LeafField vm={vm} />;
  }
}
