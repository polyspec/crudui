/**
 * capture-vue.mjs — SSR capture of @polyspec/generator-vue FormBuilder.
 *
 * Renders a YAML form spec with @vue/server-renderer renderToString and
 * returns the form CONTENT (outer <form> wrapper stripped — the legacy
 * Limepie Generator::write() returns form content; the host page owns the
 * <form> element, while FormBuilder renders its own
 * <form class="form-builder" novalidate>. The wrapper is therefore not part
 * of the parity target — same contract as capture-react.mjs).
 *
 * Spec loading mirrors tests/parity/capture-react.mjs EXACTLY (eemeli `yaml`
 * parseDocument, uniqueKeys:false last-wins, `items` integer-key ordered-pair
 * conversion, $ref descend into `properties`). The YAML lib is loaded from
 * the generator-vue realm; the dist build is loaded with a createRequire
 * anchored inside this package.
 *
 * CLI: node capture-vue.mjs <spec.yml> [data.json]   -> html on stdout
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GENERATOR_PKG = path.resolve(HERE, '..');
const GENERATOR_DIST = path.join(GENERATOR_PKG, 'dist/index.js');

const requireFromGenerator = createRequire(path.join(GENERATOR_PKG, 'package.json'));
const YAML = requireFromGenerator('yaml');

// ---------------------------------------------------------------------------
// spec loading (verbatim semantics of capture-react.mjs)
// ---------------------------------------------------------------------------

function yamlNodeToJs(node, doc, parentKey) {
  if (node === null || node === undefined) return null;
  if (YAML.isAlias(node)) return yamlNodeToJs(node.resolve(doc), doc, parentKey);
  if (YAML.isScalar(node)) return node.value;
  if (YAML.isSeq(node)) return node.items.map((n) => yamlNodeToJs(n, doc, parentKey));
  if (YAML.isMap(node)) {
    const obj = {};
    const order = [];
    for (const pair of node.items) {
      const key = String(yamlNodeToJs(pair.key, doc, parentKey));
      if (!(key in obj)) order.push(key);
      obj[key] = yamlNodeToJs(pair.value, doc, key);
    }
    if (parentKey === 'items' && Object.keys(obj).join(' ') !== order.join(' ')) {
      return order.map((k) => [k, obj[k]]);
    }
    return obj;
  }
  throw new Error(
    `unsupported YAML node kind in spec: ${node && node.constructor && node.constructor.name}`
  );
}

function loadYamlOrdered(text, file) {
  const doc = YAML.parseDocument(text, { uniqueKeys: false });
  if (doc.errors.length > 0) {
    throw new Error(`YAML parse error in ${file}: ${doc.errors[0].message}`);
  }
  return yamlNodeToJs(doc.contents, doc, undefined);
}

function resolveRefs(node, baseDir) {
  if (Array.isArray(node)) return node.map((n) => resolveRefs(n, baseDir));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref') {
        const refs = Array.isArray(value) ? value : [value];
        for (const ref of refs) {
          if (typeof ref !== 'string' || ref.startsWith('(')) {
            throw new Error(
              `Unsupported $ref form ${JSON.stringify(ref)} — the parity harness only implements plain relative file refs`
            );
          }
          const refFile = path.resolve(baseDir, ref);
          const refDoc = loadYamlOrdered(fs.readFileSync(refFile, 'utf8'), refFile);
          if (!refDoc || typeof refDoc !== 'object' || !('properties' in refDoc)) {
            throw new Error(
              `properties not found in $ref ${ref} (legacy ReferenceResolver throws "properties not found2")`
            );
          }
          Object.assign(out, resolveRefs(refDoc.properties, path.dirname(refFile)));
        }
        continue;
      }
      out[key] = resolveRefs(value, baseDir);
    }
    return out;
  }
  return node;
}

export function loadSpec(specPath) {
  const abs = path.resolve(specPath);
  const doc = loadYamlOrdered(fs.readFileSync(abs, 'utf8'), abs);
  return resolveRefs(doc, path.dirname(abs));
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

export function unwrapFormElement(html) {
  const m = html.match(/^<form\b[^>]*>([\s\S]*)<\/form>$/);
  return m ? m[1] : html;
}

export async function renderSpec(specPath, data = {}, { language = 'ko' } = {}) {
  const spec = loadSpec(specPath);
  // Load vue + the generator dist from this package's realm.
  const { createSSRApp, h } = requireFromGenerator('vue');
  const { renderToString } = requireFromGenerator('@vue/server-renderer');
  const { FormBuilder } = requireFromGenerator(GENERATOR_DIST);

  const consoleMessages = [];
  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...a) => consoleMessages.push(`[console.error] ${a.map(String).join(' ')}`);
  console.warn = (...a) => consoleMessages.push(`[console.warn] ${a.map(String).join(' ')}`);

  let raw;
  try {
    const app = createSSRApp({
      render: () => h(FormBuilder, { spec, data, language }),
    });
    raw = await renderToString(app);
  } finally {
    console.error = origError;
    console.warn = origWarn;
  }

  return { html: unwrapFormElement(raw), raw, consoleMessages };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const [specPath, dataPath] = process.argv.slice(2);
  if (!specPath) {
    console.error('usage: node capture-vue.mjs <spec.yml> [data.json]');
    process.exit(1);
  }
  const data = dataPath ? JSON.parse(fs.readFileSync(dataPath, 'utf8')) : {};
  renderSpec(specPath, data).then(({ html, consoleMessages }) => {
    for (const msg of consoleMessages) console.error(msg);
    process.stdout.write(html + '\n');
  });
}
