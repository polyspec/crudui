// The test command standard: every test the project runs goes through scripts/kit/run-tests.mjs,
// which prints each test as it starts, runs, passes or fails with its elapsed time and stops a
// test that outlives its own timeout. A test tool called directly from a project command, or a
// CI time limit over a step or a job, fails this check.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Linter } from 'eslint';
import { parse } from 'yaml';

import nodeTestRules from '../../scripts/lint/node-test-rules.mjs';
import { isVendored } from '../../scripts/repository-files.mjs';
import {
  directTestTools, isTestCommand, makeTargets, matchesArgument, nodeScripts, nodeTestArguments, projectCommands, runsTests, workflowJobs,
} from '../../scripts/test-commands.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tracked = [
  // A tracked file deleted in the working tree is no longer a project command source.
  ...execFileSync('git', ['ls-files', '*package.json', '*composer.json', '*Makefile', '.github/workflows/*.yml'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(file => file && existsSync(path.join(ROOT, file)) && !isVendored(file)),
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
    'node scripts/kit/run-tests.mjs node -- tests/a.test.mjs', 'node scripts/kit/run-tests.mjs vitest --workspace packages/generator-core',
    'npm run test:forms', 'node scripts/run-rust-command.mjs build --release', 'composer install', 'go build ./...',
    'npm run build && npm test -w @polyspec/crudui-generator-html', 'composer --working-dir=packages/generator-php test',
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
  assert.deepEqual(nodeScripts('node scripts/a.mjs --flag && FOO=1 node --import tsx b/c.js x; node scripts/kit/run-tests.mjs node -- d.test.mjs; npm test'), ['scripts/a.mjs', 'b/c.js']);
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
      // The scripts of the vendored copy of polyspec/kit follow the rules of kit.
      for (const script of nodeScripts(command).filter(name => !isVendored(name))) {
        const source = [path.join(ROOT, directory, script), path.join(ROOT, script)].find(candidate => existsSync(candidate));
        if (!source) violations.push(`${file} ${name}: ${script} does not exist`);
        else if (!/kit\/test-progress\.mjs['"]/.test(readFileSync(source, 'utf8'))) violations.push(`${file} ${name}: ${script} does not print through scripts/kit/test-progress.mjs`);
      }
    }
  }
  assert.deepEqual([...new Set(violations)], []);
});

test('every node:test file runs in a project command', () => {
  assert.deepEqual(nodeTestArguments('node scripts/kit/run-tests.mjs node --timeout 5 -- a.test.mjs b/*.test.mjs && node scripts/kit/run-tests.mjs vitest -- c.test.ts'), ['a.test.mjs', 'b/*.test.mjs']);
  assert.equal(matchesArgument('tests/docs/a.test.mjs', 'tests/docs/*.test.mjs'), true);
  assert.equal(matchesArgument('tests/docs/x/a.test.mjs', 'tests/docs/*.test.mjs'), false);
  const arguments_ = tracked.flatMap(file => projectCommands(file, read(file)).flatMap(({ command }) => nodeTestArguments(command)));
  // Vitest runs every test file of a package that declares a Vitest test script.
  const vitest = tracked.filter(file => file.endsWith('package.json') && /vitest/.test(JSON.parse(read(file)).scripts?.test ?? '')).map(path.dirname);
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.test.mjs', '*.test.cjs', '*.test.js', '*.browser.mjs'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(file => file && existsSync(path.join(ROOT, file)) && !isVendored(file) && !vitest.some(directory => file.startsWith(`${directory}/`)));
  assert.deepEqual(files.filter(file => !arguments_.some(argument => matchesArgument(file, argument))), []);
});

