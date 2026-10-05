// The test command standard: every test the project runs goes through scripts/run-tests.mjs,
// which prints each test as it starts, runs, passes or fails with its elapsed time and stops a
// test that outlives its own timeout. A test tool called directly from a project command, or a
// CI time limit over a step or a job, fails this check.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  directTestTools, isTestCommand, makeTargets, matchesArgument, nodeScripts, nodeTestArguments, projectCommands, runsTests, workflowJobs,
} from '../../scripts/test-commands.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tracked = [
  // A tracked file deleted in the working tree is no longer a project command source.
  ...execFileSync('git', ['ls-files', '*package.json', '*composer.json', '*Makefile', '.github/workflows/*.yml'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(file => file && existsSync(path.join(ROOT, file))),
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

/** The npm scripts, Composer scripts, workspaces and Makefile targets the repository declares. */
function declaredCommands() {
  const project = { npm: {}, composer: {}, workspaces: {}, make: {} };
  for (const file of tracked) {
    const directory = path.posix.dirname(file);
    if (file.endsWith('package.json')) {
      const manifest = JSON.parse(read(file));
      project.npm[directory] = manifest.scripts ?? {};
      if (manifest.name) project.workspaces[manifest.name] = directory;
    } else if (file.endsWith('composer.json')) {
      project.composer[directory] = JSON.parse(read(file)).scripts ?? {};
    } else if (file === 'Makefile') {
      project.make = makeTargets(read(file));
    }
  }
  return project;
}

test('a CI step runs tests when its command reaches the test runner', () => {
  const project = declaredCommands();
  for (const command of [
    'npm run test:runtimes', 'npm test -w @crudui/validator', 'composer --working-dir=packages/validator-php test',
    'node scripts/run-tests.mjs go --cwd packages/validator-go -- ./...', 'make docs-check', 'make test-native',
    'npm test --prefix examples/cross-check-console/server', 'npm run manifest:test', 'npm run test:build && npm run test:build:repeat',
  ]) assert.equal(runsTests(command, project), true, command);
  for (const command of [
    'npm i -g npm@latest && npm ci --strict-allow-scripts', 'npm run build', 'npm run lint', 'npm run typecheck',
    'make build-php-extension', 'node scripts/check-ci-browser.mjs', 'node scripts/check-conformance.mjs',
  ]) assert.equal(runsTests(command, project), false, command);
});

// A CI step runs either tests, whose cases each hold their own timeout in the test runner, or a
// long operation: a checkout, a toolchain setup, an install, a build, a lint or type check, an
// upload or a deployment. A long operation prints its own logs and has no time limit, and a job
// has no time limit over its steps, so a normal run that takes longer than usual never fails.
test('CI has no time limit over a long operation, a test step or a job', () => {
  const project = declaredCommands();
  const violations = [];
  for (const file of tracked.filter(name => name.startsWith('.github/workflows/'))) {
    for (const job of workflowJobs(read(file))) {
      if (job.timeout) violations.push(`${file}:${job.line} ${job.name}: the job has timeout-minutes`);
      for (const step of job.steps) {
        if (!step.timeout) continue;
        const kind = step.run && runsTests(step.run, project) ? 'runs tests' : 'runs a long operation';
        violations.push(`${file}:${step.line} ${job.name} ${step.name ?? step.run ?? step.uses}: ${kind} and has timeout-minutes`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

// The Go and Rust benchmark drivers compile for minutes on a cold cache. The build is its own step
// with step logs and a build limit; the test runs the built drivers, each test within seconds.
test('the benchmark driver test runs built drivers within the default test timeout', () => {
  const command = JSON.parse(read('package.json')).scripts['test:bench'];
  const build = command.indexOf('node tools/bench/build-drivers.mjs');
  const runner = command.indexOf('node scripts/run-tests.mjs node');
  assert.ok(build !== -1 && runner > build, `test:bench builds the drivers before the test: ${command}`);
  assert.doesNotMatch(command, /--timeout/, 'test:bench keeps the 30-second timeout of each test');
  const source = read('tests/build/bench-drivers.test.mjs');
  assert.doesNotMatch(source, /\btimeout:/, 'no benchmark driver test sets its own timeout');
  assert.doesNotMatch(source, /'run'/, 'the test runs no `go run` or `cargo run`, which compile');
});
