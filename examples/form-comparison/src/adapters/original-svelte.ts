import { mount, unmount } from 'svelte';
import View from './OriginalSvelte.svelte';
import { originalBinding } from '../original-binding.mjs';

export function mountView(element, spec, language) {
  const binding = originalBinding(spec, language);
  const app = mount(View, { target: element, props: { build: binding.build } });
  return { ...binding, load: (data) => app.load(data), dispose: () => unmount(app) };
}
