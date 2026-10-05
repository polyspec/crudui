import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markerErrors, textErrors } from './checklist-markers.mjs';

const PATH = 'docs/plans/execution-checklist.md';

const STRAY = `# Execution checklist

- The last column of every task row is its state: \`[ ]\` waiting, \`[~]\` in progress.

| ID | Task | Verification | Status |
|---|---|---|---|
| C1.1 | Mark the task \`[o]\` when it is done | \`make docs-check\` | [o] |
| C1.2 | Print \`a \\| b\` while the task is in progress | \`make docs-check\` | [~] |
| C1.3 | Bypass this task | \`make docs-check\` | [!] cause: C1.2 is [~]; retry: C1.2 done |
| Note | A row that is not a task | none | [o] |
| C1.4 | Close the task with \`[X]\` | \`make docs-check\` | [o] |
- [x] C1.5 Close the task in the task list form
`;

const PROSE = `# Execution checklist

[한국어](execution-checklist.ko.md).

This document lists the planned tasks.

## How to use

- Task ID format: \`C<wave>.<number>\`.

## Wave 1 — Write the tasks

Depends on: none.

| ID | Task | Verification | Status |
|---|---|---|---|
| C1.1 | Write the task | \`make docs-check\` | [o] |
| Note | A row that is not a task | none | none |

| A table | without a separator |
`;

const CLEAN = `# Execution checklist

| ID | Task | Verification | Status |
|---|---|---|---|
| C1.1 | Mark the task done when its verification passed | \`make docs-check\` | [o] |
| C1.2 | Print \`a \\| b\` while the task is in progress | \`make docs-check\` | [~] |
| C1.2-1 | Wait for C1.2 | \`make docs-check\` | [ ] |
| C1.3 | Bypass this task | \`make docs-check\` | [!] cause: C1.2 is in progress; retry: C1.2 done |
`;

test('a state marker outside a task state fails with its file, line and column', () => {
  assert.deepEqual(markerErrors(PATH, STRAY), [
    ['3:52', '[ ]'], ['3:67', '[~]'], ['7:25', '[o]'], ['9:68', '[~]'], ['10:44', '[o]'], ['11:31', '[X]'], ['12:3', '[x]'],
  ].map(([location, marker]) =>
    `${PATH}:${location}: state marker ${marker} outside a task state; a checklist marker appears only as the state of a task row`));
});

test('a line that is not a task row, a table header or a heading fails with its file, line and column', () => {
  assert.deepEqual(textErrors(PATH, PROSE), ['3:1', '5:1', '9:1', '13:1', '18:1', '20:1'].map(location =>
    `${PATH}:${location}: text outside a task row; a checklist holds only task rows, their table headers and headings`));
});

test('markers only as task states and lines only of tasks and headings pass', () => {
  assert.deepEqual(markerErrors(PATH, CLEAN), []);
  assert.deepEqual(textErrors(PATH, CLEAN), []);
});
