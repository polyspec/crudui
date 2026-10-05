// Local server processes for the source-level record checks and the local run of the pipeline
// check: the five record servers and the public server, started from this checkout with their own
// ports, data directory and public directory. The container starts the same programs with the same
// arguments (docs/spec/form-comparison.md, "Record servers").
import assert from 'node:assert/strict';
import { execFile, fork, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
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

/** Print one progress line of the local server harness. */
function progress(write, text) {
  write(`[local-servers] ${text}\n`);
}

/**
 * The readiness line of a server: every server binds its address, port 0 included, and names the
 * address it took, so no port is chosen before the server that listens on it.
 */
const readyLine = server => new RegExp(`^CRUDUI_READY ${server} (127\\.0\\.0\\.1:\\d+)$`, 'm');
/** The loopback address on which a local server takes a port of the system. */
export const anyLoopbackPort = '127.0.0.1:0';

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
 * refreshed PHP validator copy and the Go and Rust server binaries. Every build is one step that
 * runs to its end without a time limit and prints its output and progress.
 */
export async function prepareRecordServers({ buildDirectory, write = text => process.stdout.write(text) }) {
  await orderedJsonCheckout(write);
  const goBinary = path.join(buildDirectory, 'go-server');
  const step = (id, command, args, cwd = repositoryRoot, environment = {}) =>
    ({ id, command, args, cwd, environment });
  const results = await runStages([[
    // Under the checkout lock of the vendor directory, as make reinstalls it.
    step('composer-validator', process.execPath, [path.join(repositoryRoot, 'scripts/holder-lock.mjs'), 'hold',
      path.join(repositoryRoot, 'var/locks/composer-generator-php.lock'), '--',
      'composer', '--working-dir=packages/generator-php', 'reinstall', 'crudui/validator', '--no-interaction']),
    step('crudui-php-extension', process.execPath, ['scripts/build-crudui-php-extension.mjs']),
    step('ordered-json-php-extension', process.execPath, ['scripts/build-ordered-json-php-extension.mjs',
      '--source', path.join(localOrderedJsonDirectory, 'php-extension/src')]),
    step('go-server', 'go', ['build', '-trimpath', '-o', goBinary, '.'],
      path.join(exampleDirectory, 'servers/go'), { CGO_ENABLED: '0' }),
    step('rust-server', process.execPath, [path.join(repositoryRoot, 'scripts/run-rust-command.mjs'),
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
      rust: path.join(exampleDirectory, 'servers/rust/target/debug/polyspec-crudui-form-comparison'),
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
 * its public directory and the source identity file; PHP takes them from its environment, which
 * PHP-FPM passes on to api.php.
 */
export async function recordServerProcess(server, { dataDirectory, publicDirectory, prepared }) {
  assert.ok(recordServers.includes(server), `Unknown record server: ${server}`);
  const address = anyLoopbackPort;
  const sourceFile = path.join(publicDirectory, 'source.json');
  if (server === 'php' || server === 'php-ext') {
    const common = [...await phpExtensionArguments('mbstring'), ...await phpExtensionArguments('dom')];
    const extensions = server === 'php-ext'
      ? ['-d', `extension=${prepared.orderedJsonModule}`, '-d', `extension=${prepared.cruduiModule}`] : [];
    return {
      server, address,
      command: process.execPath,
      args: [path.join(exampleDirectory, 'servers/php/main.mjs'), address, `${dataDirectory}-${server}-run`, '--',
        '-n', ...common, ...extensions, '-d', 'enable_post_data_reading=0', '-d', 'display_errors=0', '-d', 'log_errors=1'],
      environment: {
        FORM_PHP_SERVER: server,
        FORM_DATA_DIRECTORY: dataDirectory,
        FORM_PUBLIC_DIRECTORY: publicDirectory,
        FORM_ORDERED_JSON_PHP_SOURCE: prepared.orderedJsonPhpSource,
        ...(server === 'php-ext' ? {
          FORM_CRUDUI_MODULE_SHA256: createHash('sha256').update(await readFile(prepared.cruduiModule)).digest('hex'),
        } : {}),
      },
      ready: readyLine(server),
    };
  }
  const programArguments = [address, dataDirectory, publicDirectory, sourceFile];
  if (server === 'js') {
    return {
      server, address, command: process.execPath,
      args: [path.join(exampleDirectory, 'servers/javascript/main.mjs'), ...programArguments],
      environment: {}, ready: readyLine('js'),
    };
  }
  return {
    server, address, command: prepared.binaries[server], args: programArguments, environment: {},
    ready: readyLine(server),
  };
}

// Every process group a local stack started and has not stopped. A test process that ends without
// stopping them, for example after a failed hook and a forced exit, stops them at its exit, so no
// server outlives the run that started it.
const startedGroups = new Set();
process.on('exit', () => {
  for (const pid of startedGroups) {
    try { process.kill(-pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH' && error.code !== 'EPERM') throw error; }
  }
});

/**
 * Start one process and wait for its readiness line, then require that it answers on the address
 * that the line names. A process start is a long operation without a time limit: it prints a line with its
 * elapsed time every heartbeat while it waits, and a process that exits before its readiness fails
 * with its output.
 */
export async function startProcess(definition, { write = text => process.stdout.write(text), ipc = false, message } = {}) {
  const started = performance.now();
  progress(write, `${definition.server}: starting on ${definition.address}`);
  const options = {
    env: { ...process.env, ...definition.environment }, detached: true,
    stdio: ipc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
  };
  const child = ipc
    ? fork(definition.args[0], definition.args.slice(1), { ...options, execPath: definition.command })
    : spawn(definition.command, definition.args, options);
  if (message) child.send(message);
  startedGroups.add(child.pid);
  child.once('exit', () => startedGroups.delete(child.pid));
  let output = '';
  let address;
  const ready = new Promise((resolve, reject) => {
    const timer = setInterval(() => progress(write,
      `${definition.server}: waiting for readiness (${formatDuration(performance.now() - started)})`), stepHeartbeatMs);
    const onData = chunk => {
      const text = chunk.toString();
      output += text;
      for (const line of text.split('\n').filter(Boolean)) write(`[${definition.server}] ${line}\n`);
      const announced = definition.ready.exec(output);
      if (announced) { clearInterval(timer); address = announced[1]; resolve(); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('error', error => { clearInterval(timer); reject(error); });
    child.once('exit', (code, signal) => {
      clearInterval(timer);
      reject(new Error(`${definition.server} exited (${signal ?? code}) before readiness:\n${output}`));
    });
  });
  try {
    await ready;
    const origin = `http://${address}`;
    try {
      await fetch(`${origin}/`, { signal: AbortSignal.timeout(5_000) });
    } catch (error) {
      throw new Error(`${definition.server} announced readiness on ${address} but does not listen there`, { cause: error });
    }
    progress(write, `${definition.server}: ready on ${address} in ${formatDuration(performance.now() - started)}`);
    return { child, origin, address, port: Number(address.slice(address.lastIndexOf(':') + 1)), stop: () => killProcessTree(child, 2_000) };
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
export function publicServerDefinition({ dataDirectory, publicDirectory, ports }) {
  const address = anyLoopbackPort;
  return {
    server: 'public', address, command: process.execPath,
    args: [path.join(exampleDirectory, 'server.mjs'), address, dataDirectory, publicDirectory, JSON.stringify(ports)],
    environment: {}, ready: readyLine('public'),
  };
}
