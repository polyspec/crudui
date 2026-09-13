import * as React from 'react';
import type { FormInstance, FormMessages } from '@crudui/generator-core';

/** Props for the stateless data view. */
export interface DataPanelProps {
  /** Submission data. */
  data: unknown;
  /** Interface text. */
  messages: FormMessages;
}

/** Current data markup; applications that own their data render it directly. */
export function DataPanel({ data, messages }: DataPanelProps): React.ReactElement {
  return (
    <div className="crudui-data">
      <div className="crudui-data__header">{messages.data}</div>
      <pre className="crudui-data__body">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

/** Current submission data of a form instance. */
export function DataView({ form }: { form: FormInstance }): React.ReactElement {
  React.useSyncExternalStore(form.subscribe, form.getSnapshot, form.getSnapshot);
  return <DataPanel data={form.getData()} messages={form.messages} />;
}
