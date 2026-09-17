import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const path = resolve(dirname(fileURLToPath(import.meta.url)), '../../../contracts/features.json');

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

export function loadManifest(): ContractManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as ContractManifest;
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
