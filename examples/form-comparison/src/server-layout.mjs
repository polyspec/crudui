import path from 'node:path';

import { formServers, parseFormApiPath } from './runtime-paths.mjs';

/** The repository, mounted read-only. It is the only source the container reads. */
export const sourceMount = '/workspace/source';
/** Container-owned build volume: the synchronized build tree and every build output. */
export const buildDirectory = '/workspace/build';
/** Git-visible files of the mounted repository, copied so builds can write next to them. */
export const treeDirectory = path.join(buildDirectory, 'tree');
export const publicDirectory = path.join(buildDirectory, 'public');
export const binaryDirectory = path.join(buildDirectory, 'bin');
export const stateDirectory = path.join(buildDirectory, 'state');
export const cargoTargetDirectory = path.join(buildDirectory, 'cargo-target');
/** Container-owned cache volume for package managers and compilers. */
export const cacheDirectory = '/workspace/cache';
export const dataDirectory = '/data';
export const resultsDirectory = '/results';
/** The source identity every server and frame reads at run time. */
export const sourceIdentityFile = path.join(publicDirectory, 'source.json');
export const orderedJsonDirectory =
  path.join(treeDirectory, '.form-comparison/sources/ordered-json');
export const cruduiModule = path.join(treeDirectory, 'packages/php-ext/modules/crudui.so');
export const orderedJsonModule =
  path.join(orderedJsonDirectory, 'php-extension/src/modules/ordered_json.so');
export const publicPort = 8080;
export const publicOrigin = `http://127.0.0.1:${publicPort}`;
export const serverPorts = Object.freeze({
  php: 8081,
  'php-ext': 8088,
  go: 8082,
  rust: 8085,
});
const exampleDirectory = path.join(treeDirectory, 'examples/form-comparison');

function streamReadiness(server, line) {
  return {
    stream: 'stderr',
    pattern: new RegExp('(?:^|\\n)' + line.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\n|$)'),
    example: line + '\n',
  };
}

/** Return the process definition of one API server built from the build tree. */
export function serverProcess(server, { cruduiModuleSha256 } = {}) {
  if (!formServers.includes(server)) throw new TypeError('Unknown server: ' + server);
  const address = `127.0.0.1:${serverPorts[server]}`;
  if (server === 'php' || server === 'php-ext') {
    if (server === 'php-ext' && !/^[a-f0-9]{64}$/.test(cruduiModuleSha256 ?? '')) {
      throw new TypeError('The PHP extension process requires the built module digest');
    }
    const extensions = server === 'php-ext'
      ? ['-d', `extension=${orderedJsonModule}`, '-d', `extension=${cruduiModule}`]
      : [];
    return {
      server,
      command: 'php',
      args: [...extensions, '-d', 'max_input_vars=10000', '-d', 'post_max_size=2M',
        '-S', address, '-t', publicDirectory, path.join(exampleDirectory, 'api.php')],
      environment: {
        FORM_PHP_SERVER: server,
        FORM_ORDERED_JSON_PHP_SOURCE: `${orderedJsonDirectory}/php/src/OrderedJson.php`,
        ...(server === 'php-ext' ? { FORM_CRUDUI_MODULE_SHA256: cruduiModuleSha256 } : {}),
      },
      ready: {
        stream: 'stderr',
        pattern: new RegExp('Development Server \\(http://127\\.0\\.0\\.1:'
          + serverPorts[server] + '\\) started'),
        example: 'PHP Development Server (http://127.0.0.1:'
          + serverPorts[server] + ') started',
      },
    };
  }
  return {
    server,
    command: path.join(binaryDirectory, server),
    args: [address, dataDirectory, publicDirectory, sourceIdentityFile],
    environment: {},
    ready: streamReadiness(server, 'CRUDUI_READY ' + server),
  };
}

/** Return the public HTTP process, which serves the page and forwards API requests. */
export function publicServerProcess() {
  return {
    server: 'public',
    command: process.execPath,
    args: [path.join(exampleDirectory, 'server.mjs')],
    environment: {},
    ready: streamReadiness('public', 'CRUDUI_READY public'),
  };
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
