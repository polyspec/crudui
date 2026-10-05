// Tell the supervisor that the mounted repository changed: send SIGUSR2 to the process id the
// supervisor recorded. The host's source watcher (source-events.mjs) runs this inside the
// container for every change of the working tree. A missing record or a stopped supervisor fails
// with its error.
import { readFile } from 'node:fs/promises';

import { supervisorProcessFile } from './src/server-layout.mjs';

const pid = Number(await readFile(supervisorProcessFile, 'utf8'));
if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error(`${supervisorProcessFile} holds no process id`);
process.kill(pid, 'SIGUSR2');
