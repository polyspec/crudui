import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// A change log is the title, the section `## Unreleased` and one section `## X.Y.Z` per release, newest first. Every
// change adds its entry `### <date> — <title>` under `## Unreleased`; the release pull request of X.Y.Z renames
// `## Unreleased` to `## X.Y.Z` and writes a new empty `## Unreleased` above it (AGENTS.md).
const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
const sections = (text) => [...text.matchAll(/^## (.*)$/gm)].map((match) => match[1]);
const dates = (text) => [...text.matchAll(/^### (\d{4}-\d{2}-\d{2}) — /gm)].map((match) => match[1]);
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/** The problems of the section and entry headings of a change log, as `<line>: <problem>`. */
export function headingProblems(text) {
  const problems = [];
  let section = null;
  let previous = null;
  for (const [index, line] of text.split('\n').entries()) {
    const heading = /^(#+) (.*)$/.exec(line);
    if (!heading) continue;
    const [, marks, title] = heading;
    const at = `${index + 1}`;
    if (marks === '#') {
      if (index !== 0) problems.push(`${at}: the title is the first line`);
    } else if (marks === '##') {
      if (section === null && title !== 'Unreleased') problems.push(`${at}: the first section is ## Unreleased, found ## ${title}`);
      else if (section !== null) {
        const version = VERSION.exec(title)?.slice(1).map(Number);
        if (!version) problems.push(`${at}: a section below ## Unreleased is ## X.Y.Z, found ## ${title}`);
        else if (previous && !(version.reduce((order, part, i) => order || Math.sign(previous[i] - part), 0) > 0)) {
          problems.push(`${at}: ## ${title} is not older than ## ${previous.join('.')}`);
        }
        if (version) previous = version;
      }
      section = title;
    } else if (marks === '###') {
      if (section === null) problems.push(`${at}: an entry stands before ## Unreleased`);
      if (!/^\d{4}-\d{2}-\d{2} — \S/.test(title)) problems.push(`${at}: an entry heading is ### <date> — <title>, found ### ${title}`);
    } else problems.push(`${at}: a change log has no heading ${marks}`);
  }
  if (section === null) problems.push('the change log has no section ## Unreleased');
  return problems;
}

test('the heading rules name each misplaced or malformed heading', () => {
  assert.deepEqual(headingProblems('# Changes\n\n## Unreleased\n\n### 2026-10-07 — A (C1)\n\n## 0.2.0\n\n### 2026-10-06 — B (C2)\n\n## 0.1.0\n'), []);
  assert.deepEqual(headingProblems('# Changes\n\n## Unreleased\n'), []);
  assert.deepEqual(headingProblems('# Changes\n\n### 2026-10-07 — A (C1)\n\n## 0.1.0\n## Unreleased\n## 0.1.0\n## next\n#### x\n'), [
    '3: an entry stands before ## Unreleased',
    '5: the first section is ## Unreleased, found ## 0.1.0',
    '6: a section below ## Unreleased is ## X.Y.Z, found ## Unreleased',
    '8: a section below ## Unreleased is ## X.Y.Z, found ## next',
    '9: a change log has no heading ####',
  ]);
  assert.deepEqual(headingProblems('# Changes\n\n## Unreleased\n## 0.1.0\n## 0.2.0\n## 0.2.0\n## 0.1.10\n'), [
    '5: ## 0.2.0 is not older than ## 0.1.0',
    '6: ## 0.2.0 is not older than ## 0.2.0',
  ]);
  assert.deepEqual(headingProblems('# Changes\n\n## Unreleased\n\n## 2026-10-07 — A (C1)\n'), ['5: a section below ## Unreleased is ## X.Y.Z, found ## 2026-10-07 — A (C1)']);
  assert.deepEqual(headingProblems('# Changes\n\n### 2026-10-07 — A (C1)\n'), ['3: an entry stands before ## Unreleased', 'the change log has no section ## Unreleased']);
});

test('every change log starts with ## Unreleased, holds ## X.Y.Z sections newest first and dated entries', async () => {
  for (const file of ['CHANGELOG.md', 'CHANGELOG.ko.md']) assert.deepEqual(headingProblems(await read(file)), [], file);
});

test('every section and change entry has a Korean one at the same position', async () => {
  const english = await read('CHANGELOG.md');
  const korean = await read('CHANGELOG.ko.md');
  assert.ok(dates(english).length > 0, 'CHANGELOG.md has dated entries');
  assert.deepEqual(sections(korean), sections(english), 'CHANGELOG.ko.md must have the sections of CHANGELOG.md in the same order');
  assert.deepEqual(dates(korean), dates(english), 'CHANGELOG.ko.md must list the same dated entries in the same order');
});

test('change entries are newest first', async () => {
  const english = dates(await read('CHANGELOG.md'));
  const misplaced = english.filter((date, index) => index > 0 && date > english[index - 1]);
  assert.deepEqual(misplaced, [], 'an entry is newer than the entry above it');
});
