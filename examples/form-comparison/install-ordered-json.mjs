#!/usr/bin/env node
// Installs the OrderedJSON checkout of the branch main that the record servers of the comparison build from
// (.form-comparison/sources/ordered-json), the download of `make install-ordered-json`, which `make install` runs. Each
// run checks out the current head of main. The pipeline reads the checkout and fails when it is missing or has tracked
// changes, naming that command; it downloads nothing itself (docs/spec/package-build.md, "Offline checks").
//
//   node examples/form-comparison/install-ordered-json.mjs
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { installOrderedJson, orderedJsonBranch } from './src/ordered-json-source.mjs';
import { createProgress } from '../../scripts/test-progress/progress.mjs';

const execFileAsync = promisify(execFile);
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.form-comparison/sources/ordered-json');

/** Whether `directory` holds an OrderedJSON checkout without tracked changes. */
export async function orderedJsonPresent(checkout = directory) {
  try {
    await execFileAsync('git', ['-C', checkout, 'rev-parse', '--verify', 'HEAD^{commit}']);
    const { stdout: changes } = await execFileAsync('git', ['-C', checkout, 'status', '--porcelain', '--untracked-files=no']);
    return changes.trim() === '';
  } catch {
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lines = createProgress({ write: text => process.stdout.write(text) });
  const id = `ordered-json: the checkout of the branch ${orderedJsonBranch} in .form-comparison/sources/ordered-json`;
  lines.start(id, { group: true });
  try {
    await installOrderedJson(directory);
    lines.line(`ordered-json: installed the head of ${orderedJsonBranch}`);
    lines.pass(id);
  } catch (error) {
    lines.fail(id, undefined, error.message);
    process.exitCode = 1;
  }
  lines.close('ordered-json');
}