test('every TypeScript package declares a typecheck that CI runs', () => {
  const packages = execFileSync('git', ['ls-files', 'packages/*/tsconfig.json'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean).map(path.dirname);
  const missing = packages.filter(directory => !JSON.parse(read(`${directory}/package.json`)).scripts?.typecheck);
  assert.deepEqual(missing, []);
  const ci = tracked.filter(file => file.startsWith('.github/workflows/')).flatMap(file => projectCommands(file, read(file)).map(item => item.command));
  assert.ok(ci.some(command => /^make ci-targets TARGETS="(?:[\w-]+ )*typecheck(?: [\w-]+)*"$/.test(command)), 'CI does not run make typecheck');
  assert.deepEqual(makeTargets(read('Makefile')).typecheck?.commands, ['$(NPM) run typecheck']);
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
    'make test-runtimes', 'make test-validator-js', 'make test-validator-php', 'make test-validator-go', 'make docs-check', 'make test-native',
    'make test-cross-check', 'make manifest-test', 'make test-build', 'make test-build-repeat',
  ]) assert.equal(runsTests(command, project), true, command);
  for (const command of [
    'make install-node-modules install-composer', 'make build', 'make lint', 'make typecheck',
    'make build-php-extension', 'make check-ci-browser', 'make check-conformance',
  ]) assert.equal(runsTests(command, project), false, command);
});

/** The prerequisites that run tests, as `target: prerequisite`, of the declared Makefile targets. */
function testPrerequisites(project) {
  return Object.entries(project.make).flatMap(([target, rule]) => rule.prerequisites
    .filter(prerequisite => runsTests(`make ${prerequisite}`, project))
    .map(prerequisite => `${target}: ${prerequisite}`));
}

// Make stops at the first prerequisite that fails, so a target that runs several test targets runs
// each with `$(MAKE) <target> || status=1` and exits with the collected status.
test('no Makefile target takes a target that runs tests as a prerequisite', () => {
  const fixture = makeTargets([
    'all: build test-a test-b', 'build:', '\tnpm run build', 'test-a:', '\tnode scripts/kit/run-tests.mjs node -- a.test.mjs',
    'test-b:', '\tnode scripts/kit/run-tests.mjs node -- b.test.mjs', 'collect:',
    '\t@status=0; $(MAKE) test-a || status=1; $(MAKE) test-b || status=1; exit $$status', '',
  ].join('\n'));
  assert.deepEqual(testPrerequisites({ npm: {}, composer: {}, workspaces: {}, make: fixture }), ['all: test-a', 'all: test-b']);
  assert.deepEqual(testPrerequisites(declaredCommands()), []);
});

// A check command of a recipe: a command that reaches tests, or a document, format or manifest check.
const CHECK = /\bnpm run [\w:-]*check\b|\bnode scripts\/check-[\w-]+\.mjs\b|--check\b|\bgofmt -l\b/;

/**
 * The recipes that stop at a failing check, as `target: reason`. Make stops at the first recipe
 * line that fails, so the line that runs the first check is the last line of its target and runs
 * each check with `|| status=1`, ending with `exit $$status`. Preparation lines before it still stop
 * the target; a chain joined by `&&` whose later steps read the result of the earlier ones is one
 * check.
 */
function stoppingRecipes(project) {
  const isCheck = command => CHECK.test(command) || runsTests(command, project);
  const violations = [];
  for (const [target, rule] of Object.entries(project.make)) {
    const first = rule.commands.findIndex(isCheck);
    if (first === -1) continue;
    const line = rule.commands[first];
    for (const later of rule.commands.slice(first + 1)) violations.push(`${target}: \`${later}\` runs only when \`${line}\` passed`);
    if (/\|\|\s*exit\b/.test(line)) violations.push(`${target}: a failing check ends the recipe with || exit`);
    // Each check of the line sets status=1 on failure before the next check, and the line exits
    // with the collected status.
    const segments = line.split(';').map(command => command.trim());
    const checks = segments.flatMap((command, index) => (isCheck(command) ? [index] : []));
    const recorded = checks.every((index, position) => segments.slice(index, checks[position + 1] ?? segments.length)
      .some(command => /\bstatus=1\b/.test(command)));
    if (checks.length > 1 && (!recorded || !/exit \$\$status$/.test(line))) {
      violations.push(`${target}: the checks of one line do not each set status=1 and exit with it`);
    }
  }
  return violations;
}

