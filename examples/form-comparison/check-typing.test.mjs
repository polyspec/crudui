import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const typingSource = await readFile(new URL('./check-typing.mjs', import.meta.url), 'utf8');
const frameSource = await readFile(new URL('./src/frame.mjs', import.meta.url), 'utf8');

test('typing verification uses frame readiness and operation completion', () => {
  assert.equal(typingSource.includes('waitForFunction'), false,
    'typing verification must not read browser state periodically');
  assert.equal(typingSource.includes('setTimeout'), false,
    'typing verification must not infer rendering completion from elapsed time');
  assert.equal(typingSource.includes("waitUntil: 'networkidle0'"), false,
    'typing verification must use the frame readiness event');
  assert.match(typingSource, /window\.comparison\.idle\(\)/,
    'typing verification must await the frame renderer');
  assert.match(frameSource, /idle:\s*settle/,
    'the frame API must publish renderer completion');
});
