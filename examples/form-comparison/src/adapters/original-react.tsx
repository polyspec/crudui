import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { originalBinding } from '../original-binding.mjs';
import { Form } from '#react/Form';

export function mountView(element, spec, language) {
  const root = createRoot(element);
  const binding = originalBinding(spec, language);
  const load = (data) => root.render(<Form fields={binding.build(data)} />);
  load({});
  return { ...binding, load, dispose: () => root.unmount() };
}
