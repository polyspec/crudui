#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDocumentationWeb } from './build.mts';
import { documentationBasePath } from './paths.mts';
import { createDocumentationServer } from './server.mts';
import { watchDocumentation, type DocumentationWatch } from './watch.mts';
/** The stack of a caught Error, or its message when it has no stack, or the caught value as text. */
const errorReport = (error: unknown): string => (error instanceof Error ? error.stack ?? error.message : String(error));


const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DOCS = join(ROOT, 'docs');
const OUTPUT = join(DOCS, '.web', 'dist');
const BASE_PATH = documentationBasePath(process.env.DOCS_BASE_PATH);

async function build(): Promise<void> {
  const report = await buildDocumentationWeb({ repositoryRoot: ROOT, docsDirectory: DOCS, outputDirectory: OUTPUT, basePath: BASE_PATH });
  process.stdout.write(`[docs-web] ${report.documents} documents, ${report.pages} pages, ${report.assets} assets\n`);
}

function argument(name: string, defaultValue: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? defaultValue : process.argv[index + 1];
}

async function serve(development: boolean): Promise<void> {
  const host = argument('--host', '127.0.0.1');
  const port = Number(argument('--port', development ? '5173' : '4173'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be an integer from 1 to 65535');
  let sourceWatcher: DocumentationWatch | undefined;
  let watchFailure: Error | undefined;
  let handleRuntimeWatchFailure: ((error: Error) => void) | undefined;
  const startupBuildFailures: unknown[] = [];
  let reportBuildError: (error: unknown) => void = error => startupBuildFailures.push(error);
  const receiveWatchFailure = (error: Error): void => {
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
      assert.ok(sourceWatcher);
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
      process.stderr.write(`[docs-web] rebuild failed: ${errorReport(error)}\n`);
    };
  }
  const server = createDocumentationServer({ outputDirectory: OUTPUT, basePath: BASE_PATH });
  try {
    await new Promise<void>((accept, reject) => {
      server.once('error', reject);
      server.listen(port, host, accept);
    });
  } catch (error) {
    sourceWatcher?.close();
    throw error;
  }
  process.stdout.write(`[docs-web] http://${host}:${port}${BASE_PATH}\n`);
  let stopping = false;
  const stop = (status = 0): void => {
    if (stopping) return;
    stopping = true;
    sourceWatcher?.close();
    server.close(error => {
      if (error) {
        process.stderr.write(`[docs-web] server close failed: ${error.stack ?? error.message}\n`);
        process.exitCode = 1;
      } else process.exitCode = status;
    });
  };
  if (development) {
    handleRuntimeWatchFailure = error => {
      process.stderr.write(`[docs-web] source watch failed: ${error.stack ?? error.message}\n`);
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
