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
/** The supervisor's current build state, replaced at every change and progress report. */
export const buildStateFile = path.join(stateDirectory, 'build-state.json');
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
      // A startup warning, such as an exceeded post_max_size, must not reach a response body.
      args: [...extensions, '-d', 'max_input_vars=10000', '-d', 'post_max_size=2M',
        '-d', 'display_errors=0', '-d', 'log_errors=1', '-S', address, '-t', publicDirectory, path.join(exampleDirectory, 'api.php')],
      environment: {
        FORM_PHP_SERVER: server,
        FORM_DATA_DIRECTORY: dataDirectory,
        FORM_PUBLIC_DIRECTORY: publicDirectory,
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

/**
 * Return the public HTTP process, which serves the page, answers the `js` records and forwards
 * the other API requests. It takes its address, its data directory, its public directory and the
 * ports of the native servers.
 */
export function publicServerProcess() {
  return {
    server: 'public',
    command: process.execPath,
    args: [path.join(exampleDirectory, 'server.mjs'), `0.0.0.0:${publicPort}`, dataDirectory, publicDirectory,
      JSON.stringify(serverPorts)],
    environment: {
      CRUDUI_CROSS_CHECK_GO_VALIDATOR: path.join(binaryDirectory, 'validator-go'),
      CRUDUI_CROSS_CHECK_RUST_VALIDATOR: path.join(binaryDirectory, 'validator-rust'),
    },
    ready: streamReadiness('public', 'CRUDUI_READY public'),
  };
}

// The record resource of a native server (docs/spec/form-comparison.md, "HTTP contract"). The
// views are listed here instead of imported from the record contract, whose renderers the
// supervisor does not load.
const recordPath = new RegExp(`^/api/(${formServers.join('|')})`
  + '(/records(?:/(?:reset|view/(?:list|detail|form)|[^/]+))?)$');

/**
 * Resolve one accepted public API path to its internal server request: the form API of the
 * benchmark and the record resource of `php`, `php-ext`, `go` and `rust`.
 */
export function serverRequest(pathname, search = '') {
  const record = recordPath.exec(pathname);
  if (record) {
    return { server: record[1], port: serverPorts[record[1]], path: `/api${record[2]}${search}` };
  }
  const route = parseFormApiPath(pathname);
  if (!route) return null;
  return {
    server: route.server,
    port: serverPorts[route.server],
    path: `/api/${route.action}/${route.path}/${route.framework}${search}`,
  };
}
