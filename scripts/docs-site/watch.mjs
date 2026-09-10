import { watch } from 'node:fs';
import { isAbsolute, relative } from 'node:path';

function generatedPath(directory, filename) {
  if (filename === null || filename === undefined) return false;
  const value = filename.toString();
  const local = (isAbsolute(value) ? relative(directory, value) : value)
    .replaceAll('\\', '/');
  return local === '.site' || local.startsWith('.site/');
}

/** Subscribe to documentation source events and serialize requested rebuilds. */
export function watchDocumentation(directory, rebuild, options = {}) {
  if (typeof rebuild !== 'function') throw new TypeError('Documentation rebuild must be a function');
  const subscribe = options.watch ?? watch;
  const onBuildError = options.onBuildError;
  if (typeof subscribe !== 'function' || typeof onBuildError !== 'function') {
    throw new TypeError('Documentation watch requires event and error handlers');
  }

  let closed = false;
  let active = options.paused !== true;
  let requested = false;
  let running;

  async function drain() {
    while (requested && !closed) {
      requested = false;
      try {
        await rebuild();
      } catch (error) {
        onBuildError(error);
      }
    }
  }

  function request() {
    if (closed) return;
    requested = true;
    if (!active || running) return;
    running = (async () => {
      try {
        await drain();
      } finally {
        running = undefined;
        if (requested && !closed) request();
      }
    })();
  }

  async function idle() {
    const current = running;
    if (!current) return;
    await current;
    if (running && running !== current) await idle();
  }

  const watcher = subscribe(directory, { recursive: true }, (_event, filename) => {
    if (!generatedPath(directory, filename)) request();
  });

  return {
    watcher,
    idle,
    resume() {
      if (closed) throw new Error('Documentation watch is closed');
      active = true;
      if (requested) request();
    },
    close() {
      closed = true;
      active = false;
      requested = false;
      watcher.close();
    },
  };
}
