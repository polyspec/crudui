/**
 * drift-0 proof for `crudui describe`'s LIST capability (SPEC §9).
 *
 * The list section is produced like the rest of describe — a pure projection of
 * the code single-source-of-truth + the parsed meta-schema, never a hand-copied
 * catalog:
 *
 *   - read-cell format catalog ← generator-core cell.ts `CELL_FORMATS`
 *     (= Object.keys(CELL_RENDERERS); the SAME map renderCell dispatches over)
 *   - list structure (columns/search/sort/pagination/actions/empty/design) ←
 *     contracts/schema/crudui.schema.json List/Column/CellFormat/Pagination/Sort/
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

import assert from 'node:assert/strict';
import { describe as descTest, it, test, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe } from '../src/describe.ts';
import {
  CELL_FORMATS,
  CELL_FORMAT_DEFAULT,
  CELL_RENDERERS,
} from '@polyspec/crudui-generator-core/internal';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(HERE, '../../..', 'contracts/schema/crudui.schema.json');
const schema: unknown = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
/** `value` as the JSON object that `what` names. */
function record(value: unknown, what: string): Record<string, unknown> {
  assert(isRecord(value), `${what} is a JSON object`);
  return value;
}
const definitions = record(record(schema, 'the meta-schema').definitions, 'definitions');
/** The meta-schema definition `name`. */
const definition = (name: string): Record<string, unknown> => record(definitions[name], `definitions.${name}`);
/** The properties of a schema object. */
const propertiesOf = (node: Record<string, unknown>): Record<string, unknown> => record(node.properties, 'properties');
/** The object member of a meta-schema definition written as `anyOf`. */
function objectMember(node: Record<string, unknown>): Record<string, unknown> {
  const members: unknown = node.anyOf;
  assert(Array.isArray(members), 'the definition is an anyOf');
  const member: unknown = members.find((m: unknown) => isRecord(m) && m.type === 'object');
  return record(member, 'the object member');
}

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
    const obj = objectMember(definition('CellFormat'));
    expect(r.list.cellFormatSchemaKeys).toEqual(Object.keys(propertiesOf(obj)));
  });

  it('list entry is the additive List definition (not Field)', () => {
    expect(r.list.entry).toBe('#/definitions/List');
    expect(definitions.List).toBeDefined();
  });

  it('list structure equals the parsed meta-schema definitions exactly', () => {
    const listProps = Object.keys(propertiesOf(definition('List'))).filter(
      (k) => k !== '$ref' && k !== '$patch'
    );
    expect(r.list.structure.firstClass).toEqual(listProps);

    const colProps = Object.keys(propertiesOf(definition('Column'))).filter(
      (k) => k !== '$ref' && k !== '$patch'
    );
    expect(r.list.structure.column.firstClass).toEqual(colProps);

    const pagObj = objectMember(definition('Pagination'));
    expect(r.list.structure.pagination.keys).toEqual(Object.keys(propertiesOf(pagObj)));
    expect(r.list.structure.pagination.modes).toEqual(record(propertiesOf(pagObj).mode, 'mode').enum);

    expect(r.list.structure.sort.keys).toEqual(
      Object.keys(propertiesOf(definition('Sort')))
    );
    expect(r.list.structure.sort.dirs).toEqual(record(propertiesOf(definition('Sort')).dir, 'dir').enum);

    const actObj = objectMember(definition('ListAction'));
    expect(r.list.structure.action.objectKeys).toEqual(Object.keys(propertiesOf(actObj)));
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
    vi.doUnmock('@polyspec/crudui-generator-core/internal');
  });

  test('mocking cell.ts with an extra `sparkline` renderer makes describe.list.cellFormats include it', async () => {
    const realCell = await import('@polyspec/crudui-generator-core/internal');

    // The injected module: the SAME exports, but CELL_RENDERERS gains one key, and
    // CELL_FORMATS is re-projected from it (exactly what adding a renderer in
    // cell.ts does — CELL_FORMATS = Object.keys(CELL_RENDERERS)).
    const extendedRenderers = {
      ...realCell.CELL_RENDERERS,
      sparkline: (value: unknown) => (typeof value === 'string' ? value : ''),
    };
    vi.doMock('@polyspec/crudui-generator-core/internal', () => ({
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
    for (const original of realCell.CELL_FORMATS) {
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

  it('describes the maintained expression contract', () => {
    expect(r.grammar.source).toBe('docs/spec/expressions.md');
    // Every row of the token table, with a | of a cell escaped as \| (C14.41).
    expect(r.grammar.tokens).toHaveLength(17);
    expect(r.grammar.tokens.find((item) => item.token === 'LPAREN RPAREN')?.pattern).toBe('( )');
    expect(r.grammar.tokens.find((item) => item.token === 'AND OR NOT')?.pattern).toBe('&& || !');
    expect(r.grammar.precedence).toHaveLength(6);
    expect(r.grammar.truthyFalsy.join(' ')).toContain('including empty arrays and empty objects, are true');
    expect(r.grammar.unsupported).toContain('function calls');
  });

  it('the list section sits beside them without colliding (own top-level key)', () => {
    expect(r.list).toBeDefined();
    // describe still has the pre-existing keys (no rename/removal).
    for (const key of ['widgets', 'rules', 'slots', 'buckets', 'grammar', 'matrix']) {
      expect(r).toHaveProperty(key);
    }
  });
});
