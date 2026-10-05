// The host's source watcher of the comparison service (docs/spec/form-comparison.md, "Natural
// application"). File events of the macOS host do not reach the Linux container through the VM
// file share, so this host process subscribes to the file events of the working tree (fs.watch,
// recursive: FSEvents on macOS) and, for every event, signals the supervisor inside the container
// (`container exec ... source-changed.mjs`), which then compares the mounted repository with Git.
// Events that arrive while a signal is delivered make one more delivery after it. The watcher has
// no time limit; it prints its start, every event and every delivery with its elapsed time, and a
// failed watch or delivery ends it with its error.
//   node examples/form-comparison/source-events.mjs   (make deploy-watch)
import { spawn } from 'node:child_process';
import { watch as watchFiles } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deploymentContainer, sourceChangeCommand } from './comparison-deployment.mjs';
import { containerRuntime } from './container-runtime.mjs';
import { changeRequests } from './src/change-requests.mjs';
import { formatDuration } from './src/step-runner.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Watch `root` and deliver one signal for each event, coalescing the events that arrive during a
 * delivery. `watch(root, onEvent, onError)` subscribes and returns the function that stops it;
 * `deliver()` sends one signal. Rejects when the watch fails or a delivery fails, with that error,
 * and resolves when `stop` aborts, after it closed the watch.
 */
export function watchSourceEvents({ root, watch, deliver, write = text => process.stdout.write(text), stop: stopSignal }) {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    let deliveries = 0;
    const fail = error => {
      stop();
      write(`[source-events] failed: ${error.message}\n`);
      reject(error);
    };
    const requests = changeRequests(async () => {
      const number = ++deliveries;
      const started = performance.now();
      write(`[source-events] delivery ${number}: signalling the supervisor\n`);
      await deliver();
      write(`[source-events] delivery ${number}: delivered in ${formatDuration(performance.now() - started)}\n`);
    });
    write(`[source-events] watching ${root}\n`);
    stop = watch(root, (event, file) => {
      write(`[source-events] ${event} ${file ?? ''}\n`);
      requests.request()?.catch(fail);
    }, fail);
    stopSignal?.addEventListener('abort', () => {
      stop();
      write(`[source-events] stopped after ${deliveries} ${deliveries === 1 ? 'delivery' : 'deliveries'}\n`);
      resolve();
    }, { once: true });
  });
}

async function main() {
  const runtime = await containerRuntime();
  const args = sourceChangeCommand(deploymentContainer);
  // SIGINT and SIGTERM stop the watcher: it closes its watch and prints its stop.
  const stop = new AbortController();
  for (const name of ['SIGINT', 'SIGTERM']) process.once(name, () => stop.abort());
  await watchSourceEvents({
    stop: stop.signal,
    root: repositoryRoot,
    watch: (root, onEvent, onError) => {
      const watcher = watchFiles(root, { recursive: true }, onEvent);
      watcher.on('error', onError);
      return () => watcher.close();
    },
    deliver: () => new Promise((resolve, reject) => {
      const child = spawn(runtime.executable, args, { env: runtime.environment, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
      child.stderr.setEncoding('utf8').on('data', chunk => { output += chunk; });
      child.once('error', reject);
      child.once('close', (code, signal) => (code === 0 ? resolve()
        : reject(new Error(`${path.basename(runtime.executable)} ${args.join(' ')} ended with ${signal ?? code}: ${output.trim()}`))));
    }),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
