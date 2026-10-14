import * as React from 'react';
import { formButtonsHtml, type ButtonVM, type FormMessages, type NodeVM } from '@polyspec/crudui-generator-core';
import type { FormRenderModel } from '@polyspec/crudui-generator-core/internal';
import { Node, NodeErrorsContext } from './Node';
import { RawContainer } from './raw';

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
  /** Whether the adapter renders the form's declared action buttons. */
  renderButtons?: boolean;
  /** Checked render options: form errors before the body and node errors in each node. */
  model?: FormRenderModel;
  /** Translated root description, written first when it is not empty. */
  description?: string;
}

const NO_ERRORS: ReadonlyMap<NodeVM, string[]> = new Map();

/**
 * Render the `crudui-form` block: the root description, form errors, the top-level nodes and the
 * footer with the form buttons.
 */
export function FormFields({ fields, buttons, messages, rootRef, renderButtons = true, model, description = '' }: FormFieldsProps): React.ReactElement {
  const formErrors = model?.formErrors ?? [];
  return (
    <div className="crudui-form" ref={rootRef}>
      {description !== '' && <p className="crudui-form__description">{description}</p>}
      {formErrors.length > 0 && <div className="crudui-form__errors">
        {formErrors.map((text, index) => <p key={index} className="crudui-form__error">{text}</p>)}
      </div>}
      <NodeErrorsContext.Provider value={model?.nodeErrors ?? NO_ERRORS}>
        <div className="crudui-form__body">
          {fields.map((vm) => (
            <Node key={vm.path} vm={vm} />
          ))}
        </div>
      </NodeErrorsContext.Provider>
      {renderButtons && <div className="crudui-form__footer">
        <RawContainer className="crudui-controls" role="group" aria-label={messages.formActions} html={formButtonsHtml(buttons)} />
      </div>}
    </div>
  );
}
