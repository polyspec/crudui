// The browser matrix is defined once in runtime-paths.json, which the PHP, Go and Rust
// servers read as well.
import matrix from './runtime-paths.json' with { type: 'json' };

export const formServers = Object.freeze([...matrix.servers]);
export const formRenderingPaths = Object.freeze([...matrix.renderingPaths]);
export const formFrameworks = Object.freeze([...matrix.frameworks]);
export const formTransports = Object.freeze([...matrix.transports]);
/**
 * `ssr`: the selected server renders the form with the record and the framework takes it over;
 * `csr`: the framework mounts the form without data, then injects the record.
 */
export const formInitializations = Object.freeze([...matrix.initializations]);
/** Operation stages each initialization column runs, in order, with the same row keys. */
export const initializationStages = Object.freeze([
  'mounted', 'reinjected-1', 'reinjected-2', 'data-hidden', 'data-restored',
  'edited', 'saved', 'reloaded', 'copied', 'moved', 'copy-removed', 'added', 'saved-new',
  'collapsed-all', 'expanded-all', 'undone', 'empty', 'restored',
]);
/**
 * Comparisons of one initialization report, in execution order: the `ssr` column's own
 * idempotence and restoration, then every `csr` stage against the stored `ssr` stage.
 */
export const initializationComparisons = Object.freeze([
  'ssr/idempotence-1', 'ssr/idempotence-2', 'ssr/restoration',
  'mounted', 'reinjected-1', 'csr/idempotence-1', 'reinjected-2', 'csr/idempotence-2',
  'data-hidden', 'data-restored', 'csr/restoration',
  'edited', 'saved', 'reloaded', 'copied', 'moved', 'copy-removed', 'added', 'saved-new',
  'collapsed-all', 'expanded-all', 'undone', 'empty', 'restored',
]);
/**
 * Snapshot categories compared without normalization. The parsed DOM, not serialized HTML,
 * is compared: attribute order is not part of the DOM and browser engines create
 * attributes in different orders.
 */
export const initializationCategories = Object.freeze([
  'dom', 'controls', 'fields', 'css', 'data', 'focus', 'response',
]);
export const formActions = Object.freeze([...matrix.actions]);

const apiPattern = new RegExp(
  `^/api/(${formServers.join('|')})/(${formActions.join('|')})/`
  + `(${formRenderingPaths.join('|')})/(${formFrameworks.join('|')})$`,
);

/** Parse one complete form API path. */
export function parseFormApiPath(pathname) {
  const match = apiPattern.exec(pathname);
  return match ? {
    server: match[1], action: match[2], path: match[3], framework: match[4],
  } : null;
}

/** Return every scenario report combination for one server. */
export function reportCombinations() {
  return formRenderingPaths.flatMap(path => formFrameworks.flatMap(framework =>
    formTransports.map(transport => ({ path, framework, transport }))));
}

/** Return every initialization report combination for one server. */
export function initializationCombinations() {
  return formRenderingPaths.flatMap(path => formFrameworks.map(framework => ({ path, framework })));
}

/** Return the public browser frame URL for one rendering path and framework. */
export function framePath(path, framework) {
  if (!formRenderingPaths.includes(path)) throw new TypeError('Unknown rendering path');
  if (!formFrameworks.includes(framework)) throw new TypeError('Unknown framework');
  return `/frames/${path}-${framework}/`;
}
