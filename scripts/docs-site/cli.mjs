#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDocumentationSite } from './build.mjs';
import { documentationBasePath } from './paths.mjs';
import { createDocumentationServer } from './server.mjs';
import { watchDocumentation } from './watch.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DOCS = join(ROOT, 'docs');
const OUTPUT = join(DOCS, '.site', 'dist');
const BASE_PATH = documentationBasePath(process.env.DOCS_BASE_PATH);

async function build() {
  const report = await buildDocumentationSite({ repositoryRoot: ROOT, docsDirectory: DOCS, outputDirectory: OUTPUT, basePath: BASE_PATH });
  process.stdout.write(`[docs-site] ${report.documents} documents, ${report.pages} pages, ${report.assets} assets\n`);
}

function argument(name, defaultValue) {
  const index = process.argv.indexOf(name);
  return index === -1 ? defaultValue : process.argv[index + 1];
}

async function serve(development) {
  const host = argument('--host', '127.0.0.1');
  const port = Number(argument('--port', development ? '5173' : '4173'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be an integer from 1 to 65535');
  let sourceWatcher;
  let watchFailure;
  let handleRuntimeWatchFailure;
  const startupBuildFailures = [];
  let reportBuildError = error => startupBuildFailures.push(error);
  const receiveWatchFailure = error => {
    if (handleRuntimeWatchFailure) handleRuntimeWatchFailure(error);
    else watchFailure ??= error;
  };
  if (development) {
    sourceWatcher = watchDocumentation(DOCS, build, {
      paused: true,
      onBuildError: error => reportBuildError(error),
    });
    sourceWatcher.watcher.on('error', receiveWatchFailure);
  }
  try {
    await build();
    if (development) {
      sourceWatcher.resume();
      await sourceWatcher.idle();
      if (watchFailure) throw watchFailure;
      if (startupBuildFailures.length) throw startupBuildFailures.at(-1);
    }
  } catch (error) {
    sourceWatcher?.close();
    throw error;
  }
  if (development) {
    reportBuildError = error => {
      process.stderr.write(`[docs-site] rebuild failed: ${error.stack ?? error.message}\n`);
    };
  }
  const server = createDocumentationServer({ outputDirectory: OUTPUT, basePath: BASE_PATH });
  try {
    await new Promise((accept, reject) => {
      server.once('error', reject);
      server.listen(port, host, accept);
    });
  } catch (error) {
    sourceWatcher?.close();
    throw error;
  }
  process.stdout.write(`[docs-site] http://${host}:${port}${BASE_PATH}\n`);
  let stopping = false;
  const stop = (status = 0) => {
    if (stopping) return;
    stopping = true;
    sourceWatcher?.close();
    server.close(error => {
      if (error) {
        process.stderr.write(`[docs-site] server close failed: ${error.stack ?? error.message}\n`);
        process.exitCode = 1;
      } else process.exitCode = status;
    });
  };
  if (development) {
    handleRuntimeWatchFailure = error => {
      process.stderr.write(`[docs-site] source watch failed: ${error.stack ?? error.message}\n`);
      stop(1);
    };
    if (watchFailure) handleRuntimeWatchFailure(watchFailure);
  }
  process.once('SIGINT', () => stop());
  process.once('SIGTERM', () => stop());
}

const command = process.argv[2] ?? 'build';
if (command === 'build') await build();
else if (command === 'dev') await serve(true);
else if (command === 'preview') await serve(false);
else throw new Error('Use build, dev or preview');
