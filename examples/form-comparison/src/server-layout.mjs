import { formServers, parseFormApiPath } from './runtime-paths.mjs';

// The record resource of a native server (docs/spec/form-comparison.md, "HTTP contract"). The
// views are listed here instead of imported from the record contract, whose renderers the
// public server does not load for forwarding.
const recordPath = new RegExp(`^/api/(${formServers.join('|')})`
  + '(/records(?:/(?:reset|view/(?:list|detail|form)|[^/]+))?)$');

/**
 * Resolve one accepted public API path to its internal server request: the form API of the
 * benchmark and the record resource of `php`, `php-ext`, `go` and `rust`. The public server sends
 * it to the port that it was started with for that server.
 */
export function serverRequest(pathname, search = '') {
  const record = recordPath.exec(pathname);
  if (record) {
    return { server: record[1], path: `/api${record[2]}${search}` };
  }
  const route = parseFormApiPath(pathname);
  if (!route) return null;
  return {
    server: route.server,
    path: `/api/${route.action}/${route.path}/${route.framework}${search}`,
  };
}
