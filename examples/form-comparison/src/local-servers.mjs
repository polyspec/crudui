// Local server processes for the source-level record checks and the local run of the pipeline
// check: the five record servers and the public server, started from this checkout with their own
// ports, data directory and public directory. The container starts the same programs with the same
// arguments (docs/spec/form-comparison.md, "Record servers").
import assert from 'node:assert/strict';
import { execFile, fork, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { recordFixtureFile, recordServers, recordSpecsFile } from './record-contract.mjs';
import { installOrderedJson, orderedJsonRevision } from './ordered-json-source.mjs';
import { sourceIdentity } from './source-tree.mjs';
import { formatDuration, killProcessTree, runStages, stepHeartbeatMs } from './step-runner.mjs';

const execFileAsync = promisify(execFile);
export const exampleDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repositoryRoot = path.resolve(exampleDirectory, '../..');
/**
 * The host checkout of the pinned OrderedJSON monorepo. The Go and Rust server manifests name this
 * path relative to the repository root, as the build tree does.
 */
export const localOrderedJsonDirectory = path.join(repositoryRoot, '.form-comparison/sources/ordered-json');
/** A started process announces readiness within this limit (the record servers measured 0.07 to 0.44 s). */
export const processStartLimitMs = 30_000;

/** Print one progress line of the local server harness. */
function progress(write, text) {
  write(`[local-servers] ${text}\n`);
}

/** Reserve a free loopback port. */
export async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function orderedJsonCheckout(write) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', localOrderedJsonDirectory, 'rev-parse', 'HEAD']);
    const { stdout: changes } = await execFileAsync('git', ['-C', localOrderedJsonDirectory, 'status', '--porcelain', '--untracked-files=no']);
    if (stdout.trim() === orderedJsonRevision && changes.trim() === '') {
      progress(write, `ordered-json checkout: ${orderedJsonRevision} present`);
      return;
    }
  } catch { /* no checkout yet */ }
  const started = performance.now();
  progress(write, 'ordered-json checkout: started');
  const heartbeat = setInterval(() => progress(write,
    `ordered-json checkout: running ${formatDuration(performance.now() - started)}`), stepHeartbeatMs);
  try {
    await installOrderedJson(localOrderedJsonDirectory);
  } finally {
    clearInterval(heartbeat);
  }
  progress(write, `ordered-json checkout: passed in ${formatDuration(performance.now() - started)}`);
}

/**
 * Build what the five record servers run: the OrderedJSON checkout, both PHP extensions, the
 * refreshed PHP validator copy and the Go and Rust server binaries. Every build is one step with
 * its own timeout. Measured with warm caches: validator copy 2.2 s, extensions 4.5 and 4.8 s, Go
 * 8.8 s, Rust debug build 15 s; the limits are those of the container's cold builds of the same
 * targets (docs/spec/form-comparison.md, "Build cycles").
 */
export async function prepareRecordServers({ buildDirectory, write = text => process.stdout.write(text) }) {
  await orderedJsonCheckout(write);
  const goBinary = path.join(buildDirectory, 'go-server');
  const step = (id, timeoutMs, command, args, cwd = repositoryRoot, environment = {}) =>
    ({ id, timeoutMs, command, args, cwd, environment });
  const results = await runStages([[
    step('composer-validator', 120_000, 'composer',
      ['--working-dir=packages/generator-php', 'reinstall', 'crudui/validator', '--no-interaction']),
    step('crudui-php-extension', 180_000, process.execPath, ['scripts/build-crudui-php-extension.mjs']),
    step('ordered-json-php-extension', 180_000, process.execPath, ['scripts/build-ordered-json-php-extension.mjs',
      '--source', path.join(localOrderedJsonDirectory, 'php-extension/src')]),
    step('go-server', 300_000, 'go', ['build', '-trimpath', '-o', goBinary, '.'],
      path.join(exampleDirectory, 'servers/go'), { CGO_ENABLED: '0' }),
    step('rust-server', 900_000, process.execPath, [path.join(repositoryRoot, 'scripts/run-rust-command.mjs'),
      'build', '--locked'], path.join(exampleDirectory, 'servers/rust')),
  ]], { label: 'local-servers', write });
  const failed = results.find(result => result.status !== 'passed');
  assert.equal(failed, undefined, `Building ${failed?.id} ${failed?.status}`);
  return {
    orderedJsonPhpSource: path.join(localOrderedJsonDirectory, 'php/src/OrderedJson.php'),
    cruduiModule: path.join(repositoryRoot, 'packages/php-ext/modules/crudui.so'),
    orderedJsonModule: path.join(localOrderedJsonDirectory, 'php-extension/src/modules/ordered_json.so'),
    binaries: {
      go: goBinary,
      rust: path.join(exampleDirectory, 'servers/rust/target/debug/crudui-form-comparison'),
    },
  };
}

/**
 * Write the files a record server reads from its public directory: the shared fixture, the record
 * specifications, the browser matrix and the source identity of this checkout.
 */
export async function recordPublicDirectory(directory) {
  await mkdir(directory, { recursive: true });
  await copyFile(path.join(exampleDirectory, 'fixtures', recordFixtureFile), path.join(directory, recordFixtureFile));
  await copyFile(path.join(exampleDirectory, 'fixtures', recordSpecsFile), path.join(directory, recordSpecsFile));
  await copyFile(path.join(exampleDirectory, 'src/runtime-paths.json'), path.join(directory, 'runtime-paths.json'));
  await writeFile(path.join(directory, 'source.json'), JSON.stringify(await sourceIdentity(repositoryRoot)) + '\n');
  return directory;
}

