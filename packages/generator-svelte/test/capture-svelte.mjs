/**
 * capture-svelte.mjs — SSR capture of the @form-spec/generator-svelte
 * FormBuilder. Renders a YAML form spec with `svelte/server` render() and
 * returns the form CONTENT (the outer <form class="form-builder" novalidate>
 * wrapper stripped — the legacy Limepie Generator::write() returns form
 * content; the host page owns the <form> element, so the wrapper is not part
 * of the parity target).
 *
 * Spec loading mirrors tests/parity/capture-react.mjs EXACTLY:
 *   - YAML loads through an order-preserving converter (eemeli `yaml`
 *     parseDocument, uniqueKeys: false): duplicate mapping keys resolve
 *     last-wins at the FIRST key's position (libyaml semantics).
 *   - `items` mappings whose DOCUMENT key order differs from plain-object
 *     iteration order convert to the ordered pair form ([[key, label], ...]).
 *   - `$ref: <relative.yml>` is resolved in place, descending into the
 *     referenced file's `properties` key (ReferenceResolver detectKeys).
 *
 * CLI: node capture-svelte.mjs <spec.yml> [data.json]   -> html on stdout
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';
import YAML from 'yaml';
import FormBuilder from '../src/components/FormBuilder.svelte';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// spec loading (identical semantics to tests/parity/capture-react.mjs)
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
  // Svelte 5 SSR wraps the render in fragment markers (<!--[-->...<!--]-->)
  // and emits a component-hash comment as the first child of the form. Strip
  // outer fragment markers, then extract the <form> inner content. The
  // shared normalizer (normalize.js) removes any remaining HTML comments.
  let s = html.trim();
  s = s.replace(/^<!--\[-->/, '').replace(/<!--\]-->$/, '').trim();
  const m = s.match(/^<form\b[^>]*>([\s\S]*)<\/form>$/);
  return m ? m[1] : s;
}

/**
 * Render a spec file to HTML (form content, <form> wrapper stripped).
 * Returns { html, raw }.
 */
export function renderSpec(specPath, data = {}, { language = 'ko' } = {}) {
  const spec = loadSpec(specPath);
  const { body } = render(FormBuilder, { props: { spec, data, language } });
  return { html: unwrapFormElement(body.trim()), raw: body };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const [specPath, dataPath] = process.argv.slice(2);
  if (!specPath) {
    console.error('usage: node capture-svelte.mjs <spec.yml> [data.json]');
    process.exit(1);
  }
  const data = dataPath ? JSON.parse(fs.readFileSync(dataPath, 'utf8')) : {};
  const { html } = renderSpec(specPath, data);
  process.stdout.write(html + '\n');
}
