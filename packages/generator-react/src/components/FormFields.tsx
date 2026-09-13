import * as React from 'react';
import type { NodeVM } from '@crudui/generator-core';
import { Node } from './Node';

/** Props for the CRUDUI form: the core-built top-level nodes. */
export interface FormFieldsProps {
  /** Evaluated top-level nodes. */
  fields: NodeVM[];
  /** Root element used by the browser binding. */
  rootRef?: React.Ref<HTMLDivElement>;
}

/** Render the `crudui-form` block around the top-level nodes. */
export function FormFields({ fields, rootRef }: FormFieldsProps): React.ReactElement {
  return (
    <div className="crudui-form" ref={rootRef}>
      <div className="crudui-form__body">
        {fields.map((vm) => (
          <Node key={vm.path} vm={vm} />
        ))}
      </div>
    </div>
  );
}
