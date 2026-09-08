import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormFields } from '../components/FormFields';
import { bindForm, type FormTemplate, type BindFormOptions } from '@crudui/generator-core';

/** Render evaluated fields for layout conformance fixtures. */
export function renderFields(template: FormTemplate, options: BindFormOptions & { data?: Record<string, unknown> } = {}): string {
  return renderToStaticMarkup(React.createElement(FormFields, { fields: bindForm(template, options.data, options) }));
}
