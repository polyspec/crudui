import { createRequire } from 'node:module';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { formFrameworks, formRenderingPaths } from './src/runtime-paths.mjs';
import { readFrameDocument } from './src/frame-document.mjs';
import { specFor } from './src/scenario.mjs';

const exampleDirectory = path.dirname(fileURLToPath(import.meta.url));
if (process.argv.length !== 3 || !path.isAbsolute(process.argv[2])) {
  throw new Error('Usage: node build.mjs /absolute/public-directory');
}
const publicDirectory = process.argv[2];
// The repository that contains this script; the supervisor runs it from the build tree.
const source = path.resolve(exampleDirectory, '../..');
const require = createRequire(path.join(source, 'packages/generator-svelte/package.json'));
const { build } = await import(pathToFileURL(require.resolve('vite')));
const { parse } = await import(pathToFileURL(require.resolve('parse5')));
const { svelte } = await import(pathToFileURL(require.resolve('@sveltejs/vite-plugin-svelte')));
await mkdir(publicDirectory, { recursive: true });
await cp(path.join(exampleDirectory, 'public'), publicDirectory, { recursive: true });
await cp(path.join(exampleDirectory, 'benchmark'), path.join(publicDirectory, 'benchmark'), { recursive: true });
await cp(path.join(exampleDirectory, 'src/browser-job.mjs'),
  path.join(publicDirectory, 'browser-job.mjs'));
await cp(path.join(exampleDirectory, 'src/frame-readiness.mjs'),
  path.join(publicDirectory, 'frame-readiness.mjs'));
await cp(path.join(exampleDirectory, 'src/storage-lock.mjs'),
  path.join(publicDirectory, 'storage-lock.mjs'));
await cp(path.join(exampleDirectory, 'src/frame-pointer.mjs'),
  path.join(publicDirectory, 'frame-pointer.mjs'));
await cp(path.join(exampleDirectory, 'src/runtime-paths.mjs'),
  path.join(publicDirectory, 'runtime-paths.mjs'));
// The browser matrix, read by the page and by the Go and Rust servers.
await cp(path.join(exampleDirectory, 'src/runtime-paths.json'),
  path.join(publicDirectory, 'runtime-paths.json'));
await cp(path.join(source, 'tests/form-inspector/form-snapshot.mjs'),
  path.join(publicDirectory, 'form-snapshot.mjs'));
// Frames and SSR documents style the form with crudui.css alone, so computed CSS is compared with the real styles.
await cp(path.join(source, 'packages/generator-core/styles/crudui.css'),
  path.join(publicDirectory, 'crudui.css'));
await cp(path.join(exampleDirectory, 'fixtures/records.json'),
  path.join(publicDirectory, 'records.json'));
const spec = specFor();
await writeFile(path.join(publicDirectory, 'spec.json'), JSON.stringify(spec, null, 2) + '\n');

for (const renderingPath of formRenderingPaths) {
  for (const framework of formFrameworks) {
    // Svelte adapters own reactive state, which lives in a runes module.
    const extension = { react: 'tsx', vue: 'ts', svelte: 'svelte.ts', html: 'ts' }[framework];
    await build({
      configFile: false,
      root: path.join(exampleDirectory, 'viewer'),
      base: '/frames/' + renderingPath + '-' + framework + '/',
      publicDir: false,
      plugins: framework === 'svelte' ? [svelte({ configFile: false })] : [],
      resolve: {
        dedupe: ['react', 'react-dom', 'vue', 'svelte'],
        alias: {
          '#adapter': path.join(exampleDirectory, 'src/adapters',
            renderingPath === 'bindForm' ? 'bind-form-' + framework + '.' + extension
              : 'create-form-' + framework + '.' + extension),
          '#validation-entry': path.join(exampleDirectory, 'src/adapters/validation.mjs'),
          '#validator': path.join(source, 'packages/validator-ts/src/validate/index.ts'),
          '#react': path.join(source, 'packages/generator-react/src/components'),
          '#vue': path.join(source, 'packages/generator-vue/src/components'),
          '#svelte': path.join(source, 'packages/generator-svelte/src/components'),
          '#html': path.join(source, 'packages/generator-html/src/index.ts'),
          '@crudui/generator-core': path.join(source, 'packages/generator-core/src/index.ts'),
          '@crudui/validator': path.join(source, 'packages/validator-ts/src/index.ts'),
        },
      },
      define: {
        __FORM_PATH__: JSON.stringify(renderingPath),
        __FRAMEWORK__: JSON.stringify(framework),
      },
      build: {
        target: 'esnext',
        outDir: path.join(publicDirectory, 'frames', renderingPath + '-' + framework),
        emptyOutDir: true,
        sourcemap: true,
      },
    });
    // The servers render into this document, so the build must satisfy the frame contract.
    const document = path.join(publicDirectory, 'frames', renderingPath + '-' + framework, 'index.html');
    readFrameDocument(parse, await readFile(document, 'utf8'), 'csr');
  }
}
