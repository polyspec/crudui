/**
 * v2 React field dispatcher — the envelope, as a real JSX tree.
 *
 * Consumes one core `FieldViewModel` and renders the verified limepie envelope:
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
import type { FieldViewModel, RowVM, WidgetModel, UnsupportedVM } from '@polyspec/generator-core';
import { Widget, widgetRootRaw } from './Widget';
import { styleObject } from './attrs';

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
    name: vm.wrapperName,
    ...(style ? { style } : {}),
  };
}

function Label({ vm }: { vm: FieldViewModel }): React.ReactElement | null {
  if (!vm.label || vm.omitLabel) return null;
  const cls = vm.design.label.class;
  const style = styleObject(vm.design.label.style);
  return (
    <h6 {...(cls ? { className: cls } : {})} {...(style ? { style } : {})}>
      {vm.label}
    </h6>
  );
}

function Description({ vm }: { vm: FieldViewModel }): React.ReactElement | null {
  if (!vm.description) return null;
  return <p className="description">{vm.description}</p>;
}

/** Row action buttons (plus/minus/copy/move) from multiple settings. */
function RowButtons({ vm }: { vm: FieldViewModel }): React.ReactElement | null {
  const s = vm.multiple;
  if (!s) return null;
  const minusCls = s.copy ? 'btn btn-minus btn-delete' : 'btn btn-minus';
  return (
    <>
      {s.sortable ? (
        <>
          <button type="button" className="btn btn-move-up">
            {' '}
          </button>
          <button type="button" className="btn btn-move-down">
            {' '}
          </button>
        </>
      ) : null}
      <button
        type="button"
        className="btn btn-plus"
        {...(s.max !== undefined ? { 'data-multiple-max': String(s.max) } : {})}
      >
        {' '}
      </button>
      {s.copy ? (
        <button type="button" className="btn btn-copy">
          {' '}
        </button>
      ) : null}
      <button type="button" className={minusCls}>
        {' '}
      </button>
    </>
  );
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
                name={vm.checkboxName}
                type="checkbox"
                value="1"
                defaultChecked={vm.checkboxChecked}
              />
              <span>{vm.label}</span>
            </div>
          </div>
        </h6>
        <Description vm={vm} />
      </div>
    </div>
  );
}

/**
 * Render a widget into a sole-child container. A control whose only obstacle is
 * an opaque on* attr (datetime/host-script + behavior) is serialized raw at the
 * container root via widgetRootRaw, so no wrapper element is introduced. Every
 * other widget is a real JSX child.
 */
function WidgetContainer({
  w,
  className,
  uniqid,
}: {
  w: AnyWidget | undefined;
  className: string;
  uniqid: string;
}): React.ReactElement {
  if (w) {
    const raw = widgetRootRaw(w);
    if (raw !== null) {
      return (
        <div className={className} data-uniqid={uniqid} dangerouslySetInnerHTML={{ __html: raw }} />
      );
    }
  }
  return (
    <div className={className} data-uniqid={uniqid}>
      {w ? <Widget w={w} /> : null}
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
            {...(styleObject(vm.groupStyle) ? { style: styleObject(vm.groupStyle) } : {})}
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
  return (
    <div className={row.wrapperClass} data-uniqid={row.uniqid}>
      {row.widget ? <Widget w={row.widget} /> : null}
      <RowButtons vm={vm} />
    </div>
  );
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
        <RowButtons vm={vm} />
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
              <div key={i} className="lang-child" data-lang={c.code}>
                <span className="input-group-text lang-code">{c.code}</span>
                <Widget w={c.widget} />
              </div>
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
