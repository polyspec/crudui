// The files that this repository owns: the files of the checkout (tracked, or new and not ignored) without the files
// of polyspec/kit. The installed @polyspec/kit declares its copied paths in kit.copies and its owned paths in kit.owners.
// Those paths are maintained in kit, so the rules of this repository read its own sources, manifests and tests.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { checkedFiles } from '@polyspec/kit/tracked-files';
import { checkedShape, shapeOf } from './json-schema.mts';

/** The copied paths and owner declarations of the installed @polyspec/kit package. */
const KIT_MANIFEST = shapeOf<{ kit: { copies: Record<string, unknown>; owners?: { paths: string[] }[] } }>({
  type: 'object',
  required: ['kit'],
  properties: {
    kit: {
      type: 'object',
      required: ['copies'],
      properties: {
        copies: { type: 'object' },
        owners: { type: 'array', items: { type: 'object', required: ['paths'], properties: { paths: { type: 'array', items: { type: 'string' } } } } },
      },
    },
  },
});

const ROOT = path.resolve(import.meta.dirname, '..');
// The copies of each root that a process read: the installed package does not change while a check runs.
const read = new Map<string, string[]>();
const owners = new Map<string, string[]>();

/** The paths of the copies of kit under `root`, sorted: the keys of kit.copies of its installed @polyspec/kit. */
export function kitCopies(root: string = ROOT): string[] {
  let copies = read.get(root);
  if (!copies) {
    copies = readCopies(root);
    read.set(root, copies);
  }
  return copies;
}

function readCopies(root: string): string[] {
  const manifest = path.join(root, 'node_modules/@polyspec/kit/package.json');
  let text;
  try {
    text = readFileSync(manifest, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`${manifest} is missing; run make install-tools TOOLS=npm, then make install-packages`, { cause: error });
    }
    throw error;
  }
  const kit = checkedShape(KIT_MANIFEST, JSON.parse(text), manifest).kit;
  owners.set(root, (kit.owners ?? []).flatMap(owner => owner.paths));
  return Object.keys(kit.copies).sort();
}

/** Whether `file`, relative to the checkout, is a copy or an owned path of polyspec/kit. */
export const isVendored = (file: string, root: string = ROOT): boolean =>
  kitCopies(root).includes(file) || (owners.get(root) ?? []).some(pattern => path.matchesGlob(file, pattern));

/** The files of the checkout at `root` that this repository owns, sorted. */
export function ownedFiles(root: string = ROOT): string[] {
  return checkedFiles(root).filter(file => !isVendored(file, root));
}
