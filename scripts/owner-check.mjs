#!/usr/bin/env node
// Runs the owner checks of changed paths (AGENTS.md, docs/operations/testing.md). scripts/owner-checks.json declares, for
// globs of repository paths, the checks that own them: make targets (`targets`), npm scripts of the root package.json
// (`scripts`), the `test` script of workspaces (`workspaces`) and of package directories (`prefixes`), and node test files
// (`tests`, where `$path` is the changed test file itself). `make owner-check` runs exactly the owners of the paths that a
// change touches, never the full suite, which `make ci` runs once when every active task is done.
//
// The declaration is checked on every run, before any owner runs: every tracked path matches at least one owner rule,
// every glob matches at least one tracked path (new files that are not ignored count as tracked), every target exists in
// the Makefile and does not run the full suite, every script and workspace exists, and every test file exists. `inputs`
// declares, for a check, the globs of the paths that it reads; each such path needs a rule that selects the check (for
// a make target also a target that runs it as a prerequisite), so a change of a path that a check reads runs that check.
// A failure names the path, the glob or the check. `always` lists the tests that run for every change.
//
// A glob matches a repository path: `*` within one path segment, `**` across segments, `{a,b}` either alternative.
// The check of `inputs` is named `make <target>`, `npm run <script>`, `npm test -w <workspace>` or
// `npm test --prefix <directory>`.
//
// Usage: node scripts/owner-check.mjs [--paths "<path> ..."] [--base <revision>] [--dry-run] [--validate]
//   --paths     the changed paths; default: the uncommitted tracked changes and the untracked files not ignored
//   --base      the changed paths are those between <revision> and the working tree
//   --dry-run   print the selection without running it
//   --validate  check the declaration only
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { useCheckoutNpm } from './checkout-npm.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DECLARATION = 'scripts/owner-checks.json';

