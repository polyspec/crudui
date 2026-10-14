#!/usr/bin/env node
// Requires every git pin of this repository in a pyproject.toml to name the version of the release tag (`make release-pins
// TAG=...`, run by `make release-versions`). A pin has the form `name @ git+https://github.com/polyspec/crudui@vX.Y.Z#...`;
// a pin of another version than the tag is reported with its file, the pin and the tag, and so is a pin whose subdirectory is
// no folder of the checkout that the tag releases (the move of packages/<name>-<runtime> to packages/<name>/<runtime>, C14.7,
// changed every subdirectory); the command fails on either.
//
//   node scripts/release-pins.mts <tag>        <tag> is vX.Y.Z or <Go module directory>/vX.Y.Z
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ownedFiles } from './repository-files.mts';

const ROOT = path.resolve(import.meta.dirname, '..');

const PIN = /git\+https:\/\/github\.com\/polyspec\/crudui@(\S+?)#/g;
const SUBDIRECTORY = /git\+https:\/\/github\.com\/polyspec\/crudui@\S+?#subdirectory=([^\s"',]+)/g;
const TAG = /^(?:.+\/)?v(\d+\.\d+\.\d+)$/;

/** The git pins of a pyproject.toml text that name another tag than `v<version>`, as `<tag> instead of v<version>`. */
export function stalePins(text: string, version: string): string[] {
  return [...text.matchAll(PIN)].filter(match => match[1] !== `v${version}`).map(match => `${match[1]} instead of v${version}`);
}

/** The subdirectories of the git pins of a pyproject.toml text that are no folder of `root`, as `subdirectory <path> is missing`. */
export function missingSubdirectories(text: string, root: string): string[] {
  return [...text.matchAll(SUBDIRECTORY)].map(match => match[1]).filter(subdirectory => {
    assert.ok(subdirectory !== undefined);
    return !existsSync(path.join(root, subdirectory, 'pyproject.toml'));
  }).map(subdirectory => `subdirectory ${subdirectory} is missing`);
}

/** The problems of the pins of the pyproject.toml files of `root` against the version of `tag`. */
export function pinProblems(root: string, tag: string): string[] {
  const match = TAG.exec(tag);
  const version = match?.[1];
  if (version === undefined) throw new Error(`${tag} is not vX.Y.Z or <directory>/vX.Y.Z`);
  return ownedFiles(root).filter(file => path.posix.basename(file) === 'pyproject.toml').flatMap(file => {
    const text = readFileSync(path.join(root, file), 'utf8');
    return [...stalePins(text, version), ...missingSubdirectories(text, root)].map(problem => `${file}: ${problem}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tag = process.argv[2];
  if (!tag) {
    console.error('usage: node scripts/release-pins.mts <tag>');
    process.exit(2);
  }
  const problems = pinProblems(ROOT, tag);
  for (const problem of problems) console.error(`[release-pins] ${problem}: the pin must name the tag ${tag} and a folder of this checkout`);
  if (problems.length) process.exit(1);
  process.stdout.write(`[release-pins] every git pin of the pyproject.toml files names the version of ${tag}\n`);
}
