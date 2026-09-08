import * as React from 'react';
import type { FieldViewModel } from '@crudui/generator-core';
import { Field } from './Field';

/** Props for the CRUDUI form: the core-built top-level field view models. */
export interface FormFieldsProps {
  /** Evaluated fields. */
  fields: FieldViewModel[];
  /** Root element used by the browser binding. */
  rootRef?: React.Ref<HTMLDivElement>;
}

/** Render the `.form-group` envelope around the top-level fields. */
export function FormFields({ fields, rootRef }: FormFieldsProps): React.ReactElement {
  return (
    <div className="form-group" ref={rootRef}>
      {fields.map((vm) => (
        <Field key={vm.path} vm={vm} />
      ))}
    </div>
  );
}
