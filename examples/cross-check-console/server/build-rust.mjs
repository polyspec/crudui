#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runRustCommand } from '../../../scripts/run-rust-command.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

await runRustCommand(['build', '--locked', '--release', '--bin', 'validate'], {
  cwd: path.join(repositoryRoot, 'packages/validator-rust'),
});
