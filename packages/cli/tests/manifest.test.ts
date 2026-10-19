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
    expect(markdown).toContain('| Package | Layer | Entry | Visibility | Exports |');
    for (const pkg of manifest.packages) {
      for (const [entry, { visibility, exports }] of Object.entries(pkg.entries)) {
        const row = `| \`${pkg.name}\` | ${pkg.layer} | \`${entry}\` | ${visibility} | ${exports.map((name) => `\`${name}\``).join(', ')} |`;
        expect(markdown.split('\n')).toContain(row);
      }
    }
    expect(markdown).toContain('| `@polyspec/crudui-generator-core` | model | `./internal` | internal | `CELL_FORMATS`, `CELL_FORMAT_DEFAULT`, `CELL_RENDERERS`, `WIDGET_CANONICAL`, `WIDGET_COUNT`, `WIDGET_KINDS`, `WIDGET_LAYOUTS`, `buildListLayout`, `formRenderModel`, `optionSections`, `paginationPages`, `parseStyle` |');
  });
});
