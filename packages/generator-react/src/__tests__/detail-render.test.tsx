import { describe, expect, test } from 'vitest';
import { renderDetail } from '../index';

describe('React detail rendering', () => {
  test('renders the shared read-only detail contract', () => {
    const html = renderDetail({
      fields: {
        name: { field: '.name', label: 'Name' },
        state: { field: '.state', format: { type: 'badge', map: { active: 'success' } } },
      },
    }, { name: 'Ada', state: 'active' });

    expect(html).toContain('<dl class="detail-view">');
    expect(html).toContain('<dt class="detail-label">Name</dt>');
    expect(html).toContain('<dd class="detail-value detail-value-text">Ada</dd>');
    expect(html).toContain('class="badge badge-success"');
  });
});
