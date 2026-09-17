// @vitest-environment jsdom
import { createApp, h, nextTick, shallowRef } from 'vue';
import { expect, it } from 'vitest';
import { buildDetail, buildList } from '@crudui/generator-core';
import { List } from '../src/components/List';
import { Detail } from '../src/components/Detail';
import { exerciseViewRerender } from '../../../tests/fixtures/view-session/rerender.mjs';
import { provesConformance } from '../../../tests/conformance/evidence.mjs';

it('keeps list and detail nodes across re-renders', async () => {
  const element = document.createElement('div');
  document.body.append(element);
  const view = shallowRef(null);
  const app = createApp({
    render: () => {
      if (!view.value) return null;
      const { kind, layout, spec, data } = view.value;
      const node = kind === 'list' ? List(buildList(spec, data), layout) : Detail(buildDetail(spec, data));
      return h('div', { key: `${kind}-${layout}`, style: 'display: contents' }, [node]);
    },
  });
  app.mount(element);
  try {
    await provesConformance({ features: ['updateView'], fixture: 'tests/fixtures/view-session/rerender.mjs', runtime: 'vue', case: 'exerciseViewRerender' }, () =>
      exerciseViewRerender({ element, expect, flush: nextTick, show: (next) => { view.value = next; } }));
  } finally { app.unmount(); element.remove(); }
});
