import * as React from 'react';
import { formButtonsHtml, type ButtonVM, type FormMessages, type NodeVM } from '@crudui/generator-core';
import { Node } from './Node';

/** Props for the CRUDUI form: the core-built top-level nodes and form buttons. */
export interface FormFieldsProps {
  /** Evaluated top-level nodes. */
  fields: NodeVM[];
  /** Evaluated form buttons. */
  buttons: ButtonVM[];
  /** Interface text. */
  messages: FormMessages;
  /** Root element used by the browser binding. */
  rootRef?: React.Ref<HTMLDivElement>;
}

/** Render the `crudui-form` block: the top-level nodes and the footer with the form buttons. */
export function FormFields({ fields, buttons, messages, rootRef }: FormFieldsProps): React.ReactElement {
  return (
    <div className="crudui-form" ref={rootRef}>
      <div className="crudui-form__body">
        {fields.map((vm) => (
          <Node key={vm.path} vm={vm} />
        ))}
      </div>
      <div className="crudui-form__footer">
        <div className="crudui-controls" role="group" aria-label={messages.formActions} dangerouslySetInnerHTML={{ __html: formButtonsHtml(buttons) }} />
      </div>
    </div>
  );
}
