// The public types of generator-svelte as a Svelte project compiles them: Vite resolves modules as the bundler
// resolution of TypeScript does, which resolves a relative `.svelte` import to the `.svelte.d.ts` that svelte-package
// writes beside it; the Node.js resolution of public-types.mts requires a TypeScript extension there.
import { compileForm, createForm } from '@polyspec/crudui-generator-core';
import { Form, renderForm } from '@polyspec/crudui-generator-svelte';

const session = createForm(compileForm({ type: 'group', properties: { name: { type: 'text' } } }), { name: 'Build check' });
const view = Form;
const html: string = renderForm(session);

export { view, html };
