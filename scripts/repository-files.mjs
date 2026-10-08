// The files that this repository owns: the files of the checkout (tracked, or new and not ignored) without the vendored
// copy of polyspec/kit. The copy is the files of kit.json, `.kit/` and the directories that kit.json lists (scripts/kit and
// tests/kit); it is changed in polyspec/kit and checked by `make kit-check`, so the rules that this repository sets for its
// own sources, manifests and tests do not read it.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './kit/paths.mjs';
import { checkedFiles } from './kit/tracked-files.mjs';

/** The path prefixes of the vendored copy under `root`: the file kit.json, the directory .kit/ and each directory of kit.json. */
export function vendoredPrefixes(root = ROOT) {
  const { vendored } = JSON.parse(readFileSync(path.join(root, 'kit.json'), 'utf8'));
  return ['kit.json', '.kit/', ...vendored.map(directory => `${directory}/`)];
}

/** Whether `file`, relative to the checkout, belongs to the vendored copy of polyspec/kit. */
export const isVendored = (file, root = ROOT) => vendoredPrefixes(root).some(prefix => file === prefix || file.startsWith(prefix));

/** The files of the checkout at `root` that this repository owns, sorted. */
export function ownedFiles(root = ROOT) {
  const prefixes = vendoredPrefixes(root);
  return checkedFiles(root).filter(file => !prefixes.some(prefix => file === prefix || file.startsWith(prefix)));
}
