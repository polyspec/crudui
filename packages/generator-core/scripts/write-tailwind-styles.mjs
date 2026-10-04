#!/usr/bin/env node
/**
 * Writes styles/crudui.tailwind.css from styles/crudui.css: the same rules inside the cascade layer
 * `components` of Tailwind CSS 4 (form markup contract, Tailwind CSS).
 *
 *   node packages/generator-core/scripts/write-tailwind-styles.mjs [--check]
 *
 * With --check the script writes nothing and fails when the committed file differs from the file
 * that it would write, so the two stylesheets never hold different rules.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const styles = resolve(dirname(fileURLToPath(import.meta.url)), '../styles');
const source = resolve(styles, 'crudui.css');
const target = resolve(styles, 'crudui.tailwind.css');

const rules = readFileSync(source, 'utf8').trimEnd();
if (/@layer|@import/.test(rules)) throw new Error(`${source} holds @layer or @import, which the layer components cannot wrap`);
const text = [
  '/* Generated from crudui.css by packages/generator-core/scripts/write-tailwind-styles.mjs; do not edit. */',
  '/* Import this file after tailwindcss: the rules lie in the layer components, before the utilities. */',
  '@layer components {',
  rules,
  '}',
  '',
].join('\n');

if (process.argv.includes('--check')) {
  if (!existsSync(target) || readFileSync(target, 'utf8') !== text) {
    console.error(`FAIL ${target} differs from ${source}; run node packages/generator-core/scripts/write-tailwind-styles.mjs`);
    process.exit(1);
  }
  console.log(`PASS ${target} matches ${source}`);
} else {
  writeFileSync(target, text);
  console.log(`wrote ${target}`);
}
