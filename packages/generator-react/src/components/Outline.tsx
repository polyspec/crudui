import * as React from 'react';
import {
  buildOutline,
  connectOutline,
  type FormInstance,
  type FormMessages,
  type OutlineRow,
  type OutlineState,
} from '@crudui/generator-core';
import { Controls } from './Controls';

function TextAction({ name, label, disabled = false }: { name: string; label: string; disabled?: boolean }): React.ReactElement {
  return (
    <button type="button" className="crudui-action crudui-action--text" data-crudui-action={name} disabled={disabled}>
      {label}
    </button>
  );
}

function RowItem({ row }: { row: OutlineRow }): React.ReactElement {
  return (
    <div
      className="crudui-node crudui-node--row"
      data-field-path={row.path}
      data-crudui-row-key={row.key}
    >
      <div className="crudui-node__header">
        <button type="button" className="crudui-action crudui-action--text" data-crudui-action="select-row">
          {row.number !== undefined ? <span className="crudui-node__number">{row.number}</span> : null}
          {row.title !== undefined ? <span className="crudui-node__title">{row.title}</span> : null}
        </button>
        {row.controls ? <Controls controls={row.controls} /> : null}
      </div>
      {row.rows.length ? (
        <div className="crudui-node__body">
          {row.rows.map((nested) => <RowItem key={nested.key} row={nested} />)}
        </div>
      ) : null}
    </div>
  );
}

/** Props for the stateless structure map. */
export interface OutlineViewProps {
  /** Evaluated nodes and undo availability, such as a form snapshot. */
  state: OutlineState;
  /** Interface text. */
  messages: FormMessages;
  /** Root element used by the browser binding. */
  rootRef?: React.Ref<HTMLDivElement>;
}

/** Structure map markup for evaluated nodes; applications that own their data render it from `bindForm`. */
export function OutlineView({ state, messages, rootRef }: OutlineViewProps): React.ReactElement {
  return (
    <div className="crudui-outline" ref={rootRef}>
      <div className="crudui-outline__header">
        <div className="crudui-controls" role="group" aria-label={messages.formControls}>
          <TextAction name="expand-all" label={messages.expandAll} />
          <TextAction name="collapse-all" label={messages.collapseAll} />
          <TextAction name="undo" label={messages.undo} disabled={!state.canUndo} />
        </div>
      </div>
      <div className="crudui-outline__body">
        {buildOutline(state.fields).map((row) => <RowItem key={row.key} row={row} />)}
      </div>
    </div>
  );
}

/** Props for the structure map. */
export interface OutlineProps {
  /** Form instance whose rows are mapped. */
  form: FormInstance;
  /** Rendered form element; selecting a row scrolls it into view. */
  formRef: React.RefObject<HTMLElement | null>;
}

/** Structure map of a form instance with its form controls. */
export function Outline({ form, formRef }: OutlineProps): React.ReactElement {
  const snapshot = React.useSyncExternalStore(form.subscribe, form.getSnapshot, form.getSnapshot);
  const root = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (!root.current || !formRef.current) return undefined;
    const connection = connectOutline(root.current, form, formRef.current as HTMLElement);
    return () => connection.disconnect();
  }, [form, formRef]);
  return <OutlineView state={snapshot} messages={form.messages} rootRef={root} />;
}
