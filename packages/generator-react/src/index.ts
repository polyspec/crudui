/**
 * React components for CRUDUI forms, lists and details. Forms are
 * compiled and created with `@crudui/generator-core`.
 */

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
