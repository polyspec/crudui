/**
 * CRUDUI React node renderer: one component for the recursive form grammar.
 *
 * Every node renders `crudui-node crudui-node--{kind}` with the shared
 * `__header`, `__body` and `__footer` slots, matching the framework-independent
 * HTML renderer. Widgets with opaque behavior attributes use the raw widget path.
 */

import * as React from 'react';
import type { NodeVM } from '@crudui/generator-core';
import { Widget, widgetRootRaw } from './Widget';
import { resolvedStyleProps, styleObject } from './attrs';
import { Controls } from './Controls';
import { RawContainer } from './raw';

function classes(...parts: Array<string | undefined | false>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ');
}

function Header({ vm }: { vm: NodeVM }): React.ReactElement | null {
  const header = vm.header;
  const parts: React.ReactNode[] = [];
  if (vm.collapsible) {
    parts.push(
      <button
        key="toggle"
        type="button"
        className="crudui-action"
        data-crudui-action="toggle-row"
        aria-expanded={vm.expanded === true}
        aria-controls={vm.body.id}
        aria-label={vm.toggleLabel}
      />,
    );
  }
  if (header?.label !== undefined) {
    parts.push(header.labelFor
      ? <label key="label" className="crudui-node__label" htmlFor={header.labelFor}>{header.label}</label>
      : <span key="label" className="crudui-node__label">{header.label}</span>);
  }
  if (header?.description !== undefined) parts.push(<p key="description" className="crudui-node__description">{header.description}</p>);
  if (header?.number !== undefined) parts.push(<span key="number" className="crudui-node__number">{header.number}</span>);
  if (header?.title !== undefined) parts.push(<span key="title" className="crudui-node__title">{header.title}</span>);
  if (header?.summary !== undefined) {
    parts.push(<span key="summary" className="crudui-node__summary" hidden={vm.expanded === true}>{header.summary}</span>);
  }
  if (header?.count !== undefined) parts.push(<span key="count" className="crudui-node__count">{header.count}</span>);
  if (vm.controls?.placement === 'header') parts.push(<Controls key="controls" controls={vm.controls} />);
  if (!parts.length) return null;
  return (
    <div className={classes('crudui-node__header', header?.className)} {...resolvedStyleProps(styleObject(header?.style))}>
      {parts}
    </div>
  );
}

function HeaderSlot({ vm }: { vm: NodeVM }): React.ReactElement | null {
  const header = <Header vm={vm} />;
  if (!header) return null;
  if (!vm.sticky) return header;
  return <div className="crudui-node__header-container">{header}</div>;
}

function Body({ vm }: { vm: NodeVM }): React.ReactElement {
  const props = {
    className: classes('crudui-node__body', vm.body.className),
    ...resolvedStyleProps(styleObject(vm.body.style)),
    ...(vm.body.id ? { id: vm.body.id } : {}),
    hidden: vm.collapsible === true && vm.expanded !== true,
  };
  if (vm.checkbox) {
    const box = vm.checkbox;
    return (
      <div {...props}>
        <input className={box.className} id={box.id} name={box.name} type="checkbox" value="1" defaultChecked={box.checked} />
        <label htmlFor={box.id}>{box.caption}</label>
      </div>
    );
  }
  if (vm.widget) {
    const raw = widgetRootRaw(vm.widget);
    if (raw !== null) return <RawContainer {...props} html={raw} />;
    return <div {...props}><Widget w={vm.widget} /></div>;
  }
  return (
    <div {...props}>
      {(vm.children ?? []).map((child, index) => <Node key={child.key ?? child.path ?? child.lang ?? index} vm={child} />)}
    </div>
  );
}

/** Render one node of the recursive form grammar. */
export function Node({ vm }: { vm: NodeVM }): React.ReactElement {
  const pathAttribute = vm.kind === 'row' || vm.kind === 'lang-item' ? undefined : vm.path;
  return (
    <div
      className={classes('crudui-node', `crudui-node--${vm.kind}`, vm.sticky && 'crudui-node--sticky', vm.className)}
      {...resolvedStyleProps(styleObject([vm.style, vm.sticky ? `--crudui-sticky-depth: ${vm.stickyDepth ?? 0}` : undefined].filter(Boolean).join('; ')))}
      {...(pathAttribute !== undefined ? { 'data-field-path': pathAttribute } : {})}
      {...(vm.key !== undefined ? { 'data-crudui-row-key': vm.key } : {})}
      {...(vm.lang !== undefined ? { 'data-lang': vm.lang } : {})}
      hidden={vm.hidden}
    >
      <HeaderSlot vm={vm} />
      <Body vm={vm} />
      {vm.controls?.placement === 'footer' ? <div className="crudui-node__footer"><Controls controls={vm.controls} /></div> : null}
    </div>
  );
}
