import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';

import { buildDocumentationSite } from '../../scripts/docs-site/build.mjs';

async function files(directory) {
  const result = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const filename = join(current, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else result.push(relative(directory, filename));
    }
  }
  await visit(directory);
  return result.sort();
}

async function contents(directory) {
  const result = new Map();
  for (const filename of await files(directory)) {
    result.set(filename, await readFile(join(directory, filename), 'utf8'));
  }
  return result;
}

test('documentation build preserves page routes, titles, links and public files', async t => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'crudui-doc-site-'));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const docsDirectory = join(repositoryRoot, 'docs');
  const outputDirectory = join(repositoryRoot, 'output');
  await mkdir(join(docsDirectory, 'guide'), { recursive: true });
  await mkdir(join(docsDirectory, 'public', 'assets'), { recursive: true });
  await mkdir(join(repositoryRoot, 'tests'), { recursive: true });
  await writeFile(join(docsDirectory, 'index.md'), [
    '# Home',
    '',
    '[Guide](./guide/start.md#install)',
  ].join('\n'));
  await writeFile(join(docsDirectory, 'guide', 'start.md'), [
    '# Guide & usage',
    '',
    '## Install',
    '',
    '[Home](../index.md)',
    '',
    '[Build notes](../../tests/build-notes.md#checks)',
  ].join('\n'));
  await writeFile(join(repositoryRoot, 'tests', 'build-notes.md'), '# Build notes');
  await writeFile(join(docsDirectory, 'public', 'assets', 'fixture.txt'), 'public asset\n');

  const report = await buildDocumentationSite({ repositoryRoot, docsDirectory, outputDirectory });

  assert.deepEqual(await files(outputDirectory), [
    '404.html',
    'assets/fixture.txt',
    'assets/site.css',
    'guide/start.html',
    'index.html',
  ]);
  assert.deepEqual(report, { pages: 3, documents: 2, assets: 2 });
  const index = await readFile(join(outputDirectory, 'index.html'), 'utf8');
  const guide = await readFile(join(outputDirectory, 'guide', 'start.html'), 'utf8');
  assert.match(index, /<title>Home \| CRUDUI<\/title>/);
  assert.match(index, /<h1 id="home">Home<\/h1>/);
  assert.match(index, /href="\/guide\/start#install"/);
  assert.match(guide, /<html lang="en-US">/);
  assert.match(guide, /<title>Guide &amp; usage \| CRUDUI<\/title>/);
  assert.match(guide, /<h1 id="guide-usage">Guide &amp; usage<\/h1>/);
  assert.match(guide, /href="\/"/);
  assert.match(guide, /href="https:\/\/github\.com\/crudui\/crudui\/blob\/main\/tests\/build-notes\.md#checks"/);
  assert.equal(await readFile(join(outputDirectory, 'assets', 'fixture.txt'), 'utf8'), 'public asset\n');
  assert.match(await readFile(join(outputDirectory, '404.html'), 'utf8'), /<title>404 \| CRUDUI<\/title>/);
});

test('documentation build rejects a document without one level-one heading', async t => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'crudui-doc-heading-'));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const docsDirectory = join(repositoryRoot, 'docs');
  await mkdir(docsDirectory);
  await writeFile(join(docsDirectory, 'index.md'), '## Missing title\n');
  await assert.rejects(
    buildDocumentationSite({
      repositoryRoot,
      docsDirectory,
      outputDirectory: join(repositoryRoot, 'output'),
    }),
    /exactly one level-one heading/,
  );
});

test('documentation builds are deterministic', async t => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'crudui-doc-repeat-'));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const docsDirectory = join(repositoryRoot, 'docs');
  await mkdir(docsDirectory);
  await writeFile(join(docsDirectory, 'index.md'), '# Repeatable\n');
  const first = join(repositoryRoot, 'first');
  const second = join(repositoryRoot, 'second');
  await buildDocumentationSite({ repositoryRoot, docsDirectory, outputDirectory: first });
  await buildDocumentationSite({ repositoryRoot, docsDirectory, outputDirectory: second });
  assert.deepEqual(await contents(first), await contents(second));
});
