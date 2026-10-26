import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadManifest, renderManifestMarkdown } from '../src/manifest.ts';

describe('manifest loading', () => {
  it('fails with the file and the errors of ajv when the manifest breaks contracts/features.schema.json', () => {
    const directory = mkdtempSync(join(tmpdir(), 'crudui-manifest-'));
    try {
      const file = join(directory, 'features.json');
      writeFileSync(file, JSON.stringify({}));
      expect(() => loadManifest(file)).toThrow(`${file} breaks `);
      expect(() => loadManifest(file)).toThrow("/ must have required property 'version'");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('manifest markdown', () => {
  it('lists every package entry with its visibility and value exports', () => {
    const manifest = loadManifest();
    const markdown = renderManifestMarkdown(manifest);
    const expectedRows = manifest.packages.flatMap((pkg) => Object.entries(pkg.entries).map(([entry, { visibility, exports }]) =>
      `| \`${pkg.name}\` | ${pkg.layer} | \`${entry}\` | ${visibility} | ${exports.map((name) => `\`${name}\``).join(', ')} |`));
    expect(expectedRows.length).toBeGreaterThan(0);
    const table = markdown.split('## Packages\n\n')[1]?.split('\n\n## Fixtures')[0];
    expect(table).toBe([
      '| Package | Layer | Entry | Visibility | Exports |',
      '| --- | --- | --- | --- | --- |',
      ...expectedRows,
    ].join('\n'));
  });

  it('preserves public and internal visibility, export order and empty exports', () => {
    const manifest = loadManifest();
    manifest.packages = [{
      name: '@polyspec/fixture', path: 'packages/fixture', layer: 'model',
      entries: {
        '.': { visibility: 'public', exports: ['last', 'first'] },
        './internal': { visibility: 'internal', exports: [] },
      },
    }];
    const table = renderManifestMarkdown(manifest).split('## Packages\n\n')[1]?.split('\n\n## Fixtures')[0];
    expect(table).toBe([
      '| Package | Layer | Entry | Visibility | Exports |',
      '| --- | --- | --- | --- | --- |',
      '| `@polyspec/fixture` | model | `.` | public | `last`, `first` |',
      '| `@polyspec/fixture` | model | `./internal` | internal |  |',
    ].join('\n'));
  });
});
