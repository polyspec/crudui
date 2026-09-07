import * as React from 'react';
import { connectForm, type FormSession } from '@crudui/generator-core';
import { Field } from './Field';

/** An interactive form whose structure can be prepared and cached before data arrives. */
export function FormSessionView({ session }: { session: FormSession }): React.ReactElement {
  const snapshot = React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const root = React.useRef<HTMLDivElement>(null);
  const binding = React.useRef<ReturnType<typeof connectForm> | null>(null);
  React.useLayoutEffect(() => {
    binding.current = connectForm(root.current!, session);
    return () => { binding.current?.disconnect(); binding.current = null; };
  }, [session]);
  React.useLayoutEffect(() => { binding.current?.sync(); }, [snapshot]);
  return <div className="form-group" ref={root}>
    {snapshot.fields.map(vm => <Field key={vm.path} vm={vm} />)}
  </div>;
}
