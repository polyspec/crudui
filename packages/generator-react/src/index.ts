/**
 * React components and server rendering for CRUDUI forms, lists and details. Applications
 * compile and create forms with `@crudui/generator-core`.
 */

import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildList,
  buildDetail,
  type BuildDetailOptions,
  type BuildListOptions,
  type FormInstance,
} from '@crudui/generator-core';
import { listLayout } from '@crudui/generator-core/internal';
import { Form } from './components/Form';
import { List } from './components/List';
import { Detail } from './components/Detail';

// Node, widget, structure map and data view rendering.
export { Node } from './components/Node';
export { Controls } from './components/Controls';
export { Widget } from './components/Widget';
export type { AnyWidget } from './components/Widget';
export { Outline, OutlineView } from './components/Outline';
export type { OutlineProps, OutlineViewProps } from './components/Outline';
export { DataView, DataPanel } from './components/DataView';
export type { DataPanelProps } from './components/DataView';

// Form, list and detail rendering.
export { Form } from './components/Form';
export { List } from './components/List';
export type { ListProps } from './components/List';
export { Cell } from './components/Cell';
export { Detail } from './components/Detail';

/** Render the current form instance as HTML. */
export function renderForm(form: FormInstance): string {
  return renderToStaticMarkup(React.createElement(Form, { form }));
}

/** Options for list rendering. */
export interface RenderListOptions extends BuildListOptions {
  /** Table (default) or card layout. */
  layout?: 'table' | 'card';
}

/**
 * Compose a list specification, evaluate supplied rows and render list HTML.
 * Throws `ComposeLoadError` when a composition reference cannot be resolved.
 */
export function renderList(
  listSpec: Record<string, unknown>,
  rows: Array<Record<string, unknown>> = [],
  options: RenderListOptions = {}
): string {
  const { layout, ...buildOpts } = options;
  const vm = buildList(listSpec, rows, buildOpts);
  const element = React.createElement(List, { vm, layout: listLayout(layout) }) as React.ReactElement;
  return renderToStaticMarkup(element as Parameters<typeof renderToStaticMarkup>[0]);
}

/** Compose, evaluate and render one read-only detail without data access. */
export function renderDetail(
  detailSpec: Record<string, unknown>,
  record: Record<string, unknown> = {},
  options: BuildDetailOptions = {},
): string {
  const vm = buildDetail(detailSpec, record, options);
  return renderToStaticMarkup(React.createElement(Detail, { vm }));
}