async function phpExtensionArguments(name) {
  try {
    await execFileAsync('php', ['-n', '-r', `exit(extension_loaded(${JSON.stringify(name)}) ? 0 : 1);`]);
    return [];
  } catch {
    return ['-d', `extension=${name}`];
  }
}

/**
 * The process of one record server. Every server takes its listening address, its data directory,
 * its public directory and the source identity file; PHP takes them from its environment because
 * the built-in server owns its command line.
 */
export async function recordServerProcess(server, { port, dataDirectory, publicDirectory, prepared }) {
  assert.ok(recordServers.includes(server), `Unknown record server: ${server}`);
  const address = `127.0.0.1:${port}`;
  const sourceFile = path.join(publicDirectory, 'source.json');
  if (server === 'php' || server === 'php-ext') {
    const common = [...await phpExtensionArguments('mbstring'), ...await phpExtensionArguments('dom')];
    const extensions = server === 'php-ext'
      ? ['-d', `extension=${prepared.orderedJsonModule}`, '-d', `extension=${prepared.cruduiModule}`] : [];
    return {
      server, address,
      command: 'php',
      args: ['-n', ...common, ...extensions, '-d', 'max_input_vars=10000', '-d', 'post_max_size=2M', '-d', 'display_errors=0', '-d', 'log_errors=1',
        '-S', address, '-t', publicDirectory, path.join(exampleDirectory, 'api.php')],
      environment: {
        FORM_PHP_SERVER: server,
        FORM_DATA_DIRECTORY: dataDirectory,
        FORM_PUBLIC_DIRECTORY: publicDirectory,
        FORM_ORDERED_JSON_PHP_SOURCE: prepared.orderedJsonPhpSource,
        ...(server === 'php-ext' ? {
          FORM_CRUDUI_MODULE_SHA256: createHash('sha256').update(await readFile(prepared.cruduiModule)).digest('hex'),
        } : {}),
      },
      ready: new RegExp(`Development Server \\(http://127\\.0\\.0\\.1:${port}\\) started`),
    };
  }
  const programArguments = [address, dataDirectory, publicDirectory, sourceFile];
  if (server === 'js') {
    return {
      server, address, command: process.execPath,
      args: [path.join(exampleDirectory, 'servers/javascript/main.mjs'), ...programArguments],
      environment: {}, ready: /^CRUDUI_READY js$/m,
    };
  }
  return {
    server, address, command: prepared.binaries[server], args: programArguments, environment: {},
    ready: new RegExp(`^CRUDUI_READY ${server}$`, 'm'),
  };
}

/**
 * Start one process and wait for its readiness line, then require that it answers on the requested
 * address. A process that exits, or stays silent past its start limit, fails with its output.
 */
export async function startProcess(definition, { write = text => process.stdout.write(text), ipc = false, message } = {}) {
  const started = performance.now();
  progress(write, `${definition.server}: starting on ${definition.address} (limit ${formatDuration(processStartLimitMs)})`);
  const options = {
    env: { ...process.env, ...definition.environment }, detached: true,
    stdio: ipc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
  };
  const child = ipc
    ? fork(definition.args[0], definition.args.slice(1), { ...options, execPath: definition.command })
    : spawn(definition.command, definition.args, options);
  if (message) child.send(message);
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(
      `${definition.server} did not announce readiness within ${formatDuration(processStartLimitMs)}:\n${output}`)),
    processStartLimitMs);
    const onData = chunk => {
      const text = chunk.toString();
      output += text;
      for (const line of text.split('\n').filter(Boolean)) {
        if (!/^\[[^\]]+\] [\d.:]+ (?:Accepted|Closing)$/.test(line)) write(`[${definition.server}] ${line}\n`);
      }
      if (definition.ready.test(output)) { clearTimeout(timer); resolve(); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`${definition.server} exited (${signal ?? code}) before readiness:\n${output}`));
    });
  });
  try {
    await ready;
    const origin = `http://${definition.address}`;
    try {
      await fetch(`${origin}/`, { signal: AbortSignal.timeout(5_000) });
    } catch (error) {
      throw new Error(`${definition.server} announced readiness but does not listen on ${definition.address}`, { cause: error });
    }
    progress(write, `${definition.server}: ready in ${formatDuration(performance.now() - started)}`);
    return { child, origin, stop: () => killProcessTree(child, 2_000) };
  } catch (error) {
    await killProcessTree(child, 1_000);
    throw error;
  }
}

/**
 * The public server of a local stack. It takes its address, data directory, public directory and the
 * port of every native record server, and receives the build state from its parent over IPC as it
 * does from the supervisor.
 */
export function publicServerDefinition({ port, dataDirectory, publicDirectory, ports }) {
  const address = `127.0.0.1:${port}`;
  return {
    server: 'public', address, command: process.execPath,
    args: [path.join(exampleDirectory, 'server.mjs'), address, dataDirectory, publicDirectory, JSON.stringify(ports)],
    environment: {}, ready: /^CRUDUI_READY public$/m,
  };
}
