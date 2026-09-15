import { cp, rm } from 'node:fs/promises';
import path from 'node:path';

import { orderedJsonDirectory, treeDirectory } from '../examples/form-comparison/src/server-layout.mjs';

const source = path.join(orderedJsonDirectory, 'js');
const destination = path.join(treeDirectory, 'node_modules/ordered-json');

await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true, errorOnExist: true });
