/**
 * Vue components, render functions and server rendering for CRUDUI forms, lists and details.
 * Applications compile and create forms with `@crudui/generator-core`.
 */

// Node, widget, structure map and data view rendering.
export { nodeVNode, controlsVNode } from './components/Node';
export { Outline, outlineVNode } from './components/Outline';
export { DataView, dataVNode } from './components/DataView';
export { Widget } from './components/Widget';
export type { AnyWidget } from './components/Widget';

// Form, list and detail rendering.
export { Form } from './components/Form';
export { List } from './components/List';
export type { ListLayout } from './components/List';
export { Detail } from './components/Detail';
export { renderForm } from './ssr';
export { renderList } from './listSsr';
export type { RenderListOptions } from './listSsr';
export { renderDetail } from './detailSsr';
export type { RenderDetailOptions } from './detailSsr';
