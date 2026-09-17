import React from 'react';
import { act, render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { buildDetail, buildList } from '@crudui/generator-core';
import { List } from '../components/List';
import { Detail } from '../components/Detail';
// @ts-expect-error Shared view assertions across frameworks.
import { exerciseViewRerender } from '../../../../tests/fixtures/view-session/rerender.mjs';
import { provesConformance } from '../../../../tests/conformance/evidence.mjs';

interface View { kind: 'list' | 'detail'; layout?: 'table' | 'card'; spec: Record<string, unknown>; data: never }

it('keeps list and detail nodes across re-renders', async () => {
  const element = document.createElement('div');
  document.body.append(element);
  let view: { rerender: (node: React.ReactElement) => void; unmount: () => void } | undefined;
  const show = ({ kind, layout, spec, data }: View) => {
    const node = kind === 'list'
      ? <List key={`list-${layout}`} vm={buildList(spec, data)} layout={layout} />
      : <Detail key="detail" vm={buildDetail(spec, data)} />;
    act(() => {
      if (view) view.rerender(node);
      else view = render(node, { container: element });
    });
  };
  try {
    await provesConformance({ features: ['updateView'], fixture: 'tests/fixtures/view-session/rerender.mjs', runtime: 'react', case: 'exerciseViewRerender' }, () =>
      exerciseViewRerender({ element, show, expect, flush: async () => { await act(async () => {}); } }));
  } finally { view?.unmount(); element.remove(); }
});
