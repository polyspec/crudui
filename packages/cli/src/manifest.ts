import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv } from 'ajv';

const contracts = resolve(dirname(fileURLToPath(import.meta.url)), '../../../contracts');
const path = resolve(contracts, 'features.json');
const schemaPath = resolve(contracts, 'features.schema.json');

export interface ContractManifest {
  format: string;
  version: string;
  packages: Array<{
    name: string;
    path: string;
    layer: string;
    entries: Record<string, { visibility: 'public' | 'internal'; exports: string[] }>;
  }>;
  features: Array<{
    id: string;
    owner: string;
    signature: string;
    input: string;
    output: string;
    status: string;
    state: string;
    errors: string[];
    fixtures: string[];
    tests: string[];
    docs: string[];
    support: Record<string, string>;
    verification: Array<{ id: string; command: string }>;
  }>;
  examples: Array<{ id: string; input: string; expected: string }>;
  fixtures: Array<{ path: string; kind: string }>;
  supportValues: string[];
}

/**
 * The manifest `file`, contracts/features.json by default, checked against contracts/features.schema.json; throws with the
 * errors of ajv when it breaks the schema.
 */
export function loadManifest(file = path): ContractManifest {
  const schema: unknown = JSON.parse(readFileSync(schemaPath, 'utf8'));
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) throw new Error(`${schemaPath} holds no JSON object`);
  const validate = new Ajv({ allErrors: true }).compile<ContractManifest>(schema);
  const manifest: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!validate(manifest)) {
    const lines = (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? error.keyword}`);
    throw new Error(`${file} breaks ${schemaPath}:\n${lines.join('\n')}`);
  }
  return manifest;
}

export function renderManifestMarkdown(manifest = loadManifest()): string {
  const lines = [
    '# CRUDUI contract manifest',
    '',
    `Format: \`${manifest.format}\``,
    `Version: \`${manifest.version}\``,
    '',
    '## Features',
    '',
    '| Feature | Status | Owner | Signature | State | Verification |',
    '| --- | --- | --- | --- | --- | --- |',
    ...manifest.features.map((feature) => `| \`${feature.id}\` | ${feature.status} | \`${feature.owner}\` | \`${feature.signature}\` | ${feature.state} | ${feature.verification.length} command(s) |`),
    '',
    '## Packages',
    '',
    '| Package | Layer | Entry | Visibility | Exports |',
    '| --- | --- | --- | --- | --- |',
    ...manifest.packages.flatMap((pkg) => Object.entries(pkg.entries).map(([entry, { visibility, exports }]) =>
      `| \`${pkg.name}\` | ${pkg.layer} | \`${entry}\` | ${visibility} | ${exports.map((name) => `\`${name}\``).join(', ')} |`)),
    '',
    '## Fixtures',
    '',
    ...manifest.fixtures.map((fixture) => `- \`${fixture.kind}\`: \`${fixture.path}\``),
  ];
  return lines.join('\n');
}
