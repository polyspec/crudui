import * as React from 'react';
import { connectForm, type FormInstance } from '@crudui/generator-core';
import { FormFields } from './FormFields';

/** An interactive form whose structure can be prepared and cached before data arrives. */
export function Form({ form, renderButtons = true }: { form: FormInstance; renderButtons?: boolean }): React.ReactElement {
  const snapshot = React.useSyncExternalStore(form.subscribe, form.getSnapshot, form.getSnapshot);
  const root = React.useRef<HTMLDivElement>(null);
  const binding = React.useRef<ReturnType<typeof connectForm> | null>(null);
  React.useLayoutEffect(() => {
    binding.current = connectForm(root.current!, form);
    return () => { binding.current?.disconnect(); binding.current = null; };
  }, [form]);
  React.useLayoutEffect(() => { binding.current?.sync(); }, [snapshot]);
  return <FormFields fields={snapshot.fields} buttons={snapshot.buttons} messages={form.messages} rootRef={root} renderButtons={renderButtons} />;
}
