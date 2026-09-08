import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { originalBinding } from '../original-binding.mjs';
import { FormV2 } from '#react/FormV2';

export function mountView(element, spec, language, data = {}) {
  const root = createRoot(element);
  const binding = originalBinding(spec, language);
  const load = (data) => flushSync(() => root.render(<FormV2 fields={binding.build(data)} />));
  load(data);
  return { ...binding, load, dispose: () => root.unmount() };
}
