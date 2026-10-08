// Run the test tool of a suite that records conformance evidence and leave the record of its run
// (docs/spec/conformance.md, "Suite runs"):
//
//   node tests/conformance/run-suite.mjs <tool> [--timeout <seconds>] [--cwd <directory>] [--] [<arguments>]
//
// The arguments are those of scripts/kit/run-tests.mjs, which runs the tool and whose exit status this process takes.
// The record names this file as its program, with the tool, the directory relative to the repository root and the
// arguments of the run, so scripts/check-conformance.mjs can name the suites behind missing evidence. Nothing is
// recorded unless CRUDUI_CONFORMANCE_EVIDENCE names a directory.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArguments, run } from '../../scripts/kit/run-tests.mjs';
import { recordSuiteRun } from './runs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PROGRAM = 'tests/conformance/run-suite.mjs';

const argv = process.argv.slice(2);
const options = parseArguments(argv, ROOT);
recordSuiteRun({ program: PROGRAM, tool: options.tool, cwd: path.relative(ROOT, options.cwd) || '.', args: options.args });
process.exitCode = await run(argv, { root: ROOT });
