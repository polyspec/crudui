// Runs the legacy-client and current-validator comparison with Vitest.
// Run: npx vitest run  (from tests/legacy-client) or `npm test` here.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runGate } = require('./gate.js');

describe('legacy dist.validate.js vs new validator-ts (client<->server idempotency)', () => {
  const r = runGate();

  it('validates legacy rules through the explicit legacy API', () => {
    const required = runGate({ file: 'required.json' });
    expect(required.regressions).toEqual([]);
    expect(required.matched).toBeGreaterThan(0);
  });

  it('drives the legacy runtime over a non-trivial slice of cases', () => {
    // Feasibility assertion: the legacy runtime is actually executed and
    // compared on a meaningful number of cases (not silently all-excluded).
    expect(r.matched + r.gaps).toBeGreaterThan(300);
  });

  it('has no undocumented client<->server mismatches (regression guard)', () => {
    if (r.regressions.length) {
      const lines = r.regressions.map(
        (d) => `${d.key} input=${JSON.stringify(d.input)} `
          + `legacy{valid:${d.legacy.valid},error:${d.legacy.error}} `
          + `new{valid:${d.js.valid},error:${d.js.error}}`
      );
      throw new Error(
        'Undocumented legacy<->new mismatches (add to known-gaps.js only if a '
        + 'real client<->server gap, otherwise fix the adapter):\n  '
        + lines.join('\n  ')
      );
    }
    expect(r.regressions.length).toBe(0);
  });

  it('every documented gap still reproduces (no stale entries)', () => {
    expect(r.staleGaps).toEqual([]);
  });

  it('reports the comparison census', () => {
    // Not an assertion of specific counts (those drift as cases evolve), just
    // a visible census so CI logs carry the numbers.
    // eslint-disable-next-line no-console
    console.log(
      `[legacy-comparison] total=${r.total} matched=${r.matched} gaps=${r.gaps} `
      + `excluded=${r.excluded} regressions=${r.regressions.length}`
    );
    expect(r.total).toBeGreaterThan(0);
  });
});
