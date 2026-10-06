// The binding reads classes only to find the error slots it replaces (form-markup.md, "Class
// names"). This test fails when the source names another class or reads a class outside the
// module that holds the slot classes.
import { readdirSync, readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

const source = new URL('../src/', import.meta.url);
const files = readdirSync(source).filter((file) => file.endsWith('.ts'));
const read = (file: string) => readFileSync(new URL(file, source), 'utf8');

it('names only the classes of the error slots, and only in slots.ts', () => {
  const named = new Map(files.map((file) => [file, [...new Set(read(file).match(/(?<![\w/-])(?:crudui-[a-z0-9_-]+|valid-target[a-z-]*)/g) ?? [])].sort()]));
  expect(Object.fromEntries([...named].filter(([, names]) => names.length))).toStrictEqual({
    'slots.ts': ['crudui-form__body', 'crudui-form__error', 'crudui-form__errors', 'crudui-node__body', 'crudui-node__error', 'crudui-node__errors'],
  });
});

it('reads classes only in slots.ts', () => {
  const reading = files.filter((file) => file !== 'slots.ts' && /classList|className|querySelector(?:All)?\(\s*['"`]\./.test(read(file)));
  expect(reading).toStrictEqual([]);
});