function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} exited with ${result.status}: ${result.stderr.trim()}`);
  return result.stdout.split('\n').filter(Boolean);
}

/** The regular expression source of a glob. */
function globSource(glob) {
  let source = '';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (glob.startsWith('**/', index)) { source += '(?:.*/)?'; index += 2; }
    else if (glob.startsWith('**', index)) { source += '.*'; index += 1; }
    else if (character === '*') source += '[^/]*';
    else if (character === '{') {
      const end = glob.indexOf('}', index);
      source += `(?:${glob.slice(index + 1, end).split(',').map(globSource).join('|')})`;
      index = end;
    } else source += character.replace(/[.+?^$()|[\]\\]/g, '\\$&');
  }
  return source;
}

/** The regular expression of a glob. */
export function globExpression(glob) {
  return new RegExp(`^${globSource(glob)}$`);
}

/** The make targets of the Makefile. */
function makeTargets(makefile) {
  return new Set([...makefile.matchAll(/^([a-zA-Z0-9_-]+):(?!=)/gm)].map(match => match[1]));
}

/** The prerequisites of each target of the Makefile. */
function makePrerequisites(makefile) {
  const prerequisites = new Map();
  for (const match of makefile.matchAll(/^([a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*):(?!=)([^#\n]*)/gm)) {
    for (const name of match[1].split(' ')) prerequisites.set(name, [...(prerequisites.get(name) ?? []), ...match[2].trim().split(/\s+/).filter(Boolean)]);
  }
  return prerequisites;
}

/** The targets that `target` runs: itself and its prerequisites, transitively. */
function closure(target, prerequisites, result = new Set()) {
  if (result.has(target)) return result;
  result.add(target);
  for (const prerequisite of prerequisites.get(target) ?? []) closure(prerequisite, prerequisites, result);
  return result;
}

/** The targets of the Makefile that run the full suite: every target whose recipe starts the guard scripts/full-run.mjs. */
export function fullSuiteTargets(makefile) {
  const result = new Set();
  for (const match of makefile.matchAll(/^([a-zA-Z0-9_-]+):(?!=)[^\n]*\n((?:\t[^\n]*\n?)*)/gm)) {
    if (/scripts\/full-run\.mjs/.test(match[2])) result.add(match[1]);
  }
  return result;
}

/** The checks of a rule, each as the name that `inputs` uses and the command that runs it. */
export function ruleChecks(rule) {
  return [
    ...(rule.targets ?? []).map(target => ({ name: `make ${target}`, command: 'make', args: ['--no-print-directory', target] })),
    ...(rule.scripts ?? []).map(script => ({ name: `npm run ${script}`, command: 'npm', args: ['run', script] })),
    ...(rule.workspaces ?? []).map(workspace => ({ name: `npm test -w ${workspace}`, command: 'npm', args: ['test', '-w', workspace] })),
    ...(rule.prefixes ?? []).map(prefix => ({ name: `npm test --prefix ${prefix}`, command: 'npm', args: ['test', '--prefix', prefix] })),
  ];
}

/**
 * The errors of the declaration against the tracked paths, the Makefile and the npm manifests. `project` holds
 * `makefile`, `scripts` (the root npm scripts), `workspaces` (the workspace names with a test script) and `prefixes`
 * (the package directories with a test script).
 */
export function validate(declaration, tracked, project, exists) {
  const errors = [];
  const targets = makeTargets(project.makefile);
  const fullSuite = fullSuiteTargets(project.makefile);
  const rules = declaration.owners.map(rule => ({ ...rule, expressions: rule.paths.map(globExpression) }));
  for (const rule of rules) {
    const label = rule.paths.join(' ');
    rule.paths.forEach((glob, index) => {
      if (!tracked.some(path => rule.expressions[index].test(path))) errors.push(`${DECLARATION}: the glob ${glob} matches no tracked path`);
    });
    for (const target of rule.targets ?? []) {
      if (!targets.has(target)) errors.push(`${DECLARATION}: the target ${target} of ${label} is not a target of the Makefile`);
      if (fullSuite.has(target)) errors.push(`${DECLARATION}: the target ${target} runs the full suite, which an owner check never runs`);
    }
    for (const script of rule.scripts ?? []) if (!(script in project.scripts)) errors.push(`${DECLARATION}: the script ${script} of ${label} is not a script of package.json`);
    for (const workspace of rule.workspaces ?? []) if (!project.workspaces.includes(workspace)) errors.push(`${DECLARATION}: the workspace ${workspace} of ${label} has no test script`);
    for (const prefix of rule.prefixes ?? []) if (!project.prefixes.includes(prefix)) errors.push(`${DECLARATION}: the directory ${prefix} of ${label} has no test script`);
    for (const test of rule.tests ?? []) if (test !== '$path' && !exists(test)) errors.push(`${DECLARATION}: the test ${test} of ${label} does not exist`);
  }
  for (const test of declaration.always ?? []) if (!exists(test)) errors.push(`${DECLARATION}: the test ${test} of always does not exist`);
  for (const path of tracked) {
    if (!rules.some(rule => rule.expressions.some(expression => expression.test(path)))) errors.push(`${path}: the path matches no owner in ${DECLARATION}`);
  }
  // `inputs` declares the paths that a check reads. For each of them a rule must select the check, or for a make target
  // a target that runs it as a prerequisite, so a change of the path runs a check that reads it.
  const prerequisites = makePrerequisites(project.makefile);
  const runs = new Map();
  const selects = (rule, check) => ruleChecks(rule).some(({ name }) => {
    if (name === check) return true;
    if (!name.startsWith('make ') || !check.startsWith('make ')) return false;
    const target = name.slice('make '.length);
    if (!runs.has(target)) runs.set(target, closure(target, prerequisites));
    return runs.get(target).has(check.slice('make '.length));
  });
  const known = new Set([...targets].map(target => `make ${target}`).concat(
    Object.keys(project.scripts).map(script => `npm run ${script}`),
    project.workspaces.map(workspace => `npm test -w ${workspace}`),
    project.prefixes.map(prefix => `npm test --prefix ${prefix}`)));
  for (const [check, globs] of Object.entries(declaration.inputs ?? {})) {
    if (!known.has(check)) {
      errors.push(`${DECLARATION}: the inputs of ${check} name no make target, npm script, workspace or package directory`);
      continue;
    }
    for (const glob of globs) {
      const expression = globExpression(glob);
      const paths = tracked.filter(path => expression.test(path));
      if (!paths.length) errors.push(`${DECLARATION}: the input glob ${glob} of ${check} matches no tracked path`);
      for (const path of paths) {
        if (!rules.some(rule => rule.expressions.some(owner => owner.test(path)) && selects(rule, check))) errors.push(`${path}: an input of ${check}, which no owner rule of the path selects`);
      }
    }
  }
  return [...new Set(errors)];
}

/**
 * The owners of the changed paths: the checks in declaration order and the test files. A removed path that no rule owns
 * selects nothing; an existing path that no rule owns is unowned.
 */
export function select(declaration, changed, exists = () => true) {
  const rules = declaration.owners.map(rule => ({ ...rule, expressions: rule.paths.map(globExpression) }));
  const checks = new Map();
  const selected = new Set(declaration.always ?? []);
  const reasons = [];
  const unowned = [];
  for (const path of changed) {
    const matched = rules.filter(rule => rule.expressions.some(expression => expression.test(path)));
    if (!matched.length && !exists(path)) reasons.push(`${path} -> nothing: the path was removed and no rule owns it`);
    else if (!matched.length) unowned.push(path);
    for (const rule of matched) {
      // A test that is the changed path itself runs only while the path exists.
      const tests = (rule.tests ?? []).flatMap(test => (test !== '$path' ? [test] : exists(path) ? [path] : []));
      const owned = ruleChecks(rule);
      reasons.push(`${path} -> ${[...owned.map(check => check.name), ...tests].join(', ')}`);
      for (const check of owned) checks.set(check.name, check);
      for (const test of tests) selected.add(test);
    }
  }
  return { checks: [...checks.values()], tests: [...selected].sort(), reasons, unowned };
}

/** The npm scripts, workspaces and package directories with a test script of the checkout. */
function npmProject() {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const workspaces = [];
  const prefixes = [];
  for (const file of git('ls-files', '*package.json').filter(file => file !== 'package.json' && existsSync(join(root, file)))) {
    const packageManifest = JSON.parse(readFileSync(join(root, file), 'utf8'));
    if (!packageManifest.scripts?.test) continue;
    if (file.startsWith('packages/') && packageManifest.name) workspaces.push(packageManifest.name);
    else prefixes.push(dirname(file));
  }
  return { scripts: manifest.scripts ?? {}, workspaces, prefixes };
}

function changedPaths(values) {
  if (values.paths !== undefined) return values.paths.split(/\s+/).filter(Boolean);
  const changed = values.base ? git('diff', '--name-only', values.base) : git('diff', '--name-only', 'HEAD');
  return [...new Set([...changed, ...git('ls-files', '--others', '--exclude-standard')])].sort();
}

const say = text => process.stdout.write(`[owner-check] ${text}\n`);
const complain = text => process.stderr.write(`[owner-check] ${text}\n`);

function step(name, command, args) {
  say(`start ${name}`);
  const started = performance.now();
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const passed = result.status === 0;
  say(`${name} ${passed ? 'passed' : `failed with ${result.error?.message ?? result.status ?? result.signal}`} in ${seconds} s`);
  return passed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  useCheckoutNpm();
  const { values } = parseArgs({ options: { paths: { type: 'string' }, base: { type: 'string' }, 'dry-run': { type: 'boolean' }, validate: { type: 'boolean' } } });
  const declaration = JSON.parse(readFileSync(join(root, DECLARATION), 'utf8'));
  const project = { makefile: readFileSync(join(root, 'Makefile'), 'utf8'), ...npmProject() };
  const errors = validate(declaration, git('ls-files', '--cached', '--others', '--exclude-standard').filter(path => existsSync(join(root, path))), project, path => existsSync(join(root, path)));
  if (errors.length) {
    for (const error of errors) complain(`${error}`);
    process.exit(1);
  }
  if (values.validate) {
    say(`${DECLARATION} owns every tracked path`);
    process.exit(0);
  }
  const changed = changedPaths(values);
  const selection = select(declaration, changed, path => existsSync(join(root, path)));
  if (selection.unowned.length) {
    for (const path of selection.unowned) complain(`${path}: the path matches no owner in ${DECLARATION}`);
    process.exit(1);
  }
  for (const reason of selection.reasons) say(`${reason}`);
  const commands = [
    ...selection.checks,
    ...(selection.tests.length ? [{ name: `node tests ${selection.tests.join(' ')}`, command: process.execPath, args: ['scripts/kit/run-tests.mjs', 'node', '--', ...selection.tests] }] : []),
  ];
  say(`${changed.length} changed paths select ${commands.map(command => command.name).join('; ') || 'nothing'}`);
  if (values['dry-run']) process.exit(0);
  // Every selected check runs, also after an earlier one failed, so one run reports every failure.
  const failed = commands.filter(command => !step(command.name, command.command, command.args)).map(command => command.name);
  say(`${failed.length ? `failed: ${failed.join('; ')}` : 'every owner check passed'}`);
  process.exitCode = failed.length ? 1 : 0;
}
