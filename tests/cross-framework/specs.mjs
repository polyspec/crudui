/**
 * specs.mjs — the single source of the 7 cross-framework cases and the shared
 * output layout. React, Vue, and Svelte capture legs plus the coordinator all
 * import this so they render and compare exactly the same set.
 *
 * The 7 cases mirror tests/parity/parity.test.mjs (the React<->PHP gate) and
 * the Vue/Svelte equivalents — same names, same spec paths — so a per-case
 * mismatch maps 1:1 onto an existing PHP-parity fixture.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const CASES = [
  { name: 'contact', spec: 'examples/legacy/shared-specs/contact.yml' },
  { name: 'multiple-test', spec: 'examples/legacy/shared-specs/multiple-test.yml' },
  { name: 'order-form', spec: 'examples/legacy/shared-specs/order-form.yml' },
  { name: 'product-form', spec: 'examples/legacy/shared-specs/product-form.yml' },
  { name: 'registration', spec: 'examples/legacy/shared-specs/registration.yml' },
  { name: 'user-registration', spec: 'examples/legacy/shared-specs/user-registration.yml' },
  { name: 'ProductNft', spec: 'tests/fixtures/specs/ProductNft.yml' },
];

export const FRAMEWORKS = ['react', 'vue', 'svelte'];

export const OUT_ROOT = path.join(HERE, 'out');

export function outDirFor(framework) {
  return path.join(OUT_ROOT, framework);
}
