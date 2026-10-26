import * as React from 'react';
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { RawText } from '../components/raw';
import { element } from './elements';

it('executes a client script once, retains its node and nonce, and removes it on unmount without rendering errors', () => {
  const errors: unknown[][] = [];
  const report = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { errors.push(args); });
  const initial = "document.body.dataset.rawTextRuns = String(Number(document.body.dataset.rawTextRuns || 0) + 1)";
  const changed = "document.body.dataset.rawTextRuns = 'reran'";
  let view: ReturnType<typeof render> | undefined;
  try {
    view = render(<RawText tag="script" nonce="widget-nonce" text={initial} />);
    const script = element(view.container, 'script', HTMLScriptElement);
    expect(script.nonce).toBe('widget-nonce');
    expect(document.body.dataset.rawTextRuns).toBe('1');
    view.rerender(<RawText tag="script" nonce="widget-nonce" text={changed} />);
    expect(view.container.querySelectorAll('script')).toHaveLength(1);
    expect(view.container.querySelector('script')).toBe(script);
    expect(script.textContent).toBe(changed);
    expect(document.body.dataset.rawTextRuns).toBe('1');
    view.rerender(<></>);
    expect(view.container.querySelectorAll('script')).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    view?.unmount();
    report.mockRestore();
    delete document.body.dataset.rawTextRuns;
  }
});
