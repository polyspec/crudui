import * as React from 'react';
import { connectForm, type FormInstance, type FormRenderOptions } from '@polyspec/crudui-generator-core';
import { formRenderModel } from '@polyspec/crudui-generator-core/internal';
import { FormFields } from './FormFields';

/** Props of the interactive form. */
export interface FormProps {
  /** The form instance. */
  form: FormInstance;
  /** Whether the form's declared buttons render in the footer. */
  renderButtons?: boolean;
  /** The complete form options: form element, hidden inputs and errors (form-runtime.md, "Complete form"). */
  options?: FormRenderOptions;
}

/** An interactive form whose structure can be prepared and cached before data arrives. */
export function Form({ form, renderButtons = true, options }: FormProps): React.ReactElement {
  const snapshot = React.useSyncExternalStore(form.subscribe, form.getSnapshot, form.getSnapshot);
  const root = React.useRef<HTMLDivElement>(null);
  const binding = React.useRef<ReturnType<typeof connectForm> | null>(null);
  React.useLayoutEffect(() => {
    binding.current = connectForm(root.current!, form);
    return () => { binding.current?.disconnect(); binding.current = null; };
  }, [form]);
  React.useLayoutEffect(() => { binding.current?.sync(); }, [snapshot]);
  const model = formRenderModel(snapshot.fields, form.template.action, options);
  const block = <FormFields fields={snapshot.fields} buttons={snapshot.buttons} messages={form.messages} rootRef={root} renderButtons={renderButtons} model={model} description={form.description} />;
  if (!model.form) return block;
  return (
    <form action={model.form.action} encType={model.form.encType} method={model.form.method}>
      {model.hidden.map(([name, value]) => <input key={name} type="hidden" name={name} defaultValue={value} />)}
      {block}
    </form>
  );
}
