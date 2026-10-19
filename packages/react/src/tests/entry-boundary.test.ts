import { describe, expect, test, vi } from 'vitest';

vi.mock('react-dom/server', () => {
  throw new Error('component entry loaded react-dom/server');
});

describe('React package entries', () => {
  test('component entry loads without the server renderer', async () => {
    const components = await import('../index');
    expect(typeof components.Form).toBe('function');
    expect('renderForm' in components).toBe(false);
    expect('renderList' in components).toBe(false);
    expect('renderDetail' in components).toBe(false);
  });
});
