#!/usr/bin/env node
// Installs the OrderedJSON checkout of the tag `orderedJsonTag` (src/ordered-json-source.mjs) that the record servers
// of the comparison build from (.form-comparison/sources/ordered-json), the download of `make install-ordered-json`, which `make install` runs. A
// checkout at the commit of the tag without tracked changes stays; any other one is replaced by a checkout of the tag.
// The pipeline reads the checkout and fails when it is missing, has tracked changes or is at another commit than the
// tag, naming that command; it downloads nothing itself (docs/spec/package-build.md, "Offline checks"). It runs before
// make install-packages, which installs the js package of the checkout, so it imports only Node.js built-ins and the files
// of examples/form-comparison, and prints each step itself.
//
//   node examples/form-comparison/install-ordered-json.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { installOrderedJson, orderedJsonAtTag, orderedJsonTag } from './src/ordered-json-source.mjs';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.form-comparison/sources/ordered-json');

/** Whether `directory` holds an OrderedJSON checkout of the tag without tracked changes. */
export function orderedJsonPresent(checkout = directory) {
  return orderedJsonAtTag(checkout);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = performance.now();
  const elapsed = () => `${((performance.now() - started) / 1000).toFixed(1)}s`;
  process.stdout.write(`[ordered-json] start: the checkout of the tag ${orderedJsonTag} in .form-comparison/sources/ordered-json\n`);
  try {
    const { installed } = await installOrderedJson(directory);
    process.stdout.write(`[ordered-json] pass (${elapsed()}): ${installed ? `installed the tag ${orderedJsonTag}` : `the checkout is at the tag ${orderedJsonTag}`}\n`);
  } catch (error) {
    process.stdout.write(`[ordered-json] fail (${elapsed()}): ${error.message}\n`);
    process.exitCode = 1;
  }
}
