import { describe, expect, test } from 'vitest';
import { renderDetail } from '../src/index.ts';
import { normalizeHtml } from '../../../tests/fixtures/form-render/normalize.mjs';

describe('Svelte detail rendering', () => {
  test('renders the shared read-only detail contract', () => {
    const html = normalizeHtml(renderDetail({ fields: { name: { field: '.name', label: 'Name' } } }, { name: 'Ada' }));
    expect(html).toContain('<dl class="detail-view">');
    expect(html).toContain('<dt class="detail-label">Name</dt>');
    expect(html).toContain('<dd class="detail-value detail-value-text">Ada</dd>');
  });
});
