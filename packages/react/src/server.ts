import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FormInstance, FormRenderOptions, RenderDetail, RenderList } from '@polyspec/crudui-generator-core';
import { detailRenderer, listRenderer } from '@polyspec/crudui-generator-core/internal';
import { Form, List, Detail } from './index';

/** Render the current form instance as the complete form (form-runtime.md, "Complete form"). */
export function renderForm(form: FormInstance, options?: FormRenderOptions): string {
  return renderToStaticMarkup(React.createElement(Form, { form, options }));
}

export type { RenderListOptions } from '@polyspec/crudui-generator-core';

/** Compose, evaluate and render supplied list rows as HTML. */
export const renderList: RenderList = listRenderer((vm, layout) =>
  renderToStaticMarkup(React.createElement(List, { vm, layout }) as Parameters<typeof renderToStaticMarkup>[0]));

/** Compose, evaluate and render one read-only detail without data access. */
export const renderDetail: RenderDetail = detailRenderer((vm) => renderToStaticMarkup(React.createElement(Detail, { vm })));
