import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { readJson, type JTDSchemaType } from '../json.mts';

const root = new URL('../../', import.meta.url);
/** The fields of contracts/unicode-properties.json that the tests read: each table lists ranges [start, end] inclusive. */
interface Contract {
  unicodeVersion: string;
  whiteSpace: number[][];
  generalCategories: Record<string, number[][]>;
  scripts: Record<string, number[][]>;
}
const ranges: JTDSchemaType<number[][]> = { elements: { elements: { type: 'uint32' } } };
const contractSchema: JTDSchemaType<Contract> = {
  properties: { unicodeVersion: { type: 'string' }, whiteSpace: ranges, generalCategories: { values: ranges }, scripts: { values: ranges } },
  additionalProperties: true,
};
const contract = readJson(new URL('contracts/unicode-properties.json', root), contractSchema);

test('the Unicode property contract is generated from the stored UCD files', () => {
  execFileSync(process.execPath, ['scripts/generate-unicode-properties.mts', '--check'], { cwd: root, stdio: 'pipe' });
});

test('the contract records the Unicode version the specification names', () => {
  const spec = readFileSync(new URL('docs/spec/validation-rules.md', root), 'utf8');
  assert.equal(contract.unicodeVersion, '16.0.0');
  assert.match(spec, /Unicode 16\.0\.0/);
});

test('the contract ranges are sorted, disjoint and inside the code space', () => {
  const tables = { whiteSpace: contract.whiteSpace, ...contract.generalCategories, ...contract.scripts };
  for (const [name, ranges] of Object.entries(tables)) {
    let previous = -2;
    for (const range of ranges) {
      const [start, end] = range;
      assert.ok(range.length === 2 && start !== undefined && end !== undefined, `${name}: a range is [start, end]`);
      assert.ok(Number.isInteger(start) && Number.isInteger(end) && start <= end && end <= 0x10ffff, name);
      assert.ok(start > previous + 1, `${name}: ranges must be merged and sorted`);
      previous = end;
    }
  }
});

test('White_Space is the set the specification lists', () => {
  assert.deepEqual(contract.whiteSpace, [[0x9, 0xd], [0x20, 0x20], [0x85, 0x85], [0xa0, 0xa0], [0x1680, 0x1680],
    [0x2000, 0x200a], [0x2028, 0x2029], [0x202f, 0x202f], [0x205f, 0x205f], [0x3000, 0x3000]]);
});
