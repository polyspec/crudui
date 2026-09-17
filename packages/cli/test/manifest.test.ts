import { describe, expect, it } from 'vitest';
import { loadManifest, renderManifestMarkdown } from '../src/manifest.ts';

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
    expect(markdown).toContain('| `@crudui/generator-core` | model | `./internal` | internal | `CELL_FORMATS`, `CELL_FORMAT_DEFAULT`, `CELL_RENDERERS`, `WIDGET_CANONICAL`, `WIDGET_COUNT`, `WIDGET_KINDS`, `WIDGET_LAYOUTS`, `listLayout`, `paginationPages`, `parseStyle` |');
  });
});
