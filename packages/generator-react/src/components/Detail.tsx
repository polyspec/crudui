/** CRUDUI React read-only detail component backed by the shared DetailViewModel. */

import * as React from 'react';
import type { DetailViewModel, DetailFieldVM } from '@crudui/generator-core';
import { CellBody } from './Cell';
import { styleObject } from './attrs';

function fieldClass(field: DetailFieldVM): string | undefined {
  return ['detail-value', `detail-value-${field.format.type}`, field.design.main.class]
    .filter((value) => value && value.trim()).join(' ') || undefined;
}

function Field({ field }: { field: DetailFieldVM }): React.ReactElement {
  const display = field.display;
  const valueProps = {
    className: fieldClass(field),
    style: styleObject(field.design.main.style),
  };
  return (
    <div className="detail-field">
      <dt className="detail-label">{field.label}</dt>
      {typeof display !== 'string' && display.kind === 'html' ? (
        <dd {...valueProps} dangerouslySetInnerHTML={{ __html: display.html }} />
      ) : (
        <dd {...valueProps}><CellBody cell={field} /></dd>
      )}
    </div>
  );
}

/** Render an evaluated read-only detail model without data access or evaluation. */
export function Detail({ vm }: { vm: DetailViewModel }): React.ReactElement {
  const className = ['detail-view', vm.design.wrapper.class].filter((value) => value && value.trim()).join(' ') || undefined;
  return <dl className={className} style={styleObject(vm.design.wrapper.style)}>{vm.fields.map((field) => <Field key={field.key} field={field} />)}</dl>;
}
