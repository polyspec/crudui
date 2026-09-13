import * as React from 'react';
import type { FormInstance } from '@crudui/generator-core';

/** Current submission data of a form instance. */
export function DataView({ form }: { form: FormInstance }): React.ReactElement {
  React.useSyncExternalStore(form.subscribe, form.getSnapshot, form.getSnapshot);
  return (
    <div className="crudui-data">
      <div className="crudui-data__header">{form.messages.data}</div>
      <pre className="crudui-data__body">{JSON.stringify(form.getData(), null, 2)}</pre>
    </div>
  );
}
