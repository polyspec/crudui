/**
 * drift-0 proof for `form-spec describe`'s LIST capability (schema §9).
 *
 * The list section is produced like the rest of describe — a pure projection of
 * the code single-source-of-truth + the parsed meta-schema, never a hand-copied
 * catalog:
 *
 *   - read-cell format catalog ← generator-core cell.ts `CELL_FORMATS`
 *     (= Object.keys(CELL_RENDERERS); the SAME map renderCell dispatches over)
 *   - list structure (columns/search/sort/pagination/actions/empty/design) ←
 *     schema/form-spec.schema.json List/Column/CellFormat/Pagination/Sort/
 *     ListAction definitions, JSON.parse'd
 *
 * So a format added to cell.ts's renderer map, or a key changed in a List family
 * definition, surfaces in the NEXT `describe` with zero edits to describe.ts.
 *
 * Tests:
 *   1. describe's cellFormats equal the live CELL_FORMATS exactly (none dropped,
 *      none invented); the default flag equals CELL_FORMAT_DEFAULT
 *   2. the full SPEC §9.2 catalog (text/date/number/badge/link/choice-label/
 *      bool/image/html) is present — the catalog is non-trivial
 *   3. cell cross-check holds (catalog non-empty, default present, schema `type`
 *      is the open dispatch key)
 *   4. list structure equals the parsed meta-schema definitions exactly
 *   5. injection: extending the renderer-map keys changes the projection (it is
 *      a projection of Object.keys, not a frozen list) — and removing one drops
 *      it; describe.ts is never touched to add a format
 *   6. additive: the form surfaces (widgets/rules/slots) are unchanged by the
 *      list section
 */

import { describe as descTest, it, test, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe } from '../src/describe.ts';
import {
  CELL_FORMATS,
  CELL_FORMAT_DEFAULT,
  CELL_RENDERERS,
} from '../../generator-core/src/cell.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(HERE, '../../..', 'schema/form-spec.schema.json');
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));

descTest('describe.list is a drift-0 projection of cell.ts + the meta-schema', () => {
  const r = describe();

  it('cellFormats equal the live CELL_FORMATS exactly — none dropped, none invented', () => {
    const surfaced = r.list.cellFormats.map((f) => f.type).sort();
    expect(surfaced).toEqual([...CELL_FORMATS].sort());
  });

  it('the default flag marks exactly CELL_FORMAT_DEFAULT', () => {
    const defaults = r.list.cellFormats.filter((f) => f.isDefault).map((f) => f.type);
    expect(defaults).toEqual([CELL_FORMAT_DEFAULT]);
  });

  it('the SPEC §9.2 catalog is present (non-trivial projection)', () => {
    const surfaced = new Set(r.list.cellFormats.map((f) => f.type));
    for (const type of [
      'text',
      'date',
      'number',
      'badge',
      'link',
      'choice-label',
      'bool',
      'image',
      'html',
    ]) {
      expect(surfaced.has(type)).toBe(true);
    }
  });

  it('cell cross-check holds (catalog ≡ cell.ts; schema documents the open dispatch key)', () => {
    expect(r.list.cellCrossCheckOk).toBe(true);
  });

  it('cellFormatSchemaKeys equal the meta-schema CellFormat object-member keys', () => {
    const obj = (schema.definitions.CellFormat.anyOf as any[]).find(
      (m) => m.type === 'object'
    );
    expect(r.list.cellFormatSchemaKeys).toEqual(Object.keys(obj.properties));
  });

  it('list entry is the additive List definition (not Field)', () => {
    expect(r.list.entry).toBe('#/definitions/List');
    expect(schema.definitions.List).toBeDefined();
  });

  it('list structure equals the parsed meta-schema definitions exactly', () => {
    const listProps = Object.keys(schema.definitions.List.properties).filter(
      (k) => k !== '$ref' && k !== '$patch'
    );
    expect(r.list.structure.firstClass).toEqual(listProps);

    const colProps = Object.keys(schema.definitions.Column.properties).filter(
      (k) => k !== '$ref' && k !== '$patch'
    );
    expect(r.list.structure.column.firstClass).toEqual(colProps);

    const pagObj = (schema.definitions.Pagination.anyOf as any[]).find(
      (m) => m.type === 'object'
    );
    expect(r.list.structure.pagination.keys).toEqual(Object.keys(pagObj.properties));
    expect(r.list.structure.pagination.modes).toEqual(pagObj.properties.mode.enum);

    expect(r.list.structure.sort.keys).toEqual(
      Object.keys(schema.definitions.Sort.properties)
    );
    expect(r.list.structure.sort.dirs).toEqual(schema.definitions.Sort.properties.dir.enum);

    const actObj = (schema.definitions.ListAction.anyOf as any[]).find(
      (m) => m.type === 'object'
    );
    expect(r.list.structure.action.objectKeys).toEqual(Object.keys(actObj.properties));
  });
});

