/**
 * Structure map and data view conformance — Vue 3 SSR against the React reference.
 *
 * tests/fixtures/form-outline/cases.json holds the normalized React markup of the
 * stateless structure map and data view. Vue renders `outlineVNode` and
 * `dataVNode` through vue/server-renderer and must reproduce it after the shared
 * normalizer.
 */

import fs from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, test } from 'vitest';
import { bindForm, compileForm, formMessages } from '@crudui/generator-core';
import { normalizeHtml } from '../../../tests/fixtures/form-render/normalize.mjs';
import { dataVNode, outlineVNode } from '../src/index.ts';

const cases = JSON.parse(fs.readFileSync(new URL('../../../tests/fixtures/form-outline/cases.json', import.meta.url), 'utf8'));

const ssr = render => renderToString(createSSRApp({ render }));

describe('structure map and data view: Vue reproduces the fixture', () => {
  for (const c of cases) {
    test(c.name, async () => {
      const messages = formMessages(c.options.language);
      const fields = bindForm(compileForm(c.spec), c.data, c.options);
      const state = { fields, canUndo: c.canUndo };
      expect(normalizeHtml(await ssr(() => outlineVNode(state, messages)))).toBe(c.expected_outline_html);
      expect(normalizeHtml(await ssr(() => dataVNode(c.data, messages)))).toBe(c.expected_data_html);
    });
  }
});
