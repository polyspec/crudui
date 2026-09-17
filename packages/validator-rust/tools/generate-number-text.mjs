#!/usr/bin/env node
/**
 * Writes tests/data/number-text.tsv: double bit patterns (hexadecimal) and the text
 * ECMAScript `Number.prototype.toString` writes for them. The crate test
 * `numbers_match_the_ecmascript_table` checks the canonical text against it.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CRATE = join(dirname(fileURLToPath(import.meta.url)), '..');
const view = new DataView(new ArrayBuffer(8));
const bitsOf = value => { view.setFloat64(0, value); return view.getBigUint64(0); };
const valueOf = bits => { view.setBigUint64(0, bits); return view.getFloat64(0); };

// Deterministic xorshift64* so the table is reproducible.
let state = 0x9e3779b97f4a7c15n;
const mask = (1n << 64n) - 1n;
function next() {
  state ^= state >> 12n; state ^= (state << 25n) & mask; state ^= state >> 27n;
  return (state * 0x2545f4914f6cdd1dn) & mask;
}

const values = new Set();
const add = value => { if (Number.isFinite(value)) values.add(bitsOf(value)); };
for (let exponent = -330; exponent <= 310; exponent++) {
  for (const mantissa of [1, 1.5, 2.5, 5, 9.999999999999999, 1.2345678901234567]) add(Number(`${mantissa}e${exponent}`));
}
for (let power = 0; power <= 1100; power++) { add(2 ** power); add(2 ** -power); }
for (const value of [0, -0, 0.1 + 0.2, 1 / 3, Number.MAX_VALUE, Number.MIN_VALUE, Number.EPSILON, Number.MAX_SAFE_INTEGER]) add(value);
for (const boundary of [1e21, 1e-6, 1e-7, 1e20]) {
  const bits = bitsOf(boundary);
  for (let step = -3n; step <= 3n; step++) add(valueOf(bits + step));
}
for (let i = 0; i < 6000; i++) add(valueOf(next()));
for (let i = 0; i < 2000; i++) add(Number((next() % 10n ** 17n).toString()) / 10 ** Number(next() % 20n));
for (let i = 0; i < 2000; i++) add(-Number(next() % 100000n) / 1000);

const rows = [...values].map(bits => `${bits.toString(16).padStart(16, '0')}\t${String(valueOf(bits))}\n`);
writeFileSync(join(CRATE, 'tests/data/number-text.tsv'), rows.join(''));
