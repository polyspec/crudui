import * as React from 'react';
import type { ControlsVM } from '@crudui/generator-core';

/** Render one control group of `data-crudui-action` buttons. */
export function Controls({ controls }: { controls: ControlsVM }): React.ReactElement {
  return (
    <div className="crudui-controls" role="group" aria-label={controls.label}>
      {controls.actions.map((action) => (
        <button
          key={action.name}
          type="button"
          className="crudui-action"
          data-crudui-action={action.name}
          aria-label={action.label}
          aria-disabled={action.disabled ? 'true' : undefined}
        />
      ))}
    </div>
  );
}
