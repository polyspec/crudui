/**
 * Structure map and data view conformance — HTML renderer against the React reference.
 *
 * tests/fixtures/form-outline/cases.json holds the normalized React markup of the
 * stateless structure map and data view. `renderOutlineView` and
 * `renderDataPanel` must reproduce it after the shared normalizer.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { bindForm, compileForm, formMessages, type RowSelection } from '@crudui/generator-core';
// @ts-expect-error — shared JS normalizer (cross-framework).
import { normalizeHtml } from '../../../tests/fixtures/form-render/normalize.mjs';
import { renderDataPanel, renderOutlineView } from './index';

interface OutlineCase {
  name: string;
  spec: Record<string, unknown>;
  data: Record<string, unknown>;
  options: { language: string };
  selection?: RowSelection;
  canUndo: boolean;
  expected_outline_html: string;
  expected_data_html: string;
}

const cases = JSON.parse(readFileSync(new URL('../../../tests/fixtures/form-outline/cases.json', import.meta.url), 'utf8')) as OutlineCase[];

describe('structure map and data view: HTML reproduces the fixture', () => {
  for (const c of cases) {
    test(c.name, () => {
      const messages = formMessages(c.options.language);
      const fields = bindForm(compileForm(c.spec), c.data, c.options as never);
      const state = { fields, canUndo: c.canUndo, ...(c.selection ? { selection: c.selection } : {}) };
      expect(normalizeHtml(renderOutlineView(state, messages))).toBe(c.expected_outline_html);
      expect(normalizeHtml(renderDataPanel(c.data, messages))).toBe(c.expected_data_html);
    });
  }
});
