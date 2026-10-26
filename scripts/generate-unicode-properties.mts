#!/usr/bin/env node
/** Write the shared Unicode 16.0.0 contract from the installed Unicode property ranges. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import unicode from '@unicode/unicode-16.0.0';

import { checkedShape, shapeOf } from './json-schema.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'contracts/unicode-properties.json');
type Range = [number, number];

// The contract names the categories by their standard short aliases.
const categories = {
  L: 'Letter', Lu: 'Uppercase_Letter', Ll: 'Lowercase_Letter', Lt: 'Titlecase_Letter',
  Lm: 'Modifier_Letter', Lo: 'Other_Letter', M: 'Mark', Mn: 'Nonspacing_Mark',
  Mc: 'Spacing_Mark', Me: 'Enclosing_Mark', N: 'Number', Nd: 'Decimal_Number',
  Nl: 'Letter_Number', No: 'Other_Number', P: 'Punctuation', Pc: 'Connector_Punctuation',
  Pd: 'Dash_Punctuation', Ps: 'Open_Punctuation', Pe: 'Close_Punctuation',
  Pi: 'Initial_Punctuation', Pf: 'Final_Punctuation', Po: 'Other_Punctuation',
  S: 'Symbol', Sm: 'Math_Symbol', Sc: 'Currency_Symbol', Sk: 'Modifier_Symbol',
  So: 'Other_Symbol', Z: 'Separator', Zs: 'Space_Separator', Zl: 'Line_Separator',
  Zp: 'Paragraph_Separator', C: 'Other', Cc: 'Control', Cf: 'Format', Co: 'Private_Use',
};

const rangeModule = shapeOf<{ default: { begin: number; end: number }[] }>({
  type: 'object', required: ['default'], properties: { default: {
    type: 'array', items: { type: 'object', required: ['begin', 'end'],
      properties: { begin: { type: 'integer', minimum: 0 }, end: { type: 'integer', maximum: 0x110000 } } },
  } },
});

/** Convert the package's exclusive end to the inclusive boundary of the shared contract. */
async function propertyRanges(property: string, value: string): Promise<Range[]> {
  const modulePath = `@unicode/unicode-16.0.0/${property}/${value}/ranges.mjs`;
  const loaded: unknown = await import(modulePath);
  const { default: ranges } = checkedShape(rangeModule, loaded, modulePath);
  return ranges.map(({ begin, end }) => [begin, end - 1]);
}

const generalCategories = Object.fromEntries(await Promise.all(Object.entries(categories)
  .map(async ([alias, name]): Promise<[string, Range[]]> => [alias, await propertyRanges('General_Category', name)])));
// Unknown is not a Script accepted by the pattern language.
const scriptNames = unicode.Script.filter(name => name !== 'Unknown').sort();
const scriptTable = Object.fromEntries(await Promise.all(scriptNames
  .map(async (name): Promise<[string, Range[]]> => [name, await propertyRanges('Script', name)])));
const contract = {
  format: 'crudui/unicode-properties',
  unicodeVersion: '16.0.0',
  description: 'Code point ranges (inclusive) of the Unicode data used by CRUDUI: White_Space, the general categories and the scripts (Script property) of the pattern language.',
  whiteSpace: await propertyRanges('Binary_Property', 'White_Space'),
  generalCategories,
  scripts: scriptTable,
};

// One range per line keeps the file reviewable and diffable.
const json = JSON.stringify(contract, null, 2).replace(/\[\s+(\d+),\s+(\d+)\s+\]/g, '[$1, $2]') + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== json) {
    process.stderr.write('contracts/unicode-properties.json is stale; run node scripts/generate-unicode-properties.mts\n');
    process.exit(1);
  }
  process.stdout.write(`[unicode] contracts/unicode-properties.json matches Unicode ${contract.unicodeVersion}\n`);
} else {
  writeFileSync(target, json);
  process.stdout.write(`[unicode] wrote ${Object.keys(scriptTable).length} scripts and ${Object.keys(categories).length} categories of Unicode ${contract.unicodeVersion}\n`);
}
