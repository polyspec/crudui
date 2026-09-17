import core = require('@crudui/generator-core');
import generator = require('@crudui/generator-react');
import html = require('@crudui/generator-html');
import validator = require('@crudui/validator');
import React = require('react');

const spec = { type: 'group', properties: { name: { type: 'text' } } };
const template: core.FormTemplate = core.compileForm(spec);
const session: core.FormInstance = core.createForm(template, { name: 'Build check' });
const snapshot: core.FormSnapshot = session.getSnapshot();
const view: React.ReactElement = React.createElement(generator.Form, { form: session });
const rendered: string = html.renderForm(session);
const list: string = html.renderList({ columns: { name: { field: 'name' } } }, [{ name: 'Build check' }], {});
const options: validator.ValidateOptions = {};
const result = validator.validate(spec, session.getData(), options);
const valid: boolean = result.valid;
const listResult: validator.ValidationResult = validator.validateList({ columns: {} }, {} satisfies validator.ValidateListOptions);
const detailResult: validator.ValidationResult = validator.validateDetail({ fields: {} }, {} satisfies validator.ValidateDetailOptions);
const randomKey: string = core.createRowKey();
const savedKey: string = core.sequenceRowKey('42');
type PublicTypes = [
  validator.ComposeErrorCode, validator.FileLoader, validator.FileSet,
  validator.ValidationError, core.FormConnection, core.NodeVM,
  core.ButtonVM, generator.AnyWidget, generator.ListProps, html.RenderListOptions,
];
const publicTypes: PublicTypes | undefined = undefined;

export { template, session, snapshot, view, rendered, list, valid, listResult, detailResult, randomKey, savedKey, publicTypes };
