/**
 * CRUDUI React form component — `<Form>` renders the composed field list.
 *
 * It takes the core's already-built `FieldViewModel[]` (compose + design eval +
 * i18n + tree) and maps each top-level field to a `<Field>` inside the
 * `.form-group` envelope. It is a pure presentational tree: no evaluation, no
 * string concatenation, no completed-HTML echo. SSR via react-dom/server in the
 * `renderForm` entry produces the legacy envelope byte-compatibly after
 * normalization.
 */

import * as React from 'react';
import type { FieldViewModel } from '@form-spec/generator-core';
import { Field } from './Field';

/** Props for the CRUDUI form: the core-built top-level field view models. */
export interface FormProps {
  fields: FieldViewModel[];
}

/** Render the `.form-group` envelope around the top-level fields. */
export function Form({ fields }: FormProps): React.ReactElement {
  return (
    <div className="form-group">
      {fields.map((vm, i) => (
        <Field key={i} vm={vm} />
      ))}
    </div>
  );
}
