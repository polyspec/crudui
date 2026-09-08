import { describe, expect, it } from 'vitest';
import { evalAppearance, makeContext } from './expr';

describe('appearance ternary evaluation', () => {
  const context = makeContext(['value'], { enabled: true, selected: 7 });

  it('resolves a selected field path', () => {
    expect(evalAppearance('.enabled ? .selected : 0', context)).toBe('7');
  });

  it('evaluates a nested true branch', () => {
    expect(evalAppearance(".enabled ? .selected == 7 ? 'yes' : 'no' : 'off'", context)).toBe('yes');
  });

  it('decodes quoted branch escapes with the expression parser', () => {
    expect(evalAppearance(String.raw`.enabled ? 'line\nnext' : ''`, context)).toBe('line\nnext');
  });
});