test('a Makefile target runs every check after an earlier check failed', () => {
  const fixture = makeTargets([
    'lines:', '\tnpm run manifest:check', '\tnode scripts/check-documents.mjs', '\tnpm run docs:build',
    'loop:', '\t@for crate in a b; do node scripts/run-rust-command.mjs fmt --check --manifest-path "$$crate" || exit 1; done',
    'collected:', '\tnpm run build', '\t@status=0; npm run manifest:check || status=1; node scripts/check-documents.mjs || status=1; exit $$status',
    'chain:', '\t$(MAKE) docs-clean', '\t@runs=$$(mktemp -d) && $(MAKE) docs-web && diff -r "$$runs/a" "$$runs/b"',
    'unrecorded:', '\t@status=0; npm run manifest:check; node scripts/check-documents.mjs || status=1; exit $$status', '',
  ].join('\n'));
  assert.deepEqual(stoppingRecipes({ npm: {}, composer: {}, workspaces: {}, make: fixture }), [
    'lines: `node scripts/check-documents.mjs` runs only when `npm run manifest:check` passed',
    'lines: `npm run docs:build` runs only when `npm run manifest:check` passed',
    'loop: a failing check ends the recipe with || exit',
    'unrecorded: the checks of one line do not each set status=1 and exit with it',
  ]);
  assert.deepEqual(stoppingRecipes(declaredCommands()), []);
});

// A command of a package script or a CI step that stops at a failing check: a check in an `&&` chain with a later
// step, or several checks of which one does not record its failure with `|| status=1` before the command exits with the
// collected status. Preparation steps before the first check may stop the command; an `&&` chain whose later steps read
// the result of the earlier ones holds no check before its last step, as a build before its test.
const SCRIPT_CHECK = new RegExp(`${CHECK.source}|\\btsc --noEmit\\b`);
function stoppingCommand(command, project, directory = '.') {
  const isCheck = step => SCRIPT_CHECK.test(step) || runsTests(step, project, directory);
  const violations = [];
  const statements = command.split(/;|\n/).map(statement => statement.trim()).filter(Boolean);
  let checks = 0;
  let collected = true;
  for (const statement of statements) {
    const steps = statement.replace(/\s*\|\|\s*(?:status=1|exit \d+)$/, '').split('&&').map(step => step.trim());
    const first = steps.findIndex(isCheck);
    if (first === -1) continue;
    checks += steps.filter(isCheck).length;
    for (const later of steps.slice(first + 1)) violations.push(`\`${later}\` runs only when \`${steps[first]}\` passed`);
    if (!/\|\|\s*status=1$/.test(statement)) collected = false;
  }
  if (checks > 1 && (!collected || !/(?:^|;\s*)status=0\s*;/.test(command) || !/exit \$\$?status$/.test(command.trim()))) {
    violations.push('the checks do not each set status=1 and the command does not exit with the collected status');
  }
  return violations;
}

