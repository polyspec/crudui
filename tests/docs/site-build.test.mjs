import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';

import { buildDocumentationSite } from '../../scripts/docs-site/build.mjs';
import { createDocumentationServer } from '../../scripts/docs-site/server.mjs';

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
    '',
    '![Fixture](./public/assets/fixture.txt)',
  ].join('\n'));
  await writeFile(join(docsDirectory, 'guide', 'start.md'), [
    '# Guide & usage',
    '',
    '## Install',
    '',
    '## 0. Processing',
    '',
    '## @crudui/validator',
    '',
    '## CELL_FORMATS',
    '',
    '## Install',
    '',
    '[Home](../index.md)',
    '',
    '[Build notes](../../tests/build-notes.md#checks)',
  ].join('\n'));
  await writeFile(join(repositoryRoot, 'tests', 'build-notes.md'), '# Build notes');
  await writeFile(join(docsDirectory, 'public', 'assets', 'fixture.txt'), 'public asset\n');
  await writeFile(join(docsDirectory, 'public', 'assets', 'source.md'), '# Public source file\n');

  const report = await buildDocumentationSite({ repositoryRoot, docsDirectory, outputDirectory });

  assert.deepEqual(await files(outputDirectory), [
    '404.html',
    'assets/fixture.txt',
    'assets/site.css',
    'assets/source.md',
    'guide/start.html',
    'index.html',
  ]);
  assert.deepEqual(report, { pages: 3, documents: 2, assets: 3 });
  const index = await readFile(join(outputDirectory, 'index.html'), 'utf8');
  const guide = await readFile(join(outputDirectory, 'guide', 'start.html'), 'utf8');
  assert.match(index, /<title>Home \| CRUDUI<\/title>/);
  assert.match(index, /<h1 id="home">Home<\/h1>/);
  assert.match(index, /href="\/guide\/start\.html#install"/);
  assert.match(index, /src="\/assets\/fixture\.txt"/);
  assert.match(guide, /<html lang="en-US">/);
  assert.match(guide, /<title>Guide &amp; usage \| CRUDUI<\/title>/);
  assert.match(guide, /<h1 id="guide-usage">Guide &amp; usage<\/h1>/);
  assert.match(guide, /<h2 id="_0-processing">0\. Processing<\/h2>/);
  assert.match(guide, /<h2 id="crudui-validator">@crudui\/validator<\/h2>/);
  assert.match(guide, /<h2 id="cell-formats">CELL_FORMATS<\/h2>/);
  assert.match(guide, /<h2 id="install-1">Install<\/h2>/);
  assert.match(guide, /href="\/">Home<\/a>/);
  assert.match(guide, /href="https:\/\/github\.com\/polyspec\/crudui\/blob\/main\/tests\/build-notes\.md#checks"/);
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

test('documentation build rejects an output path that contains its input', async t => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'crudui-doc-output-'));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const docsDirectory = join(repositoryRoot, 'docs');
  await mkdir(docsDirectory);
  await writeFile(join(docsDirectory, 'index.md'), '# Source remains\n');
  await assert.rejects(
    buildDocumentationSite({ repositoryRoot, docsDirectory, outputDirectory: repositoryRoot }),
    /output cannot contain the documentation input/,
  );
  assert.equal(await readFile(join(docsDirectory, 'index.md'), 'utf8'), '# Source remains\n');
});

for (const [name, link, error] of [
  ['missing site document', './missing.md', /Missing documentation target/],
  ['missing site fragment', './index.md#missing', /Missing documentation fragment/],
  ['missing repository file', '../missing.md', /Invalid repository link/],
]) {
  test('documentation build rejects a ' + name, async t => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), 'crudui-doc-link-'));
    t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
    const docsDirectory = join(repositoryRoot, 'docs');
    await mkdir(docsDirectory);
    await writeFile(join(docsDirectory, 'index.md'), '# Links\n\n[Invalid](' + link + ')\n');
    await assert.rejects(
      buildDocumentationSite({
        repositoryRoot,
        docsDirectory,
        outputDirectory: join(repositoryRoot, 'output'),
      }),
      error,
    );
  });
}

