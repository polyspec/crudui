import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateDetail, validateList } from '@crudui/validator';

import { pipelineCombinations, scoreCellText, stageContent } from './pipeline-flow.mjs';
import {
  expectedStageHtml, expectedValidation, formData, pageAddress, recordClients, recordFixture,
  recordModes, recordServers, recordSpecs, savedRecord, selectionQuery, stageSpecs,
} from './record-contract.mjs';
import { pipelineServers } from './runtime-paths.mjs';

const example = new URL('../', import.meta.url);
const read = file => readFile(new URL(file, example), 'utf8');
const selection = { lang: 'ko', server: 'php', framework: 'react', initialization: 'ssr', mode: 'createForm', page: 2 };

test('the shared fixture holds 45 records in id order that pass their own form', () => {
  const records = recordFixture();
  assert.equal(records.length, 45);
  assert.deepEqual(records.map(record => record.id), Array.from({ length: 45 }, (_, index) => String(index + 1)));
  for (const record of records) {
    assert.deepEqual(Object.keys(record), ['id', 'name', 'status', 'joined', 'score', 'relation', 'avatar', 'markup']);
    assert.equal(typeof record.score, 'number');
    assert.deepEqual(expectedValidation(formData(record)), { valid: true, errors: [] }, `record ${record.id}`);
    assert.deepEqual(savedRecord(record, formData(record)), record, `record ${record.id} round-trips through its form`);
  }
});

test('the list, detail and form specifications describe one record', () => {
  const specs = recordSpecs();
  assert.deepEqual(validateList(specs.list), { valid: true, errors: [] });
  assert.deepEqual(validateDetail(specs.detail), { valid: true, errors: [] });
  assert.equal(specs.list.sort, undefined, 'the list is in store order, not a declared sort');
  assert.equal(specs.form.properties.id.type, 'dummy-input', 'the id is read-only in the form');
  assert.equal(specs.form.properties.avatar, undefined, 'the avatar is not edited');
});

test('every generated link carries the whole selection in one order', () => {
  assert.equal(selectionQuery(selection), 'lang=ko&server=php&framework=react&initialization=ssr&mode=createForm&page=2');
  assert.equal(pageAddress('list', selection, { saved: '22' }), `/?${selectionQuery(selection)}&saved=22`);
  assert.equal(pageAddress('form', selection, { id: '22' }), `/form?id=22&${selectionQuery(selection)}`);
  const specs = stageSpecs(selection);
  assert.equal(specs.list.columns.name.format.href, `/detail?id={=id}&${selectionQuery(selection)}`);
  assert.equal(specs.detail.fields.id.format.href, `/form?id={=id}&${selectionQuery(selection)}`);
  const records = recordFixture();
  const list = expectedStageHtml('list', selection, { records });
  assert.equal((list.match(/<tr>/g) ?? []).length, 21, 'page 2 holds 20 rows');
  assert.match(list, /href="\/detail\?id=40&amp;lang=ko&amp;server=php&amp;framework=react&amp;initialization=ssr&amp;mode=createForm&amp;page=2"/);
  assert.doesNotMatch(list, /id=41&/);
  const form = expectedStageHtml('form', selection, { record: records[21] });
  assert.match(form, /^<form id="record-form" method="post" action="\/api\/php\/records\/22" enctype="multipart\/form-data">/);
  assert.match(form, /name="form\[relation\]\[name\]"/);
  assert.equal(stageContent(`<main><section id="stage" data-view="form">${form}</section></main>`), form);
});

test('the flow check covers 40 combinations with their own records and both form modes', () => {
  const combinations = pipelineCombinations();
  assert.equal(combinations.length, 40);
  assert.equal(new Set(combinations.map(combination => combination.id)).size, 40);
  assert.deepEqual(recordServers, pipelineServers, 'every selectable server is checked');
  for (const server of recordServers) {
    const own = combinations.filter(combination => combination.selection.server === server);
    assert.equal(own.length, 8);
    assert.equal(new Set(own.map(combination => combination.recordId)).size, 8, `${server}: one record per combination`);
    assert.deepEqual([...new Set(own.map(combination => combination.selection.mode))].sort(), [...recordModes].sort());
  }
  for (const client of recordClients) {
    assert.deepEqual([...new Set(combinations.filter(combination => combination.selection.framework === client)
      .map(combination => combination.selection.mode))].sort(), [...recordModes].sort(), `${client}: both modes`);
  }
  for (const combination of combinations) {
    assert.ok(Number(combination.recordId) >= 21 && Number(combination.recordId) <= 40, 'the record is on page 2');
    assert.equal(combination.selection.page, 2);
  }
  assert.equal(new Set(combinations.map(combination => combination.score)).size, 40);
  assert.equal(scoreCellText('9121', 'en'), '$9,121');
});

test('the record resource has one source: no constant records and no separate form scenario', async () => {
  assert.equal(existsSync(new URL('src/pipeline.mjs', example)), false, 'src/pipeline.mjs with its constant records is removed');
  const server = await read('server.mjs');
  assert.doesNotMatch(server, /pipelineRecords|jsData|\/api\/pipeline\//, 'the public server keeps no records of its own');
  const main = await read('public/main.mjs');
  assert.doesNotMatch(main, /crudui:pipeline-saved|form-frame|\/api\/pipeline\//, 'the page has no form frame and no HTML stage request');
  const build = await read('build.mjs');
  for (const file of ['customer-records.json', 'customer-specs.json']) {
    assert.match(build, new RegExp(`fixtures/${file.replace('.', '\\.')}`), `the build publishes ${file}`);
  }
});

test('the page selects the form mode and renders every view in its stage', async () => {
  const html = await read('public/index.html');
  assert.match(html, /<select id="mode">\s*<option value="bindForm">[^<]*<\/option>\s*<option value="createForm">/);
  assert.match(html, /<section id="stage"[^>]*><\/section>/);
  assert.doesNotMatch(html, /<iframe/);
});