test('a package script or a CI step runs every check after an earlier check failed', () => {
  const project = declaredCommands();
  const fixture = { ...project, npm: { '.': { 'test:a': 'node scripts/kit/run-tests.mjs node -- a.test.mjs' } } };
  assert.deepEqual(stoppingCommand('npm run build && node scripts/kit/run-tests.mjs node -- a.test.mjs', fixture), []);
  assert.deepEqual(stoppingCommand('node scripts/kit/run-tests.mjs node -- a.test.mjs && npm run test:a', fixture), [
    '`npm run test:a` runs only when `node scripts/kit/run-tests.mjs node -- a.test.mjs` passed',
    'the checks do not each set status=1 and the command does not exit with the collected status',
  ]);
  assert.deepEqual(stoppingCommand('npm run build || exit 1; status=0; npm run test:a || status=1; node scripts/check-documents.mjs || status=1; exit $status', fixture), []);
  assert.deepEqual(stoppingCommand('status=0; npm run test:a; node scripts/check-documents.mjs || status=1; exit $status', fixture), [
    'the checks do not each set status=1 and the command does not exit with the collected status',
  ]);
  assert.deepEqual(stoppingCommand('tsc --noEmit && tsc --noEmit --project tests.json', fixture), [
    '`tsc --noEmit --project tests.json` runs only when `tsc --noEmit` passed',
    'the checks do not each set status=1 and the command does not exit with the collected status',
  ]);

  const violations = [];
  for (const file of tracked.filter(name => name.endsWith('package.json'))) {
    for (const [script, command] of Object.entries(JSON.parse(read(file)).scripts ?? {})) {
      for (const violation of stoppingCommand(command, project, path.posix.dirname(file))) violations.push(`${file} ${script}: ${violation}`);
    }
  }
  for (const file of tracked.filter(name => name.startsWith('.github/workflows/'))) {
    for (const [id, job] of Object.entries(parse(read(file)).jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (typeof step.run !== 'string') continue;
        for (const violation of stoppingCommand(step.run, project)) violations.push(`${file} ${id} ${step.name ?? step.run.split('\n')[0]}: ${violation}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

// tests/build/public-packages.test.mjs loads every published package through its exports, which name its `dist`, so
// test:build builds the packages first and never reads the output of an earlier build.
test('test:build builds the packages before the tests that load them', () => {
  const script = JSON.parse(read('package.json')).scripts['test:build'];
  assert.match(script, /^node scripts\/require-current-build\.mjs && node scripts\/kit\/run-tests\.mjs node -- .*tests\/build\/public-packages\.test\.mjs/);
  assert.match(read('tests/build/public-packages.test.mjs'), /await import\(pkg\.manifest\.name\)/);
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
// with step logs and no time limit; the test runs the built drivers, each test within seconds.
test('the benchmark driver test runs built drivers within the default test timeout', () => {
  const command = JSON.parse(read('package.json')).scripts['test:bench'];
  const build = command.indexOf('node tools/bench/build-drivers.mjs');
  const runner = command.indexOf('node scripts/kit/run-tests.mjs node');
  assert.ok(build !== -1 && runner > build, `test:bench builds the drivers before the test: ${command}`);
  assert.doesNotMatch(command, /--timeout/, 'test:bench keeps the 30-second timeout of each test');
  const source = read('tests/build/bench-drivers.test.mjs');
  assert.doesNotMatch(source, /\btimeout:/, 'no benchmark driver test sets its own timeout');
  assert.doesNotMatch(source, /'run'/, 'the test runs no `go run` or `cargo run`, which compile');
});

// The load of the machine changes elapsed time, so a test never asserts an upper or lower bound on
// an elapsed time; it checks the cause instead: an event, a result that only the expected path can
// produce, or an operation that never ends unless the code under test stops it, under the test's
// own timeout. A check that a duration is a finite, non-negative number is not a bound.
test('no test asserts a bound on an elapsed time', () => {
  const CLOCK_BOUND = /\bassert\.ok\([^;]*?(?:(?:performance|Date)\.now\(\)\s*-\s*\w+|\.(?:elapsedMs|durationMs))\s*[<>]=?\s*(?!0\b)[\w.(]/;
  const call = 'assert' + '.ok';
  assert.equal(CLOCK_BOUND.test(`${call}(performance.now() - started < 1_000);`), true);
  assert.equal(CLOCK_BOUND.test(`${call}(result.durationMs > 3 * limit);`), true);
  assert.equal(CLOCK_BOUND.test(`${call}(Number.isFinite(run.durationMs) && run.durationMs >= 0);`), false);
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.mjs', '*.js', '*.cjs', '*.ts'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(file => file && existsSync(path.join(ROOT, file)) && !isVendored(file));
  const bounds = files.flatMap(file => read(file).split('\n').flatMap((line, index) => CLOCK_BOUND.test(line) ? [`${file}:${index + 1}`] : []));
  assert.deepEqual(bounds, []);
});

// Building the packages is a long operation. The reproducible build check builds them twice in a logged step without a
// time limit and compares its own two builds; its test reads no build record and runs within the default timeout.
test('the reproducible build check compares its own builds and its test reads no record', () => {
  const command = JSON.parse(read('package.json')).scripts['test:build:repeat'];
  assert.equal(command, 'status=0; node scripts/repeat-build.mjs || status=1; node scripts/kit/run-tests.mjs node -- tests/build/reproducible-build.test.mjs || status=1; exit $status');
  const test = read('tests/build/reproducible-build.test.mjs');
  assert.doesNotMatch(test, /npm', \['run', 'build'\]|REPEAT_BUILD|readFileSync\(join\(/, 'the test runs no build and reads no build record');
  assert.doesNotMatch(read('scripts/repeat-build.mjs'), /writeFile|REPEAT_BUILD/, 'the check keeps no record between runs');
});

// A program waits for the event of what it waits for (AGENTS): a process exit, a readiness line, a
// file event, a signal. It never sleeps in a loop and never re-reads a state on an interval. A
// timer may only print progress lines, so every `setInterval` callback of a program writes a line.
test('no program waits in an interval loop', () => {
  const sleep = /new Promise\(\(?resolve\)? => setTimeout\(resolve, (?!0\))/;
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.mjs', '*.js', '*.cjs', '*.ts'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(file => file && existsSync(path.join(ROOT, file)) && !isVendored(file))
    .filter(file => !/(?:\.test\.[cm]?[jt]s|\.browser\.mjs)$|(?:^|\/)tests?\//.test(file));
  const loops = [];
  for (const file of files) {
    const lines = read(file).split('\n');
    lines.forEach((line, index) => {
      if (sleep.test(line)) loops.push(`${file}:${index + 1}: sleeps`);
      if (/\bsetInterval\(/.test(line) && !/\b(?:write|progress|line)\(/.test(lines.slice(index, index + 12).join('\n'))) {
        loops.push(`${file}:${index + 1}: an interval that prints no progress line`);
      }
    });
  }
  assert.deepEqual(loops, []);
});

// node --test runs with --test-force-exit, so a test registered after a top-level wait may never
// run; the lint rule requires every registration before the module's first wait.
test('a top-level await after the first node:test registration is a lint error', () => {
  const linter = new Linter({ configType: 'flat' });
  const config = [{
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    plugins: { crudui: nodeTestRules },
    rules: { 'crudui/no-await-after-test-registration': 'error' },
  }];
  const lint = source => linter.verify(source, config, 'case.test.mjs').map(item => `${item.line}: ${item.ruleId}`);
  const rule = 'crudui/no-await-after-test-registration';
  assert.deepEqual(lint([
    "import test from 'node:test';",
    "const data = await Promise.resolve(1);",
    "test('a', async () => { await Promise.resolve(data); });",
    "{ const more = 2; test('b', () => more); }",
    "async function load() { return await Promise.resolve(3); }",
    "test('c', load);",
  ].join('\n')), []);
  assert.deepEqual(lint([
    "import test, { describe } from 'node:test';",
    "test('a', () => {});",
    "const late = await Promise.resolve(1);",
    "{ const fixtures = await Promise.resolve([]); describe('b', () => fixtures); }",
    "for await (const item of []) test(String(item), () => {});",
  ].join('\n')), [`3: ${rule}`, `4: ${rule}`, `5: ${rule}`]);
  assert.deepEqual(lint("import { it } from 'vitest';\nit('a', () => {});\nawait Promise.resolve();\n"), []);
});
