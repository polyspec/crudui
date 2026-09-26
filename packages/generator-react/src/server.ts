import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildDetail,
  type BuildDetailOptions,
  type BuildListOptions,
  type FormInstance,
} from '@crudui/generator-core';
import { buildListLayout } from '@crudui/generator-core/internal';
import { Form, List, Detail } from './index';

/** Render the current form instance as HTML. */
export function renderForm(form: FormInstance): string {
  return renderToStaticMarkup(React.createElement(Form, { form }));
}

/** Options for list rendering. */
export interface RenderListOptions extends BuildListOptions {
  /** Table (default) or card layout. */
  layout?: 'table' | 'card';
}

/** Compose, evaluate and render supplied list rows as HTML. */
export function renderList(
  listSpec: Record<string, unknown>,
  rows: Array<Record<string, unknown>> = [],
  options: RenderListOptions = {}
): string {
  const { vm, layout } = buildListLayout(listSpec, rows, options);
  const element = React.createElement(List, { vm, layout }) as React.ReactElement;
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
