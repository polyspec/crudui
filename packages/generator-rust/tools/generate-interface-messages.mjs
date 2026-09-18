#!/usr/bin/env node
/**
 * Writes src/interface_messages.rs from contracts/interface-messages.json.
 * The crate test `embedded_messages_match_the_contract` fails when the two differ.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CRATE = join(dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(readFileSync(join(CRATE, '../../contracts/interface-messages.json'), 'utf8'));

// Convert camelCase to snake_case
const toSnakeCase = str => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

// Generate a Messages constant for a language
const generateConstant = (lang, langCode) => {
    const messages = contract.form[lang];
    const fields = Object.entries(messages)
        .map(([key, value]) => {
            const rustKey = toSnakeCase(key);
            return `    ${rustKey}: ${JSON.stringify(value)},`;
        })
        .join('\n');

    return `pub const ${langCode}: Messages = Messages {\n${fields}\n};`;
};

// Generate Rust source
const output = `//! Interface messages for CRUDUI as string constants.
//!
//! Generated from \`contracts/interface-messages.json\` by
//! \`node tools/generate-interface-messages.mjs\` (run in \`packages/generator-rust\`); do not edit.

use super::Messages;

${generateConstant('ko', 'KO')}

${generateConstant('en', 'EN')}

${generateConstant('ja', 'JA')}

${generateConstant('zh', 'ZH')}
`;

writeFileSync(join(CRATE, 'src/messages/interface_messages.rs'), output);
