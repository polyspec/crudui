#!/usr/bin/env node
/**
 * Generate contracts/unicode-properties.json from the Unicode Character Database files in
 * contracts/unicode/. Every runtime embeds this table, so the pattern language and the
 * whitespace definition use the same Unicode data everywhere.
 *
 *   node scripts/generate-unicode-properties.mjs          write the contract
 *   node scripts/generate-unicode-properties.mjs --check  fail when the contract is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sources = resolve(root, 'contracts/unicode');
const target = resolve(root, 'contracts/unicode-properties.json');

/** Each `start..end ; value` line of a UCD file, grouped by value. */
function readRanges(file) {
  const text = readFileSync(resolve(sources, file), 'utf8');
  const version = text.match(/^# \S+-(\d+\.\d+\.\d+)\.txt/)?.[1];
  if (!version) throw new Error(`${file}: no version header`);
  const byValue = new Map();
  for (const line of text.split('\n')) {
    const data = line.replace(/#.*/, '').trim();
    if (!data) continue;
    const [codes, value] = data.split(';').map((part) => part.trim());
    const [start, end = start] = codes.split('..').map((code) => Number.parseInt(code, 16));
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value).push([start, end]);
  }
  return { version, byValue };
}

/** Sorted, merged ranges. */
function merge(ranges) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

const categories = readRanges('DerivedGeneralCategory.txt');
const scripts = readRanges('Scripts.txt');
const properties = readRanges('PropList.txt');
const versions = new Set([categories.version, scripts.version, properties.version]);
if (versions.size !== 1) throw new Error(`UCD files disagree on the version: ${[...versions].join(', ')}`);

// The two-letter categories of the pattern language; Cn (unassigned) and Cs (surrogates,
// which no text holds) are not part of it. Each one-letter category is the union of its
// two-letter categories in the full UCD partition.
const GROUPS = {
  L: ['Lu', 'Ll', 'Lt', 'Lm', 'Lo'],
  M: ['Mn', 'Mc', 'Me'],
  N: ['Nd', 'Nl', 'No'],
  P: ['Pc', 'Pd', 'Ps', 'Pe', 'Pi', 'Pf', 'Po'],
  S: ['Sm', 'Sc', 'Sk', 'So'],
  Z: ['Zs', 'Zl', 'Zp'],
  C: ['Cc', 'Cf', 'Cs', 'Co', 'Cn'],
};
const LANGUAGE_CATEGORIES = ['L', 'Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'M', 'Mn', 'Mc', 'Me', 'N', 'Nd', 'Nl', 'No',
  'P', 'Pc', 'Pd', 'Ps', 'Pe', 'Pi', 'Pf', 'Po', 'S', 'Sm', 'Sc', 'Sk', 'So', 'Z', 'Zs', 'Zl', 'Zp',
  'C', 'Cc', 'Cf', 'Co'];

const generalCategories = {};
for (const name of LANGUAGE_CATEGORIES) {
  const parts = GROUPS[name] ?? [name];
  const ranges = parts.flatMap((part) => {
    const found = categories.byValue.get(part);
    if (!found) throw new Error(`DerivedGeneralCategory.txt has no ${part}`);
    return found;
  });
  generalCategories[name] = merge(ranges);
}

const scriptTable = {};
for (const name of [...scripts.byValue.keys()].sort()) scriptTable[name] = merge(scripts.byValue.get(name));

const whiteSpace = properties.byValue.get('White_Space');
if (!whiteSpace) throw new Error('PropList.txt has no White_Space');

const contract = {
  format: 'crudui/unicode-properties',
  unicodeVersion: categories.version,
  description: 'Code point ranges (inclusive) of the Unicode data used by CRUDUI: White_Space, the general categories and the scripts (Script property) of the pattern language. Generated from contracts/unicode by scripts/generate-unicode-properties.mjs.',
  whiteSpace: merge(whiteSpace),
  generalCategories,
  scripts: scriptTable,
};

// One range per line keeps the file reviewable and diffable.
const json = JSON.stringify(contract, null, 2).replace(/\[\s+(\d+),\s+(\d+)\s+\]/g, '[$1, $2]') + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== json) {
    process.stderr.write('contracts/unicode-properties.json is stale; run node scripts/generate-unicode-properties.mjs\n');
    process.exit(1);
  }
  process.stdout.write(`[unicode] contracts/unicode-properties.json matches Unicode ${contract.unicodeVersion}\n`);
} else {
  writeFileSync(target, json);
  process.stdout.write(`[unicode] wrote ${Object.keys(scriptTable).length} scripts and ${LANGUAGE_CATEGORIES.length} categories of Unicode ${contract.unicodeVersion}\n`);
}
