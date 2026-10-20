/**
 * Svelte components and server rendering for CRUDUI forms, lists and details. Forms are
 * compiled and created with `@polyspec/crudui-generator-core`.
 */

import type { Component } from 'svelte';
import { render } from 'svelte/server';
import type { FormInstance, FormRenderOptions, RenderDetail, RenderList } from '@polyspec/crudui-generator-core';
import { detailRenderer, listRenderer } from '@polyspec/crudui-generator-core/internal';
import NodeComponent, { type NodeProps } from './components/Node.svelte';
import ControlsComponent, { type ControlsProps } from './components/Controls.svelte';
import OutlineComponent, { type OutlineProps } from './components/Outline.svelte';
import OutlineViewComponent, { type OutlineViewProps } from './components/OutlineView.svelte';
import DataViewComponent, { type DataViewProps } from './components/DataView.svelte';
import DataPanelComponent, { type DataPanelProps } from './components/DataPanel.svelte';
import WidgetComponent, { type WidgetProps } from './components/Widget.svelte';
import FormComponent, { type FormProps } from './components/Form.svelte';
import ListComponent, { type ListProps } from './components/List.svelte';
import DetailComponent, { type DetailProps } from './components/Detail.svelte';

// The props of each component, exported by name.
export type { NodeProps, ControlsProps, OutlineProps, OutlineViewProps, DataViewProps, DataPanelProps, WidgetProps, FormProps, ListProps, DetailProps };

// Each component is a Svelte 5 component function; the type of an instance is `ReturnType<typeof X>`.
/** Render one node of the recursive form grammar: `crudui-node` with its kind modifier and the shared header, body and footer slots. */
export const Node: Component<NodeProps> = NodeComponent;
/** Render one control group of `data-crudui-action` buttons. */
export const Controls: Component<ControlsProps> = ControlsComponent;
/** Render the structure map of a form instance with its form controls; selecting a row scrolls the rendered form row into view. */
export const Outline: Component<OutlineProps> = OutlineComponent;
/** Render structure map markup for evaluated nodes and undo availability. */
export const OutlineView: Component<OutlineViewProps> = OutlineViewComponent;
/** Render the current submission data of a form instance. */
export const DataView: Component<DataViewProps> = DataViewComponent;
/** Render current data markup directly from the data. */
export const DataPanel: Component<DataPanelProps> = DataPanelComponent;
/** Render an evaluated widget and its native controls inside the required container. */
export const Widget: Component<WidgetProps> = WidgetComponent;
/** Render an editable form instance and synchronize its data, row actions and input state. */
export const Form: Component<FormProps> = FormComponent;
/** Render an evaluated list model as a table or cards with display cells and row actions. */
export const List: Component<ListProps> = ListComponent;
/** Render an evaluated read-only detail model with its actions and its definition list. */
export const Detail: Component<DetailProps> = DetailComponent;

/** Render the current form instance as the complete form (form-runtime.md, "Complete form") with Svelte hydration markers intact. */
export function renderForm(form: FormInstance, options?: FormRenderOptions): string {
  return render(FormComponent, { props: { form, options } }).body;
}

export type { RenderListOptions } from '@polyspec/crudui-generator-core';

/**
 * Compose a list specification, evaluate supplied rows and render list HTML.
 * Throws `ComposeLoadError` when a composition reference cannot be resolved.
 */
export const renderList: RenderList = listRenderer((vm, layout) => render(ListComponent, { props: { vm, layout } }).body);

/** Compose, evaluate and render one read-only detail without data access. */
export const renderDetail: RenderDetail = detailRenderer((vm) => render(DetailComponent, { props: { vm } }).body);
