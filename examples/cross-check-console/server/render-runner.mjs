/**
 * Compile and render one request in React, Svelte and Vue, then compare HTML
 * using the shared fixture normalizer. Each result records output or its error.
 */

import { getEngine } from './engine.mjs';

/**
 * Render one request across React / Svelte / Vue in parallel.
 *
 * @param {object} req { spec, data, options }
 * @returns {Promise<{results: object[], parity: boolean, mismatch: object|null}>}
 */
export async function renderAll(req) {
  const engine = await getEngine();
  const spec = req.spec;
  const options = req.options ?? {};
  const form = Promise.resolve().then(() => engine.createForm(engine.compileForm(spec, options), req.data ?? {}, options));

  const [react, svelte, vue] = await Promise.all([
    renderOne(engine, 'react', async () => engine.renderReact(await form)),
    renderOne(engine, 'svelte', async () => engine.renderSvelte(await form)),
    renderOne(engine, 'vue', async () => engine.renderVue(await form)),
  ]);

  const results = [react, svelte, vue];
  const { parity, mismatch } = compareParity(results, engine.normalizeHtml);
  return { results, parity, mismatch };
}

/**
 * Strip React 19's SSR resource-hint hoists (`<link rel="preload" as="image">`
 * emitted for an `<img src>`). A React-renderer artifact, not list markup (Vue/
 * Svelte SSR do not emit them) — the conformance gate strips the SAME bytes, so
 * the gateway must too for the React list output to match its sisters.
 */
function stripReactFloats(html) {
  return html.replace(/<link\b[^>]*\brel="preload"[^>]*>/g, '');
}

/**
 * Render supplied list rows in all three frameworks with the same layout options.
 *
 * @param {object} listSpec the list-spec (columns map; $ref/$patch composable)
 * @param {Array<object>} rows injected display rows
 * @param {object} options { language, data, pageMeta, files, basepath, layout }
 * @returns {Promise<{results: object[], parity: boolean, mismatch: object|null}>}
 */
export async function renderAllList(listSpec, rows = [], options = {}) {
  const engine = await getEngine();
  const safeRows = Array.isArray(rows) ? rows : [];
  const [react, svelte, vue] = await Promise.all([
    renderOne(engine, 'react', () =>
      stripReactFloats(engine.renderListReact(listSpec, safeRows, options))
    ),
    renderOne(engine, 'svelte', () =>
      engine.renderListSvelte(listSpec, safeRows, options)
    ),
    renderOne(engine, 'vue', () =>
      engine.renderListVue(listSpec, safeRows, options)
    ),
  ]);

  const results = [react, svelte, vue];
  const { parity, mismatch } = compareParity(results, engine.normalizeHtml);
  return { results, parity, mismatch };
}

/**
 * Run one framework's render fn (sync or async), normalize, and classify any
 * thrown error to a stable code via the framework's error classes.
 */
async function renderOne(engine, fw, fn) {
  const t0 = performance.now();
  try {
    const html = await fn();
    return {
      fw,
      ok: true,
      html,
      normalized: engine.normalizeHtml(html),
      ms: Math.round(performance.now() - t0),
      error: null,
    };
  } catch (e) {
    return {
      fw,
      ok: false,
      html: '',
      normalized: '',
      ms: Math.round(performance.now() - t0),
      error: classifyError(engine, fw, e),
    };
  }
}

/**
 * Map a thrown render error to { code, message }. ComposeLoadError carries its
 * own .code; UnsupportedFieldTypeError carries UNSUPPORTED_FIELD_TYPE. Anything
 * else surfaces as a generic RENDER_ERROR (never swallowed).
 */
function classifyError(engine, fw, e) {
  const classes = engine.errorClasses[fw] || {};
  if (e && classes.ComposeLoadError && e instanceof classes.ComposeLoadError) {
    return { code: e.code, message: e.message };
  }
  if (
    e &&
    classes.UnsupportedFieldTypeError &&
    e instanceof classes.UnsupportedFieldTypeError
  ) {
    return { code: e.code || 'UNSUPPORTED_FIELD_TYPE', message: e.message };
  }
  // Fall back to a declared `.code` if present (cross-realm instanceof can miss).
  if (e && typeof e.code === 'string') {
    return { code: e.code, message: e.message || String(e) };
  }
  return { code: 'RENDER_ERROR', message: String(e && e.message ? e.message : e) };
}

/**
 * Parity holds iff every framework that rendered (ok) shares one normalized
 * string, AND every framework that errored shares one error code. A framework
 * that fails when others succeed is a parity break.
 */
export function compareParity(results) {
  const sigs = results.map((r) => ({
    fw: r.fw,
    sig: r.ok ? `html:${r.normalized}` : `error:${r.error ? r.error.code : 'RENDER_ERROR'}`,
  }));
  const distinct = new Set(sigs.map((s) => s.sig));
  if (distinct.size <= 1) {
    return { parity: true, mismatch: null };
  }
  const groups = {};
  for (const s of sigs) {
    (groups[s.sig] ??= []).push(s.fw);
  }
  return {
    parity: false,
    mismatch: {
      groups: Object.entries(groups).map(([sig, fws]) => ({ fws, signature: sig })),
      detail: results.map((r) => ({
        fw: r.fw,
        ok: r.ok,
        normalized: r.normalized,
        error: r.error,
      })),
    },
  };
}
