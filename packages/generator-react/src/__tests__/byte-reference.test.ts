/**
 * React's server output is the byte reference for the HTML renderer, the C engine and the native
 * generators. The conformance tests compare normalized HTML, which hides a change in attribute
 * spelling or order; this test requires the exact bytes of the HTML renderer for every shared
 * form, list and detail case, so a byte change in either renderer fails here.
 */
import { describe, expect, test } from 'vitest';
import { compileForm, createForm } from '@crudui/generator-core';
import { renderDetail, renderForm, renderList } from '../index';
import {
  renderDetail as htmlDetail, renderForm as htmlForm, renderList as htmlList,
} from '@crudui/generator-html';
import formCases from '../../../../tests/fixtures/form-render/cases.json';
import listCases from '../../../../tests/fixtures/list-render/cases.json';
import detailCases from '../../../../tests/fixtures/detail-render/cases.json';

type Case = { name: string; spec: Record<string, unknown>; expectError?: unknown; options?: Record<string, unknown> };
const valid = <T extends Case>(cases: unknown) => (cases as T[]).filter(c => !c.expectError);

describe('React server output has the bytes of the HTML renderer', () => {
  for (const c of valid<Case & { data?: Record<string, unknown> }>(formCases)) {
    test(`form ${c.name}`, () => {
      const form = createForm(compileForm(c.spec, c.options), c.data ?? {}, c.options);
      expect(renderForm(form)).toBe(htmlForm(form));
    });
  }
  for (const c of valid<Case & { rows?: Array<Record<string, unknown>> }>(listCases)) {
    test(`list ${c.name}`, () => expect(renderList(c.spec, c.rows, c.options)).toBe(htmlList(c.spec, c.rows, c.options)));
  }
  for (const c of valid<Case & { record?: Record<string, unknown> }>(detailCases)) {
    test(`detail ${c.name}`, () => expect(renderDetail(c.spec, c.record, c.options)).toBe(htmlDetail(c.spec, c.record, c.options)));
  }
});
