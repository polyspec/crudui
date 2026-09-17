import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const repository = path.resolve(import.meta.dirname, '../..');

function workflowJob(source, name) {
  const lines = source.split('\n');
  const start = lines.findIndex(line => line === `  ${name}:`);
  assert.notEqual(start, -1, `CI must define the ${name} job`);
  const endOffset = lines.slice(start + 1).findIndex(line => /^ {2}[a-z0-9-]+:$/.test(line));
  const end = endOffset === -1 ? lines.length : start + 1 + endOffset;
  return lines.slice(start, end).join('\n');
}

test('CI runs the complete form comparison regression suite', async () => {
  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  const job = workflowJob(workflow, 'form-comparison');

  assert.match(job, /runs-on:\s*ubuntu-latest/);
  assert.match(job, /uses: actions\/checkout@/);
  assert.match(job, /uses: actions\/setup-node@/);
  assert.match(job, /node-version-file:\s*['"]?\.node-version['"]?/);
  assert.match(job, /uses: shivammathur\/setup-php@/);
  assert.match(job, /php-version:\s*['"]?8\.5['"]?/);
  assert.match(job, /npm i -g npm@latest && npm ci --strict-allow-scripts/);
  assert.match(
    job,
    /composer --working-dir=packages\/validator-php install --no-interaction --prefer-dist/,
  );
  assert.match(
    job,
    /composer --working-dir=packages\/generator-php install --no-interaction --prefer-dist/,
  );
  assert.match(job, /run:\s*npm run test:form-comparison(?:\s|$)/);
});

test('native PHP matrix passes the selected regular php-config path', async () => {
  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  const job = workflowJob(workflow, 'native-generators');

  assert.match(job, /php:\s*\['8\.4', '8\.5'\]/);
  assert.match(
    job,
    /PHP_EXTENSION_PHP_CONFIG:\s*\/usr\/bin\/php-config\$\{\{ matrix\.php \}\}/,
  );
});

test('native job caches the generator packages and the programs that run them', async () => {
  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  const job = workflowJob(workflow, 'native-generators');
  for (const entry of ['packages/generator-go/go.mod', 'tests/native-generators/programs/go/go.mod', 'packages/generator-rust', 'tests/native-generators/programs/rust']) {
    assert.match(job, new RegExp(`^\\s+${entry.replaceAll('.', '\\.')}$`, 'm'), entry);
  }
});

test('native report upload uses the current Node.js 24 artifact action', async () => {
  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  const job = workflowJob(workflow, 'native-generators');
  const versions = [...job.matchAll(/uses:\s*actions\/upload-artifact@([^\s]+)/g)]
    .map(match => match[1]);

  assert.ok(versions.length > 0, 'The native job uploads its report');
  assert.deepEqual(versions.filter(version => version !== 'v7'), []);
});

test('browser CI jobs select the regular sandboxed Chrome executable', async () => {
  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  const failures = [];
  for (const name of ['form-runtime', 'form-comparison', 'package-browser', 'native-generators']) {
    const job = workflowJob(workflow, name);
    if (!/PUPPETEER_EXECUTABLE_PATH:\s*\/opt\/google\/chrome\/chrome/.test(job)) {
      failures.push(`${name}: missing regular Chrome executable`);
    }
    if (!/PUPPETEER_SKIP_DOWNLOAD:\s*['"]true['"]/.test(job)) {
      failures.push(`${name}: Puppeteer browser download is enabled`);
    }
    if (!/run:\s*node scripts\/check-ci-browser\.mjs(?:\s|$)/.test(job)) {
      failures.push(`${name}: missing sandboxed Chrome preflight`);
    }
    if (/--no-sandbox|--disable-setuid-sandbox/.test(job)) {
      failures.push(`${name}: disables the Chrome sandbox`);
    }
  }
  for (const file of ['tests/widget-scripts.test.mjs', 'tests/form-styles.test.mjs']) {
    const checks = await readFile(path.join(repository, file), 'utf8');
    if (/--no-sandbox|--disable-setuid-sandbox/.test(checks)) {
      failures.push(`${file}: disables the Chrome sandbox`);
    }
  }
  assert.deepEqual(failures, []);
});
