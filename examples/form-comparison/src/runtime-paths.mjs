export const formServers = Object.freeze(['php', 'php-ext', 'go', 'rust']);
export const formRenderingPaths = Object.freeze(['bindForm', 'createForm']);
export const formFrameworks = Object.freeze(['react', 'vue', 'svelte']);
export const formTransports = Object.freeze(['form', 'json']);
/** `data` creates the form with record data; `inject` mounts the form, then injects the record. */
export const formInitializations = Object.freeze(['data', 'inject']);
/** Operation stages each initialization column runs, in order, with the same row keys. */
export const initializationStages = Object.freeze([
  'mounted', 'reinjected-1', 'reinjected-2', 'data-hidden', 'data-restored',
  'edited', 'saved', 'reloaded', 'copied', 'moved', 'copy-removed', 'added', 'saved-new',
  'collapsed-all', 'expanded-all', 'undone', 'empty', 'restored',
]);
/**
 * Comparisons of one initialization report, in execution order: the `data` column's own
 * idempotence and restoration, then every `inject` stage against the stored `data` stage.
 */
export const initializationComparisons = Object.freeze([
  'data/idempotence-1', 'data/idempotence-2', 'data/restoration',
  'mounted', 'reinjected-1', 'inject/idempotence-1', 'reinjected-2', 'inject/idempotence-2',
  'data-hidden', 'data-restored', 'inject/restoration',
  'edited', 'saved', 'reloaded', 'copied', 'moved', 'copy-removed', 'added', 'saved-new',
  'collapsed-all', 'expanded-all', 'undone', 'empty', 'restored',
]);
/** Snapshot categories compared without normalization. */
export const initializationCategories = Object.freeze([
  'html', 'dom', 'controls', 'fields', 'css', 'data', 'focus', 'response',
]);
export const formActions = Object.freeze([
  'load', 'save', 'validate', 'reset', 'compile', 'render', 'ssr',
]);

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
