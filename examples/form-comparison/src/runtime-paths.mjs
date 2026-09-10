export const formServers = Object.freeze(['php', 'php-ext', 'go', 'rust']);
export const formRenderingPaths = Object.freeze(['bindForm', 'createForm']);
export const formFrameworks = Object.freeze(['react', 'vue', 'svelte']);
export const formTransports = Object.freeze(['form', 'json']);
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

/** Return every browser report combination for one server. */
export function reportCombinations() {
  return formRenderingPaths.flatMap(path => formFrameworks.flatMap(framework =>
    formTransports.map(transport => ({ path, framework, transport }))));
}

/** Return the public browser frame URL for one rendering path and framework. */
export function framePath(path, framework) {
  if (!formRenderingPaths.includes(path)) throw new TypeError('Unknown rendering path');
  if (!formFrameworks.includes(framework)) throw new TypeError('Unknown framework');
  return `/frames/${path}-${framework}/`;
}
