import core = require('@crudui/generator-core');
import generator = require('@crudui/generator-react');
import validator = require('@crudui/validator');
import React = require('react');

const spec = { type: 'group', properties: { name: { type: 'text' } } };
const template: core.FormTemplate = core.compileForm(spec);
const session: core.FormInstance = core.createForm(template, { name: 'Build check' });
const snapshot: core.FormSnapshot = session.getSnapshot();
const reactSession: generator.FormInstance = generator.createForm(template, session.getData());
const view: React.ReactElement = React.createElement(generator.Form, { form: reactSession });
const options: validator.ValidateOptions = {};
const result = validator.validate(spec, session.getData(), options);
const valid: boolean = result.valid;
const randomKey: string = core.createRowKey();
const savedKey: string = core.sequenceRowKey('42');
type PublicTypes = [
  validator.ComposedField, validator.FileSet, validator.ParseErrorContext,
  validator.ParseResult, core.FormConnection, core.FieldShape,
  core.MultipleSettings, generator.AnyWidget, generator.ListProps,
];
const publicTypes: PublicTypes | undefined = undefined;

export { template, session, snapshot, view, valid, randomKey, savedKey, publicTypes };
