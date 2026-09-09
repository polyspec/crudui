import * as React from 'react';
import type { Attrs, FieldViewModel } from '@crudui/generator-core';
import { plainProps } from './attrs';
import { rawElement } from './raw';

function buttonAttributes(settings: FieldViewModel['multiple']): Attrs[] {
  if (!settings) return [];
  const button = (className: string): Attrs => ({ type: 'button', class: className });
  const buttons: Attrs[] = [];
  if (settings.sortable) buttons.push(button('btn btn-move-up'), button('btn btn-move-down'));
  const add = button('btn btn-plus');
  if (settings.max !== undefined) add['data-multiple-max'] = String(settings.max);
  buttons.push(add);
  if (settings.copy) buttons.push(button('btn btn-copy'));
  buttons.push(button(settings.copy ? 'btn btn-minus btn-delete' : 'btn btn-minus'));
  return buttons;
}

/** Render row operations from the evaluated multiple settings. */
export function RowButtons({ settings }: { settings: FieldViewModel['multiple'] }): React.ReactElement {
  return <>{buttonAttributes(settings).map((attrs, index) => <button key={index} {...plainProps(attrs)}> </button>)}</>;
}

/** Serialize the same row buttons inside a container with raw control behavior. */
export function rowButtonsHtml(settings: FieldViewModel['multiple']): string {
  return buttonAttributes(settings).map(attrs => rawElement('button', attrs, ' ')).join('');
}
