import core = require('@polyspec/crudui-generator-core');
import generator = require('@polyspec/crudui-generator-react');
import html = require('@polyspec/crudui-generator-html');
import validator = require('@polyspec/crudui-validator');
import vue = require('@polyspec/crudui-generator-vue');
import React = require('react');

const spec = { type: 'group', properties: { name: { type: 'text' } } };
const template: core.FormTemplate = core.compileForm(spec);
const session: core.FormInstance = core.createForm(template, { name: 'Build check' });
const snapshot: core.FormSnapshot = session.getSnapshot();
const view: React.ReactElement = React.createElement(generator.Form, { form: session });
const rendered: string = html.renderForm(session);
const list: string = html.renderList({ columns: { name: { field: 'name' } } }, [{ name: 'Build check' }], {});
const options: validator.ValidateOptions = {};
const result: validator.ValidationResult = validator.validate(spec, session.getData(), options);
const valid: boolean = result.valid;
const hidden: string[] = result.hidden;
const listResult: validator.ListValidationResult = validator.validateList({ columns: {} }, {} satisfies validator.ValidateListOptions);
const detailResult: validator.ListValidationResult = validator.validateDetail({ fields: {} }, {} satisfies validator.ValidateDetailOptions);
const randomKey: string = core.createRowKey();
const savedKey: string = core.sequenceRowKey('42');
const vueView = vue.Form;
const vueHtml: Promise<string> = vue.renderForm(session);
type PublicTypes = [
  validator.ComposeErrorCode, validator.FileLoader, validator.FileSet,
  validator.ValidationError, core.FormConnection, core.NodeVM,
  core.ButtonVM, generator.AnyWidget, generator.ListProps, html.RenderListOptions, vue.AnyWidget,
];
const publicTypes: PublicTypes | undefined = undefined;

export { template, session, snapshot, view, rendered, list, valid, hidden, listResult, detailResult, randomKey, savedKey, vueView, vueHtml, publicTypes };
