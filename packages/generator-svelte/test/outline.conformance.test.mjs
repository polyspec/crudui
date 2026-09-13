/**
 * Structure map and data view conformance — Svelte SSR against the React reference.
 *
 * tests/fixtures/form-outline/cases.json holds the normalized React markup of the
 * stateless structure map and data view. Svelte renders `OutlineView` and
 * `DataPanel` with svelte/server and must reproduce it after the shared normalizer.
 */

import fs from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, test } from 'vitest';
import { bindForm, compileForm, formMessages } from '@crudui/generator-core';
import { normalizeHtml } from '../../../tests/fixtures/form-render/normalize.mjs';
import { DataPanel, OutlineView } from '../src/index.ts';

const cases = JSON.parse(fs.readFileSync(new URL('../../../tests/fixtures/form-outline/cases.json', import.meta.url), 'utf8'));

describe('structure map and data view: Svelte reproduces the fixture', () => {
  for (const c of cases) {
    test(c.name, () => {
      const messages = formMessages(c.options.language);
      const fields = bindForm(compileForm(c.spec), c.data, c.options);
      const state = { fields, canUndo: c.canUndo, ...(c.selection ? { selection: c.selection } : {}) };
      expect(normalizeHtml(render(OutlineView, { props: { state, messages } }).body)).toBe(c.expected_outline_html);
      expect(normalizeHtml(render(DataPanel, { props: { data: c.data, messages } }).body)).toBe(c.expected_data_html);
    });
  }
});
