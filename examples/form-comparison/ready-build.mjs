import assert from 'node:assert/strict';

import { readyBuild } from './verify-tree.mjs';

// Run inside the comparison container from the source mount: wait until the supervisor has built
// and started the servers of the source identity given as JSON, under the build readiness limits.
assert.equal(process.argv.length, 3, 'Usage: node ready-build.mjs {source identity JSON}');
await readyBuild({ source: JSON.parse(process.argv[2]) });
