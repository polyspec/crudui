import { mount, unmount, flushSync } from 'svelte';
import View from './OriginalSvelte.svelte';
import { originalBinding } from '../original-binding.mjs';

export function mountView(element, spec, language, data = {}) {
  const binding = originalBinding(spec, language);
  const app = flushSync(() => mount(View, { target: element, props: { build: binding.build, initialData: data } }));
  return { ...binding, load: (data) => flushSync(() => app.load(data)), dispose: () => unmount(app) };
}
