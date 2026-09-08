import { createRequire } from 'node:module';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { specFor } from './src/scenario.mjs';

const exampleDir = path.dirname(fileURLToPath(import.meta.url));
if (!process.argv[2] || !path.isAbsolute(process.argv[2])) throw new Error('An absolute build workspace path is required');
const workspace = process.argv[2];
const require = createRequire(`${workspace}/keyed/packages/generator-svelte/package.json`);
const { build } = await import(pathToFileURL(require.resolve('vite')));
const { svelte } = await import(pathToFileURL(require.resolve('@sveltejs/vite-plugin-svelte')));
const metadata = JSON.parse(await readFile(`${workspace}/metadata.json`, 'utf8'));
const publicDir = `${workspace}/public`;
await mkdir(publicDir, { recursive: true });
await cp(`${exampleDir}/public`, publicDir, { recursive: true });
await cp(`${exampleDir}/fixtures/records.json`, `${publicDir}/records.json`);
await writeFile(`${publicDir}/metadata.json`, JSON.stringify(metadata, null, 2));
for (const mode of ['corrected', 'original', 'original-keyed', 'keyed']) {
  await writeFile(`${publicDir}/spec-${mode}.json`, JSON.stringify(specFor(mode), null, 2));
  const revision = ['corrected', 'keyed'].includes(mode) ? mode : 'original';
  const adapter = mode === 'keyed' ? 'keyed' : 'original';
  const source = `${workspace}/${revision}/packages`;
  for (const framework of ['react', 'vue', 'svelte']) {
    await build({
      configFile: false,
      root: `${exampleDir}/viewer`,
      base: `/frames/${mode}-${framework}/`,
      publicDir: false,
      plugins: framework === 'svelte' ? [svelte({ configFile: false })] : [],
      resolve: {
        dedupe: ['react', 'react-dom', 'vue', 'svelte'],
        alias: {
          '#adapter': `${exampleDir}/src/adapters/${adapter}-${framework}.${framework === 'react' ? 'tsx' : 'ts'}`,
          'sortjson': `${workspace}/ordered-json/js/index.js`,
          '#validation-entry': `${exampleDir}/src/adapters/${adapter}-validation.mjs`,
          '#validator': `${source}/validator-ts/src/${mode === 'keyed' ? '' : 'v2/'}validate/index.ts`,
          '#react': `${source}/generator-react/src/${mode === 'keyed' ? '' : 'v2/'}components`,
          '#vue': `${source}/generator-vue/src/${mode === 'keyed' ? '' : 'v2/'}components`,
          '#svelte': `${source}/generator-svelte/src/${mode === 'keyed' ? '' : 'v2/'}components`,
          '@crudui/generator-core': `${source}/generator-core/src/index.ts`,
          '@crudui/validator': `${source}/validator-ts/src/index.ts`,
        },
      },
      define: {
        __FORM_MODE__: JSON.stringify(mode),
        __FRAMEWORK__: JSON.stringify(framework),
        __SOURCE_COMMIT__: JSON.stringify(metadata[revision].commit),
      },
      build: {
        target: 'esnext',
        outDir: `${publicDir}/frames/${mode}-${framework}`,
        emptyOutDir: true,
        sourcemap: true,
      },
    });
  }
}
