import path from 'node:path';

import { formServers, parseFormApiPath } from './runtime-paths.mjs';

export const sourceArchiveFile = '/archives/source.tar';
export const sourceDirectory = '/workspace/source';
export const orderedJsonDirectory =
  '/workspace/source/.form-comparison/sources/ordered-json';
export const publicDirectory = '/workspace/public';
export const dataDirectory = '/data';
export const serverPorts = Object.freeze({
  php: 8081,
  'php-ext': 8088,
  go: 8082,
  rust: 8085,
});

/** Return the four server processes for one candidate source archive. */
export function serverProcesses(archiveSha256, cruduiModuleSha256) {
  const phpApi = path.join(sourceDirectory, 'examples/form-comparison/api.php');
  return formServers.map(server => {
    const address = `127.0.0.1:${serverPorts[server]}`;
    if (server === 'php' || server === 'php-ext') {
      const extensions = server === 'php-ext'
        ? ['-d', 'extension=/opt/ordered_json.so', '-d', 'extension=/opt/crudui.so']
        : [];
      return {
        server,
        command: 'php',
        args: [...extensions, '-d', 'max_input_vars=10000', '-d', 'post_max_size=2M',
          '-S', address, '-t', publicDirectory, phpApi],
        environment: {
          FORM_PHP_SERVER: server,
          FORM_CRUDUI_ARCHIVE_SHA256: archiveSha256,
          FORM_ORDERED_JSON_PHP_SOURCE:
            `${orderedJsonDirectory}/php/src/OrderedJson.php`,
          ...(server === 'php-ext'
            ? { FORM_CRUDUI_MODULE_SHA256: cruduiModuleSha256 } : {}),
        },
      };
    }
    return {
      server,
      command: `/workspace/bin/${server}`,
      args: [address, dataDirectory, publicDirectory],
      environment: {},
    };
  });
}

/** Resolve one accepted public API path to its internal server request. */
export function serverRequest(pathname, search = '') {
  const route = parseFormApiPath(pathname);
  if (!route) return null;
  return {
    server: route.server,
    port: serverPorts[route.server],
    path: `/api/${route.action}/${route.path}/${route.framework}${search}`,
  };
}
