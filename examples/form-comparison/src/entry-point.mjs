import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Runs main when the module at moduleUrl is the script that node started; a failure sets the exit status. */
export function runAsEntryPoint(moduleUrl, main) {
  if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(moduleUrl)) {
    main().catch(error => {
      process.stderr.write(`${error.stack ?? error}\n`);
      process.exitCode = 1;
    });
  }
}
