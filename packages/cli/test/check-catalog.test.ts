/**
 * Verify the leaf-type catalog rule that the meta-schema cannot express.
 *
 * The meta-schema models `Field.type` as an unconstrained string, and the
 * forbidden-scan only rejects condition/magic meta KEYS — neither bounds the
 * VALUE of `type`. So an invented leaf widget (`type: checkbox`, never
 * registered) passes both structural checks with `ok:true`. The SKILL directs the
 * author to pick a type only from `describe`'s widget catalog; this test pins
 * that `check` actually enforces it.
 *
 * The cross-check is a CLI-layer (orchestrator) addition over the live registry
 * (WIDGET_KINDS, drift 0) — the 4-language validation core stays type-agnostic.
 *
 * Three cases:
 *   1. invented leaf type  → error (the registry has no such evaluator)
 *   2. valid leaf types    → ok   (canonical + alias both registered)
 *   3. container field      → ok   (owns `properties` → exempt from the leaf
 *                                   check; `group` is not a leaf widget kind)
 */

import { describe as descTest, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { runCheck } from '../src/check.ts';
import { WIDGET_KINDS } from '../../generator-core/src/widget.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => resolve(HERE, 'fixtures', name);

descTest('check enforces the leaf-type catalog (WIDGET_KINDS), beyond meta-schema + forbidden', () => {
  it('rejects an unresolved reference instead of checking the uncomposed field', async () => {
    const result = await runCheck(fixture('unresolved-reference.yml'));
    expect(result.ok).toBe(false);
    expect(result.errors.some(error => error.reason.includes('missing.yml'))).toBe(true);
  });
  it('sanity: `checkbox` is an invented leaf type — not a registered widget kind', () => {
    expect(WIDGET_KINDS).not.toContain('checkbox');
    // the real option widgets ARE registered (proves the catalog is non-trivial)
    expect(WIDGET_KINDS).toContain('text');
    expect(WIDGET_KINDS).toContain('radio');
  });

  it('rejects an invented leaf type through the catalog check', async () => {
    const r = await runCheck(fixture('invented-leaf-type.yml'));
    expect(r.ok).toBe(false);
    // the error names the offending field path and the unregistered type value
    const hit = r.errors.find((e) => /checkbox/.test(e.reason) || e.key === 'checkbox');
    expect(hit).toBeDefined();
    expect(hit!.path).toContain('agree');
  });

  it('accepts leaf fields whose type is a registered kind (canonical + alias)', async () => {
    const r = await runCheck(fixture('valid-leaf-type.yml'));
    expect(r).toEqual({ ok: true, errors: [] });
  });

  it('exempts container fields (own `properties`) from the leaf-type check', async () => {
    // `group` is deliberately NOT a registered widget kind. A container must NOT
    // be catalog-checked as a leaf — only its leaf descendants are.
    expect(WIDGET_KINDS).not.toContain('group');
    const r = await runCheck(fixture('container-type.yml'));
    expect(r).toEqual({ ok: true, errors: [] });
  });

  it('catches an invented leaf type at any depth (depth-unbounded walk)', async () => {
    const r = await runCheck(fixture('nested-invented-leaf-type.yml'));
    expect(r.ok).toBe(false);
    const hit = r.errors.find((e) => e.key === 'slider');
    expect(hit).toBeDefined();
    expect(hit!.path).toBe('contact.method');
  });

  it('admits registry aliases, not only canonical kinds (full WIDGET_KINDS set)', async () => {
    // these are alias keys whose canonical kind differs (dropdown→select etc.)
    for (const alias of ['dropdown', 'wysiwyg', 'action']) {
      expect(WIDGET_KINDS).toContain(alias);
    }
    const r = await runCheck(fixture('alias-leaf-type.yml'));
    expect(r).toEqual({ ok: true, errors: [] });
  });
});