descTest('drift injection — list cell catalog tracks the renderer map, it is not a constant', () => {
  it('extending the renderer-map keys would surface a new format; removing drops it', () => {
    // describe's cell catalog is `Object.keys(CELL_RENDERERS)` projected. Prove
    // the mechanism is a projection over that map (not a frozen list baked into
    // describe.ts): a key added to the map's key set appears, a removed one
    // vanishes — exactly what adding a renderer in cell.ts does, with describe.ts
    // untouched.
    const project = (keys: string[]) => new Set(keys);

    const base = project(Object.keys(CELL_RENDERERS));
    // sanity: the live projection equals what describe surfaces.
    expect([...base].sort()).toEqual(
      describe().list.cellFormats.map((f) => f.type).sort()
    );

    const added = project([...Object.keys(CELL_RENDERERS), 'sparkline']); // hypothetical new cell
    expect(added.has('sparkline')).toBe(true);
    expect(base.has('sparkline')).toBe(false);

    const removed = project(Object.keys(CELL_RENDERERS).filter((k) => k !== 'badge'));
    expect(removed.has('badge')).toBe(false);
    expect(base.has('badge')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// drift-0 END-TO-END — a format ADDED in cell.ts flows into describe through the
// real module boundary, with describe.ts UNTOUCHED. The injection block above
// proves the projection mechanism in the abstract; this proves the WIRING: mock
// the generator-core cell module with one extra renderer (`sparkline`), re-import
// describe fresh, and assert describe's list catalog surfaces it. If describe.ts
// held a hand-copied catalog, the new format would NOT appear — the test would
// fail. This is the literal "add a renderer to cell.ts → describe reflects it"
// guarantee, executed.
// ---------------------------------------------------------------------------
descTest('drift-0 wiring — a renderer added in cell.ts surfaces in describe (describe.ts untouched)', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../generator-core/src/cell.ts');
  });

  test('mocking cell.ts with an extra `sparkline` renderer makes describe.list.cellFormats include it', async () => {
    const realCell = await import('../../generator-core/src/cell.ts');

    // The injected module: the SAME exports, but CELL_RENDERERS gains one key, and
    // CELL_FORMATS is re-projected from it (exactly what adding a renderer in
    // cell.ts does — CELL_FORMATS = Object.keys(CELL_RENDERERS)).
    const extendedRenderers = {
      ...realCell.CELL_RENDERERS,
      sparkline: (value: unknown) => String(value ?? ''),
    };
    vi.doMock('../../generator-core/src/cell.ts', () => ({
      ...realCell,
      CELL_RENDERERS: extendedRenderers,
      CELL_FORMATS: Object.keys(extendedRenderers),
      CELL_FORMAT_DEFAULT: realCell.CELL_FORMAT_DEFAULT,
    }));

    vi.resetModules();
    const { describe: describeFresh } = await import('../src/describe.ts');
    const surfaced = describeFresh().list.cellFormats.map((f) => f.type);

    // The new format flows through; the originals are still there; default holds.
    expect(surfaced).toContain('sparkline');
    for (const original of [...realCell.CELL_FORMATS]) {
      expect(surfaced).toContain(original);
    }
    const defaults = describeFresh().list.cellFormats.filter((f) => f.isDefault).map((f) => f.type);
    expect(defaults).toEqual([realCell.CELL_FORMAT_DEFAULT]);
  });

  test('the UN-mocked describe does NOT carry the injected format (the mock was the only source)', async () => {
    // Control: with no mock, `sparkline` is absent — proving the previous test's
    // surfacing came from cell.ts, not a constant in describe.ts.
    vi.resetModules();
    const { describe: describeFresh } = await import('../src/describe.ts');
    const surfaced = describeFresh().list.cellFormats.map((f) => f.type);
    expect(surfaced).not.toContain('sparkline');
  });
});

descTest('list capability is additive — form describe surfaces are unchanged', () => {
  const r = describe();

  it('widgets / rules / slots / forbidden / grammar surfaces remain populated', () => {
    expect(r.widgets.length).toBeGreaterThan(0);
    expect(r.rules.length).toBeGreaterThan(0);
    expect(r.slots.firstClass.length).toBeGreaterThan(0);
    expect(r.forbiddenKeys.crossCheckOk).toBe(true);
    expect(r.grammar.tokens.length).toBeGreaterThan(0);
  });

  it('the list section sits beside them without colliding (own top-level key)', () => {
    expect(r.list).toBeDefined();
    // describe still has the pre-existing keys (no rename/removal).
    for (const key of ['widgets', 'rules', 'slots', 'buckets', 'grammar', 'matrix']) {
      expect(r).toHaveProperty(key);
    }
  });
});
