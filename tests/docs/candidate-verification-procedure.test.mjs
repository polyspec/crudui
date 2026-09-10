import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const documents = await Promise.all([
  '../../docs/operations/verification.md',
  '../../docs/operations/verification.ko.md',
].map(file => readFile(new URL(file, import.meta.url), 'utf8')));

test('candidate verification procedure uses the event-driven lifecycle command', () => {
  for (const source of documents) {
    const commands = [...source.matchAll(/^```sh\n([\s\S]*?)^```/gm)]
      .map(match => match[1]).join('\n');
    assert.match(commands,
      /node examples\/form-comparison\/candidate-verification\.mjs --ref \"\$CANDIDATE_REF\"/,
      'the procedure must run the complete candidate lifecycle command');
    assert.equal(commands.includes('sleep '), false,
      'the procedure must not poll candidate readiness with sleep');
    assert.equal(commands.includes('for attempt in'), false,
      'the procedure must not retry candidate readiness reads');
  }
});
