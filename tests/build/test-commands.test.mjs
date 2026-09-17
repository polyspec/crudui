// The test command standard: every test the project runs goes through scripts/run-tests.mjs,
// which prints each test as it starts, runs, passes or fails with its elapsed time and stops a
// test that outlives its own timeout. A test tool called directly from a project command, or a
// CI job without its own time limit, fails this check.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { directTestTools, isTestCommand, matchesArgument, nodeScripts, nodeTestArguments, projectCommands } from '../../scripts/test-commands.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tracked = [
  ...execFileSync('git', ['ls-files', '*package.json', '*composer.json', '*Makefile', '.github/workflows/*.yml'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean),
  'contracts/features.json',
];
const read = file => readFileSync(path.join(ROOT, file), 'utf8');

test('a direct test tool call is found in each command form', () => {
  for (const command of [
    'node --test tests/a.test.mjs', 'node --test-timeout=1 --test a.mjs', 'vitest run', 'npx vitest',
    'go test ./...', 'go -C packages/generator-go test -race ./...', 'cargo test', 'node scripts/run-rust-command.mjs test --locked',
    'phpunit', 'vendor/bin/phpunit tests',
  ]) assert.notDeepEqual(directTestTools(command), [], command);
  for (const command of [
    'node scripts/run-tests.mjs node -- tests/a.test.mjs', 'node scripts/run-tests.mjs vitest --workspace packages/generator-core',
    'npm run test:forms', 'node scripts/run-rust-command.mjs build --release', 'composer install', 'go build ./...',
    'npm run build && npm test -w @crudui/generator-html', 'composer --working-dir=packages/generator-php test',
  ]) assert.deepEqual(directTestTools(command), [], command);
});

test('project commands call test tools only through the test runner', () => {
  const violations = [];
  for (const file of tracked) {
    for (const { name, command } of projectCommands(file, read(file))) {
      for (const tool of directTestTools(command)) violations.push(`${file} ${name}: ${tool} in \`${command}\``);
    }
  }
  assert.deepEqual(violations, []);
});

test('a script a test command starts prints through the shared progress lines', () => {
  assert.deepEqual(nodeScripts('node scripts/a.mjs --flag && FOO=1 node --import tsx b/c.js x; node scripts/run-tests.mjs node -- d.test.mjs; npm test'), ['scripts/a.mjs', 'b/c.js']);
  assert.equal(isTestCommand('package.json', 'test:forms'), true);
  assert.equal(isTestCommand('package.json', 'pretest'), true);
  assert.equal(isTestCommand('package.json', 'build'), false);
  assert.equal(isTestCommand('Makefile', 'test-native'), true);
  assert.equal(isTestCommand('Makefile', 'docs-check'), false);
  const violations = [];
  for (const file of tracked) {
    const directory = path.dirname(file);
    for (const { name, command } of projectCommands(file, read(file))) {
      if (!isTestCommand(file, name)) continue;
      for (const script of nodeScripts(command)) {
        const source = [path.join(ROOT, directory, script), path.join(ROOT, script)].find(candidate => existsSync(candidate));
        if (!source) violations.push(`${file} ${name}: ${script} does not exist`);
        else if (!/test-progress\/progress\.mjs['"]/.test(readFileSync(source, 'utf8'))) violations.push(`${file} ${name}: ${script} does not print through scripts/test-progress/progress.mjs`);
      }
    }
  }
  assert.deepEqual([...new Set(violations)], []);
});

test('every node:test file runs in a project command', () => {
  assert.deepEqual(nodeTestArguments('node scripts/run-tests.mjs node --timeout 5 -- a.test.mjs b/*.test.mjs && node scripts/run-tests.mjs vitest -- c.test.ts'), ['a.test.mjs', 'b/*.test.mjs']);
  assert.equal(matchesArgument('tests/docs/a.test.mjs', 'tests/docs/*.test.mjs'), true);
  assert.equal(matchesArgument('tests/docs/x/a.test.mjs', 'tests/docs/*.test.mjs'), false);
  const arguments_ = tracked.flatMap(file => projectCommands(file, read(file)).flatMap(({ command }) => nodeTestArguments(command)));
  // Vitest runs every test file of a package that declares a Vitest test script.
  const vitest = tracked.filter(file => file.endsWith('package.json') && /vitest/.test(JSON.parse(read(file)).scripts?.test ?? '')).map(path.dirname);
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.test.mjs', '*.test.cjs', '*.test.js', '*.browser.mjs'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(file => file && existsSync(path.join(ROOT, file)) && !vitest.some(directory => file.startsWith(`${directory}/`)));
  assert.deepEqual(files.filter(file => !arguments_.some(argument => matchesArgument(file, argument))), []);
});

test('every TypeScript package declares a typecheck that CI runs', () => {
  const packages = execFileSync('git', ['ls-files', 'packages/*/tsconfig.json'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean).map(path.dirname);
  const missing = packages.filter(directory => !JSON.parse(read(`${directory}/package.json`)).scripts?.typecheck);
  assert.deepEqual(missing, []);
  const ci = tracked.filter(file => file.startsWith('.github/workflows/')).flatMap(file => projectCommands(file, read(file)).map(item => item.command));
  assert.ok(ci.includes('npm run typecheck'), 'CI does not run npm run typecheck');
});

test('every CI job has its own time limit', () => {
  const workflows = tracked.filter(file => file.startsWith('.github/workflows/'));
  const missing = [];
  for (const file of workflows) {
    const lines = read(file).split('\n');
    const jobsAt = lines.findIndex(line => /^jobs:\s*$/.test(line));
    for (let index = jobsAt + 1; index < lines.length; index++) {
      const job = /^ {2}([\w-]+):\s*$/.exec(lines[index]);
      if (!job) continue;
      let end = index + 1;
      while (end < lines.length && !/^ {2}[\w-]+:\s*$/.test(lines[end]) && !/^\S/.test(lines[end])) end++;
      if (!lines.slice(index + 1, end).some(line => /^ {4}timeout-minutes:\s*\d+\s*$/.test(line))) missing.push(`${file} ${job[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});
