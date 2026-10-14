// The files that this repository owns: the files of the checkout (tracked, or new and not ignored) without the copies
// of polyspec/kit. The copies are the paths of kit.copies of the installed package @polyspec/kit, which make kit-sync
// writes and make kit-check compares with the package; they are changed in polyspec/kit, so the rules that this
// repository sets for its own sources, manifests and tests do not read them.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { checkedFiles } from '@polyspec/kit/tracked-files';

const ROOT = path.resolve(import.meta.dirname, '..');
// The copies of each root that a process read: the installed package does not change while a check runs.
const read = new Map<string, string[]>();

/** The paths of the copies of kit under `root`, sorted: the keys of kit.copies of its installed @polyspec/kit. */
export function kitCopies(root: string = ROOT): string[] {
  let copies = read.get(root);
  if (!copies) {
    copies = readCopies(root);
    read.set(root, copies);
  }
  return copies;
}

interface KitManifest {
  kit: { copies: Record<string, unknown> };
}

function readCopies(root: string): string[] {
  const manifest = path.join(root, 'node_modules/@polyspec/kit/package.json');
  let text;
  try {
    text = readFileSync(manifest, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`${manifest} is missing; run make install-tools TOOLS=npm, then make install-packages`);
    throw error;
  }
  return Object.keys((JSON.parse(text) as KitManifest).kit.copies).sort();
}

/** Whether `file`, relative to the checkout, is a copy of polyspec/kit. */
export const isVendored = (file: string, root: string = ROOT): boolean => kitCopies(root).includes(file);

/** The files of the checkout at `root` that this repository owns, sorted. */
export function ownedFiles(root: string = ROOT): string[] {
  const copies = new Set(kitCopies(root));
  return checkedFiles(root).filter(file => !copies.has(file));
}
