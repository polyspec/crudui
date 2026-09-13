import * as React from 'react';
import {
  buildOutline,
  connectOutline,
  type FormInstance,
  type OutlineCollection,
  type OutlineRow,
} from '@crudui/generator-core';
import { Controls } from './Controls';

function TextAction({ name, label, disabled = false }: { name: string; label: string; disabled?: boolean }): React.ReactElement {
  return (
    <button type="button" className="crudui-action crudui-action--text" data-crudui-action={name} disabled={disabled}>
      {label}
    </button>
  );
}

function CollectionItem({ collection }: { collection: OutlineCollection }): React.ReactElement {
  return (
    <div className="crudui-node crudui-node--collection" data-field-path={collection.path}>
      <div className="crudui-node__header">
        {collection.label !== undefined ? <span className="crudui-node__label">{collection.label}</span> : null}
        {collection.count !== undefined ? <span className="crudui-node__count">{collection.count}</span> : null}
        {collection.controls ? <Controls controls={collection.controls} /> : null}
      </div>
      <div className="crudui-node__body">
        {collection.rows.map((row) => <RowItem key={row.key} row={row} />)}
      </div>
    </div>
  );
}

function RowItem({ row }: { row: OutlineRow }): React.ReactElement {
  return (
    <div
      className="crudui-node crudui-node--row"
      data-field-path={row.path}
      data-crudui-row-key={row.key}
      {...(row.current ? { 'aria-current': 'true' as const } : {})}
    >
      <div className="crudui-node__header">
        <button type="button" className="crudui-action crudui-action--text" data-crudui-action="select-row">
          {row.number !== undefined ? <span className="crudui-node__number">{row.number}</span> : null}
          {row.title !== undefined ? <span className="crudui-node__title">{row.title}</span> : null}
        </button>
        {row.controls ? <Controls controls={row.controls} /> : null}
      </div>
      {row.collections.length ? (
        <div className="crudui-node__body">
          {row.collections.map((collection) => <CollectionItem key={collection.path} collection={collection} />)}
        </div>
      ) : null}
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
  const messages = form.messages;
  return (
    <div className="crudui-outline" ref={root}>
      <div className="crudui-outline__header">
        <div className="crudui-controls" role="group" aria-label={messages.formControls}>
          <TextAction name="expand-all" label={messages.expandAll} />
          <TextAction name="collapse-all" label={messages.collapseAll} />
          <TextAction name="undo" label={messages.undo} disabled={!snapshot.canUndo} />
        </div>
      </div>
      <div className="crudui-outline__body">
        {buildOutline(snapshot.fields, snapshot.selection).map((collection) => (
          <CollectionItem key={collection.path} collection={collection} />
        ))}
      </div>
    </div>
  );
}
