/**
 * 3-framework CRUDUI SSR fan-out (React / Svelte sync, Vue async) — all in-process.
 *
 * Every framework renders through the SAME shared core (buildForm: compose →
 * design/expr eval → i18n → FieldViewModel tree); the adapter just serializes.
 * The gateway calls the exact CRUDUI entries the conformance gate imports, with the
 * byte-identical call shape `render(c) = renderFn(spec, { ...options, data })`, so
 * the console's render output == the AI gate's fixture output.
 *
 *   request : { spec, data, options:{ language, unsupported } }
 *   per fw  : { fw, ok, html, normalized, ms, error:{code,message}|null }
 *
 * normalized is normalizeHtml(html) — the shared parity key. parity holds iff all
 * three frameworks share one normalized string.
 *
 * A render FAILURE surfaces with a stable `code` (never a silent ''):
 *   REF_FILE_NOT_FOUND     — unresolved $ref (ComposeLoadError, a LOAD failure)
 *   UNSUPPORTED_FIELD_TYPE — un-ported field type with options.unsupported:'throw'
 * (the same ERROR_CLASS_BY_CODE keys the conformance tests assert).
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
  const options = { ...(req.options ?? {}), data: req.data ?? {} };

  const [react, svelte, vue] = await Promise.all([
    renderOne(engine, 'react', () => engine.renderReact(spec, options)),
    renderOne(engine, 'svelte', () => engine.renderSvelte(spec, options)),
    renderOne(engine, 'vue', () => engine.renderVue(spec, options)),
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
