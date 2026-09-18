/**
 * The embedded form interface messages equal their source, contracts/interface-messages.json,
 * in all supported languages.
 */

import { test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from './interface-messages';

interface Contract {
  form: {
    ko: Record<string, string>;
    en: Record<string, string>;
    ja: Record<string, string>;
    zh: Record<string, string>;
  };
}

const contract = JSON.parse(
  fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../contracts/interface-messages.json'),
    'utf8'
  )
) as Contract;

test('src/interface-messages.ts equals contracts/interface-messages.json', () => {
  expect(Object.keys(MESSAGES)).toStrictEqual(['ko', 'en', 'ja', 'zh']);
  expect(MESSAGES.ko).toStrictEqual(contract.form.ko);
  expect(Object.keys(MESSAGES.ko)).toStrictEqual(Object.keys(contract.form.ko));
  expect(MESSAGES.en).toStrictEqual(contract.form.en);
  expect(Object.keys(MESSAGES.en)).toStrictEqual(Object.keys(contract.form.en));
  expect(MESSAGES.ja).toStrictEqual(contract.form.ja);
  expect(Object.keys(MESSAGES.ja)).toStrictEqual(Object.keys(contract.form.ja));
  expect(MESSAGES.zh).toStrictEqual(contract.form.zh);
  expect(Object.keys(MESSAGES.zh)).toStrictEqual(Object.keys(contract.form.zh));
});
