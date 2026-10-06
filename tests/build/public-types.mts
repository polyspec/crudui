import {
  compileForm, createForm, createRowKey, sequenceRowKey,
  type ButtonVM, type FormConnection, type FormTemplate, type FormInstance,
  type FormSnapshot, type NodeVM,
} from '@crudui/generator-core';
import { Form, type AnyWidget, type ListProps } from '@crudui/generator-react';
import { renderForm, renderList, type RenderListOptions } from '@crudui/generator-html';
import {
  validate, validateDetail, validateList, type ComposeErrorCode, type FileLoader, type FileSet,
  type ValidateDetailOptions, type ValidateListOptions, type ValidateOptions, type ValidationError,
  type ListValidationResult, type ValidationResult,
} from '@crudui/validator';
import { bindForm, type FormBinding, type FormBindingOptions } from '@crudui/form-binding';
import { Form as VueForm, renderForm as renderVueForm, type AnyWidget as VueAnyWidget } from '@crudui/generator-vue';
import { Form as SvelteForm, renderForm as renderSvelteForm } from '@crudui/generator-svelte';
import { createElement, type ReactElement } from 'react';

const spec = { type: 'group', properties: { name: { type: 'text' } } };
const template: FormTemplate = compileForm(spec);
const session: FormInstance = createForm(template, { name: 'Build check' });
const snapshot: FormSnapshot = session.getSnapshot();
const view: ReactElement = createElement(Form, { form: session });
const html: string = renderForm(session);
const list: string = renderList({ columns: { name: { field: 'name' } } }, [{ name: 'Build check' }], {} satisfies RenderListOptions);
const options: ValidateOptions = {};
const result: ValidationResult = validate(spec, session.getData(), options);
const valid: boolean = result.valid;
const hidden: string[] = result.hidden;
const listResult: ListValidationResult = validateList({ columns: {} }, {} satisfies ValidateListOptions);
const detailResult: ListValidationResult = validateDetail({ fields: {} }, {} satisfies ValidateDetailOptions);
const randomKey: string = createRowKey();
const savedKey: string = sequenceRowKey('42');
const bindingOptions: FormBindingOptions = { keyPrefix: 'form' };
const bind: (form: HTMLFormElement) => FormBinding = (form) => bindForm(form, spec, bindingOptions);
const vueView = VueForm;
const vueHtml: Promise<string> = renderVueForm(session);
const svelteView = SvelteForm;
const svelteHtml: string = renderSvelteForm(session);
type PublicTypes = [
  ComposeErrorCode, FileLoader, FileSet, ValidationError, FormConnection,
  NodeVM, ButtonVM, AnyWidget, ListProps, RenderListOptions, VueAnyWidget,
];
const publicTypes: PublicTypes | undefined = undefined;

export { template, session, snapshot, view, html, list, valid, hidden, listResult, detailResult, randomKey, savedKey, bind, vueView, vueHtml, svelteView, svelteHtml, publicTypes };
