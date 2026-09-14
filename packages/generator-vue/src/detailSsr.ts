/** Detail HTML rendering with Vue's server renderer. */

import { buildDetail, type BuildDetailOptions } from '@crudui/generator-core';
import { Detail } from './components/Detail';

/** Options for a CRUDUI detail SSR render. */
export type RenderDetailOptions = BuildDetailOptions;

/** Compose a detail specification, evaluate one record and render read-only HTML. */
export async function renderDetail(
  detailSpec: Record<string, unknown>,
  record: Record<string, unknown> = {},
  options: RenderDetailOptions = {},
): Promise<string> {
  const vm = buildDetail(detailSpec, record, options);
  const { createSSRApp } = await import('vue');
  const { renderToString } = await import('@vue/server-renderer');
  return renderToString(createSSRApp({ render: () => Detail(vm) }));
}
