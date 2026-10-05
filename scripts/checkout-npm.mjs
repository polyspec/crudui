// The npm of this checkout (docs/spec/package-build.md, "Runtime and dependency versions"). `node
// scripts/install-npm.mjs` installs the release that `packageManager` of package.json records into the ignored
// directory .tools/npm of the checkout, never into the machine: a global npm is shared by every checkout of
// the machine, and an install of one replaces the npm of the others. The Makefile exports PATH with NPM_BIN first, every
// script that starts npm calls useCheckoutNpm, and every CI job adds NPM_BIN to GITHUB_PATH.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The installation directory of the checkout npm under `root`. */
export const npmPrefix = (root = ROOT) => path.join(root, '.tools', 'npm');

/** The directory of the npm and npx commands of the checkout npm under `root`. */
export const npmBin = (root = ROOT) => path.join(npmPrefix(root), 'node_modules', '.bin');

export const NPM_BIN = npmBin();

/** `current` with NPM_BIN first and no other entry of it. */
export function toolPath(current = process.env.PATH ?? '') {
  return [NPM_BIN, ...current.split(path.delimiter).filter(entry => entry && entry !== NPM_BIN)].join(path.delimiter);
}

/** Puts NPM_BIN first on PATH of this process, so every npm that it and its children start is the checkout npm. */
export function useCheckoutNpm() {
  process.env.PATH = toolPath(process.env.PATH);
}
