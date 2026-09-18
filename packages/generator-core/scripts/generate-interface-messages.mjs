#!/usr/bin/env node
/**
 * Writes src/interface-messages.ts from contracts/interface-messages.json.
 *
 *   node packages/generator-core/scripts/generate-interface-messages.mjs
 *
 * Form interface text is generated in four language tables. src/interface-messages.test.ts
 * fails when the written data differs from the contract.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(resolve(here, '../../../contracts/interface-messages.json'), 'utf8'));
const target = resolve(here, '../src/interface-messages.ts');

/**
 * Generates a TypeScript object literal for a language table.
 * Keys and values are in the order they appear in the contract.
 */
function languageTable(messages) {
  const entries = Object.entries(messages);
  const lines = entries.map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
  return `{\n${lines.join('\n')}\n  }`;
}

const text = `/**
 * Form interface text in every supported language: labels of form controls, counts and summaries.
 *
 * Generated from contracts/interface-messages.json by
 * \`node packages/generator-core/scripts/generate-interface-messages.mjs\`. Do not edit;
 * interface-messages.test.ts fails when this data differs from the contract.
 *
 * \`{count}\` is replaced with a number.
 */

/** Form messages in Korean. */
export const MESSAGES_KO = ${languageTable(contract.form.ko)} as const;

/** Form messages in English. */
export const MESSAGES_EN = ${languageTable(contract.form.en)} as const;

/** Form messages in Japanese. */
export const MESSAGES_JA = ${languageTable(contract.form.ja)} as const;

/** Form messages in Chinese. */
export const MESSAGES_ZH = ${languageTable(contract.form.zh)} as const;

/** All form messages by language. */
export const MESSAGES = {
  ko: MESSAGES_KO,
  en: MESSAGES_EN,
  ja: MESSAGES_JA,
  zh: MESSAGES_ZH,
} as const;
`;

writeFileSync(target, text);
