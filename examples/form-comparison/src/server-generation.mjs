import { encodeJson, readJson } from './json.mjs';
import { formFrameworks, formRenderingPaths, pipelineServers } from './runtime-paths.mjs';

const rootReference = '/__crudui_browser_form__.json';

function compilePayload(spec, options) {
  const files = options.files ?? {};
  if (Object.hasOwn(files, rootReference)) throw new TypeError(`Compile files cannot replace ${rootReference}`);
  // The fields come by reference; root declarations such as buttons stay on the form root.
  const { properties, ...root } = spec;
  return {
    spec: { ...root, properties: { $ref: rootReference } },
    options: { ...options, files: { ...files, [rootReference]: { type: 'group', properties } } },
  };
}

/** Cache templates compiled by one selected server and expose actual request metrics. */
export function serverGeneration(server, renderingPath, framework, request) {
  if (!pipelineServers.includes(server)) throw new TypeError('Unknown generation server');
  if (!formRenderingPaths.includes(renderingPath)) throw new TypeError('Unknown rendering path');
  if (!formFrameworks.includes(framework)) throw new TypeError('Unknown generation framework');
  const send = request ?? ((...args) => globalThis.fetch(...args));
  if (typeof send !== 'function') throw new TypeError('A fetch implementation is required');
  const cache = new Map();
  let requests = 0;

  async function compile(spec, options) {
    const body = encodeJson(compilePayload(spec, options));
    requests++;
    const response = await send(`/api/${server}/compile/${renderingPath}/${framework}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.error ?? `Form compilation failed with status ${response.status}`);
    if (!result.template || result.template.kind !== 'crudui/form-template') throw new TypeError('Compile response is missing a form template');
    if (['go', 'rust'].includes(server) && (!Number.isSafeInteger(result.referenceReads) || result.referenceReads < 0))
      throw new TypeError('Compile response is missing measured reference reads');
    if (['php', 'php-ext'].includes(server) && result.referenceReads !== null)
      throw new TypeError('PHP compile response must report unavailable reference instrumentation as null');
    return { template: result.template, generator: result.generator, referenceReads: result.referenceReads };
  }

  return {
    prepare(spec, options = {}) {
      const key = encodeJson({ spec, options });
      let pending = cache.get(key);
      if (!pending) {
        pending = compile(spec, options);
        cache.set(key, pending);
        pending.catch(() => { if (cache.get(key) === pending) cache.delete(key); });
      }
      return pending;
    },
    compileRequests: () => requests,
  };
}
