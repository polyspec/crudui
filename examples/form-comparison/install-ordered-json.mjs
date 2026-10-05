#!/usr/bin/env node
// Installs the pinned OrderedJSON checkout that the record servers of the comparison build from
// (.form-comparison/sources/ordered-json), the download of `make install-ordered-json`, which `make install` runs. The
// pipeline reads the checkout and fails when it is missing or at another revision, naming that command; it downloads
// nothing itself (docs/spec/package-build.md, "Offline checks").
//
//   node examples/form-comparison/install-ordered-json.mjs
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { installOrderedJson, orderedJsonRevision } from './src/ordered-json-source.mjs';
import { createProgress } from '../../scripts/test-progress/progress.mjs';

const execFileAsync = promisify(execFile);
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.form-comparison/sources/ordered-json');

/** Whether the checkout at `directory` is the pinned revision without tracked changes. */
export async function orderedJsonPresent(checkout = directory) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', checkout, 'rev-parse', 'HEAD']);
    const { stdout: changes } = await execFileAsync('git', ['-C', checkout, 'status', '--porcelain', '--untracked-files=no']);
    return stdout.trim() === orderedJsonRevision && changes.trim() === '';
  } catch {
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lines = createProgress({ write: text => process.stdout.write(text) });
  const id = `ordered-json: the checkout of ${orderedJsonRevision} in .form-comparison/sources/ordered-json`;
  lines.start(id, { group: true });
  try {
    if (await orderedJsonPresent()) lines.line(`ordered-json: ${orderedJsonRevision} is present`);
    else {
      await installOrderedJson(directory);
      lines.line(`ordered-json: installed ${orderedJsonRevision}`);
    }
    lines.pass(id);
  } catch (error) {
    lines.fail(id, undefined, error.message);
    process.exitCode = 1;
  }
  lines.close('ordered-json');
}
