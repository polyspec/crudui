/** Re-rendering read-only lists and details through each framework's public components. */
export const listSpec = {
  columns: {
    name: { field: 'name', label: 'Name' },
    bio: { field: 'bio', label: 'Bio', format: { type: 'html' } },
  },
  actions: { edit: { label: 'Edit', format: { type: 'link', href: '/edit' } }, remove: 'void 0' },
};

export const detailSpec = {
  fields: {
    name: { field: 'name', label: 'Name' },
    bio: { field: 'bio', label: 'Bio', format: { type: 'html' } },
  },
};

const record = note => ({ name: 'Ada', bio: `<b>Lead</b> <i>${note}</i>` });

/**
 * Show a list as a table and as cards, and a detail, then show each again from a new model with
 * the same content and from a model whose raw HTML changed. Every element node stays; changed
 * raw HTML is patched into the nodes it still contains. `show({ kind, layout, spec, data })`
 * renders or updates the view inside `element` from a new model: `kind` is `list` (with
 * `layout`, rows in `data`) or `detail` (a record in `data`).
 */
export async function exerciseViewRerender({ element, show, expect, flush }) {
  const views = [
    ['list', 'table', note => ({ spec: listSpec, data: [record(note)] })],
    ['list', 'card', note => ({ spec: listSpec, data: [record(note)] })],
    ['detail', undefined, note => ({ spec: detailSpec, data: record(note) })],
  ];
  for (const [kind, layout, model] of views) {
    await show({ kind, layout, ...model('first') });
    await flush();
    const nodes = () => Array.from(element.querySelectorAll('*'));
    const initial = nodes();
    expect(initial.filter(node => node.tagName === 'B')).toHaveLength(1);
    if (kind === 'list') expect(element.querySelectorAll('.crudui-list__action > *')).toHaveLength(2);
    const kept = () => {
      const current = nodes();
      expect(current).toHaveLength(initial.length);
      expect(current.filter((node, index) => node !== initial[index]).map(node => node.outerHTML)).toEqual([]);
    };
    await show({ kind, layout, ...model('first') });
    await flush();
    kept();
    await show({ kind, layout, ...model('second') });
    await flush();
    kept();
    expect(element.querySelector('i').textContent).toBe('second');
  }
}
