#!/usr/bin/env node
// Requires every git pin of this repository in a pyproject.toml to name the version of the release tag (`make release-pins
// TAG=...`, run by `make release-versions`). A pin has the form `name @ git+https://github.com/polyspec/crudui@vX.Y.Z#...`;
// a pin of another version than the tag is reported with its file, the pin and the tag, and the command fails.
//
//   node scripts/release-pins.mjs <tag>        <tag> is vX.Y.Z or <Go module directory>/vX.Y.Z
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isMain, ROOT } from './kit/paths.mjs';
import { ownedFiles } from './repository-files.mjs';

const PIN = /git\+https:\/\/github\.com\/polyspec\/crudui@(\S+?)#/g;
const TAG = /^(?:.+\/)?v(\d+\.\d+\.\d+)$/;

/** The git pins of a pyproject.toml text that name another tag than `v<version>`, as `<tag> instead of v<version>`. */
export function stalePins(text, version) {
  return [...text.matchAll(PIN)].filter(match => match[1] !== `v${version}`).map(match => `${match[1]} instead of v${version}`);
}

/** The problems of the pins of the pyproject.toml files of `root` against the version of `tag`. */
export function pinProblems(root, tag) {
  const match = TAG.exec(tag);
  if (!match) throw new Error(`${tag} is not vX.Y.Z or <directory>/vX.Y.Z`);
  return ownedFiles(root).filter(file => path.posix.basename(file) === 'pyproject.toml')
    .flatMap(file => stalePins(readFileSync(path.join(root, file), 'utf8'), match[1]).map(problem => `${file}: ${problem}`));
}

if (isMain(import.meta.url)) {
  const tag = process.argv[2];
  if (!tag) {
    console.error('usage: node scripts/release-pins.mjs <tag>');
    process.exit(2);
  }
  const problems = pinProblems(ROOT, tag);
  for (const problem of problems) console.error(`[release-pins] ${problem}: the pin must name the tag ${tag}`);
  if (problems.length) process.exit(1);
  process.stdout.write(`[release-pins] every git pin of the pyproject.toml files names the version of ${tag}\n`);
}
