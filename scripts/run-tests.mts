// Delegate test execution to the CLI exported by the installed kit package.
import { fileURLToPath } from 'node:url';
import { runCommand } from '@polyspec/kit/run-command';

const command = fileURLToPath(import.meta.resolve('@polyspec/kit/run-tests'));
const result = await runCommand({ command: process.execPath, args: [command, ...process.argv.slice(2)] });
if (result.error) throw result.error;
if (result.signal) throw new Error(`${command} ended with signal ${result.signal}`);
process.exitCode = result.status ?? 1;
