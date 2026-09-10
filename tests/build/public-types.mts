import {
  compileForm, createForm, createRowKey, sequenceRowKey,
  type FieldShape, type FormConnection, type FormTemplate, type FormInstance,
  type FormSnapshot, type MultipleSettings,
} from '@crudui/generator-core';
import {
  Form, createForm as createReactSession,
  type AnyWidget, type FormInstance as ReactFormInstance, type ListProps,
} from '@crudui/generator-react';
import {
  validate, type ComposedField, type FileSet, type ParseErrorContext,
  type ParseResult, type ValidateOptions,
} from '@crudui/validator';
import { createElement, type ReactElement } from 'react';

const spec = { type: 'group', properties: { name: { type: 'text' } } };
const template: FormTemplate = compileForm(spec);
const session: FormInstance = createForm(template, { name: 'Build check' });
const snapshot: FormSnapshot = session.getSnapshot();
const reactSession: ReactFormInstance = createReactSession(template, session.getData());
const view: ReactElement = createElement(Form, { form: reactSession });
const options: ValidateOptions = {};
const result = validate(spec, session.getData(), options);
const valid: boolean = result.valid;
const randomKey: string = createRowKey();
const savedKey: string = sequenceRowKey('42');
type PublicTypes = [
  ComposedField, FileSet, ParseErrorContext, ParseResult, FormConnection,
  FieldShape, MultipleSettings, AnyWidget, ListProps,
];
const publicTypes: PublicTypes | undefined = undefined;

export { template, session, snapshot, view, valid, randomKey, savedKey, publicTypes };
