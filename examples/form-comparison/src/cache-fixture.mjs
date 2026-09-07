import { MemoryLoader } from '@crudui/validator';

/** Count reference reads and reject loading after structure preparation. */
export function cacheFixture(spec) {
  const memory = new MemoryLoader({ 'form.yml': spec });
  let reads = 0;
  let closed = false;
  return {
    source: { type: 'group', properties: { $ref: 'form.yml' } },
    loader: {
      normalize: (path, basepath) => memory.normalize(path, basepath),
      load: path => {
        if (closed) throw new Error('Composition was loaded after template preparation');
        reads++;
        return memory.load(path);
      },
    },
    close: () => { closed = true; },
    referenceReads: () => reads,
  };
}
