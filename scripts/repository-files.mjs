// The files that this repository owns: the files of the checkout (tracked, or new and not ignored) without the copies
// of polyspec/kit. The copies are the paths of kit.copies of the installed package @polyspec/kit, which make kit-sync
// writes and make kit-check compares with the package; they are changed in polyspec/kit, so the rules that this
// repository sets for its own sources, manifests and tests do not read them.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { checkedFiles } from '@polyspec/kit/tracked-files';

const ROOT = path.resolve(import.meta.dirname, '..');
// The copies of each root that a process read: the installed package does not change while a check runs.
const read = new Map();

/** The paths of the copies of kit under `root`, sorted: the keys of kit.copies of its installed @polyspec/kit. */
export function kitCopies(root = ROOT) {
  if (!read.has(root)) read.set(root, readCopies(root));
  return read.get(root);
}

function readCopies(root) {
  const manifest = path.join(root, 'node_modules/@polyspec/kit/package.json');
  let text;
  try {
    text = readFileSync(manifest, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${manifest} is missing; run make install-tools TOOLS=npm, then make install-packages`);
    throw error;
  }
  return Object.keys(JSON.parse(text).kit.copies).sort();
}

/** Whether `file`, relative to the checkout, is a copy of polyspec/kit. */
export const isVendored = (file, root = ROOT) => kitCopies(root).includes(file);

/** The files of the checkout at `root` that this repository owns, sorted. */
export function ownedFiles(root = ROOT) {
  const copies = new Set(kitCopies(root));
  return checkedFiles(root).filter(file => !copies.has(file));
}