test('documentation build rejects public files that replace generated pages', async t => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'crudui-doc-collision-'));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const docsDirectory = join(repositoryRoot, 'docs');
  await mkdir(join(docsDirectory, 'public'), { recursive: true });
  await writeFile(join(docsDirectory, 'index.md'), '# Generated page\n');
  await writeFile(join(docsDirectory, 'public', 'index.html'), 'replacement\n');
  await assert.rejects(
    buildDocumentationSite({
      repositoryRoot,
      docsDirectory,
      outputDirectory: join(repositoryRoot, 'output'),
    }),
    /Duplicate documentation output: index\.html/,
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

for (const basePath of ['/', '/crudui/']) {
  test(`documentation serves static links and error pages under ${basePath}`, async t => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), 'crudui-doc-prefix-'));
    t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
    const docsDirectory = join(repositoryRoot, 'docs');
    const outputDirectory = join(repositoryRoot, 'output');
    await mkdir(join(docsDirectory, 'guide'), { recursive: true });
    await mkdir(join(docsDirectory, 'public', 'api'), { recursive: true });
    await writeFile(join(docsDirectory, 'index.md'), '# Home\n\n[한국어](index.ko.md)\n');
    await writeFile(join(docsDirectory, 'index.ko.md'), '# 한국어 문서\n\n[Guide](guide/start.md)\n');
    await writeFile(join(docsDirectory, 'guide', 'start.md'), [
      '# Guide', '', '## Install', '',
      '[Home](../index.md)',
      '[Korean](/index.ko?lang=ko)',
      '[Install](/guide/start.html?example=1#install)',
      '[Native API](../public/api/index.html)',
      '![Icon](/icon.svg?version=1)',
    ].join('\n'));
    await writeFile(join(docsDirectory, 'public', 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await writeFile(join(docsDirectory, 'public', 'api', 'index.html'), '<h1>Native API</h1>');
    await buildDocumentationSite({ repositoryRoot, docsDirectory, outputDirectory, basePath });
    const guide = await readFile(join(outputDirectory, 'guide', 'start.html'), 'utf8');
    for (const url of [basePath, `${basePath}index.ko.html?lang=ko`, `${basePath}guide/start.html?example=1#install`, `${basePath}api/index.html`, `${basePath}assets/site.css`]) {
      assert.ok(guide.includes(`href="${url}"`), url);
    }
    assert.ok(guide.includes(`src="${basePath}icon.svg?version=1"`));
    const server = createDocumentationServer({ outputDirectory, basePath });
    await new Promise((accept, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', accept);
    });
    t.after(() => new Promise((accept, reject) => server.close(error => error ? reject(error) : accept())));
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['', 'index.ko.html', 'guide/start.html', 'api/index.html', 'icon.svg', 'assets/site.css']) {
      const response = await fetch(origin + basePath + route);
      assert.equal(response.status, 200, route);
      assert.ok((await response.text()).length > 0, route);
    }
    const missing = await fetch(origin + basePath + 'missing/nested/page');
    assert.equal(missing.status, 404);
    const html = await missing.text();
    assert.ok(html.includes(`href="${basePath}"`));
    assert.ok(html.includes(`href="${basePath}assets/site.css"`));
    if (basePath !== '/') {
      const outside = await fetch(origin + '/index.html');
      assert.equal(outside.status, 404);
      await outside.text();
    }
  });
}

test('documentation rejects malformed base paths before writing output', async t => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'crudui-doc-base-'));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const docsDirectory = join(repositoryRoot, 'docs');
  await mkdir(docsDirectory);
  await writeFile(join(docsDirectory, 'index.md'), '# Home');
  for (const basePath of ['', null, 'crudui/', '/crudui', '//host/', '/../', '/crudui/?query=1', '/a\\b/', '/a%20b/']) {
    await assert.rejects(buildDocumentationSite({
      repositoryRoot, docsDirectory, outputDirectory: join(repositoryRoot, 'output'), basePath,
    }), /DOCS_BASE_PATH/);
  }
  assert.deepEqual(await readdir(repositoryRoot), ['docs']);
});
