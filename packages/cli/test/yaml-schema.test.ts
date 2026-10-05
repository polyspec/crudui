// The cli reads YAML in the YAML 1.2 core schema, as scripts/check-schema.mjs and the cross-check console read it:
// a date-like scalar stays a string and `<<` is no merge key.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { loadSpec } from '../src/check';

let directory: string | undefined;
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

describe('the YAML schema of the cli', () => {
  test('a date-like value stays a string and << is a plain key', () => {
    directory = mkdtempSync(join(tmpdir(), 'crudui-cli-yaml-'));
    const file = join(directory, 'spec.yml');
    writeFileSync(file, "type: group\nproperties:\n  start:\n    type: date\n    default: 2026-01-01\nextra:\n  <<: {a: 1}\n");
    const spec = loadSpec(file) as { properties: { start: { default: unknown } }; extra: Record<string, unknown> };
    expect(spec.properties.start.default).toBe('2026-01-01');
    expect(spec.extra).toEqual({ '<<': { a: 1 } });
  });
});
