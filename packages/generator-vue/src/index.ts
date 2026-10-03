/**
 * Vue components, render functions and server rendering for CRUDUI forms, lists and details.
 * Forms are compiled and created with `@crudui/generator-core`.
 */

// Node, widget, structure map and data view rendering.
export { nodeVNode, controlsVNode } from './components/Node.js';
export type { NodeErrors } from './components/Node.js';
export { Outline, outlineVNode } from './components/Outline.js';
export { DataView, dataVNode } from './components/DataView.js';
export { Widget } from './components/Widget.js';
export type { AnyWidget } from './components/Widget.js';

// Form, list and detail rendering.
export { Form } from './components/Form.js';
export { List } from './components/List.js';
export type { ListLayout } from './components/List.js';
export { Detail } from './components/Detail.js';
export { renderForm } from './ssr.js';
export { renderList } from './listSsr.js';
export type { RenderListOptions } from './listSsr.js';
export { renderDetail } from './detailSsr.js';
export type { RenderDetailOptions } from './detailSsr.js';
