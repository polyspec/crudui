import { describe, expect, test } from 'vitest';
import { renderDetail } from '../detailSsr';

describe('Vue detail rendering', () => {
  test('renders the shared read-only detail contract', async () => {
    const html = await renderDetail({ fields: { name: { field: '.name', label: 'Name' } } }, { name: 'Ada' });
    expect(html).toContain('<dl class="detail-view">');
    expect(html).toContain('<dt class="detail-label">Name</dt>');
    expect(html).toContain('<dd class="detail-value detail-value-text">Ada</dd>');
  });
});
