// Project commands and the test tools they call. tests/build/test-commands.test.mjs uses these to
// require that every test runs through scripts/run-tests.mjs. `npm test` and `composer test` run a
// declared script, which is checked where it is declared.

import path from 'node:path';

/**
 * The commands a tracked file declares: npm or composer scripts, Makefile recipes, CI steps and
 * the verification commands of the feature manifest.
 */
export function projectCommands(file, text) {
  const name = file.split('/').pop();
  if (file === 'contracts/features.json') {
    return JSON.parse(text).features.flatMap(feature => feature.verification.map(item => ({ name: `${feature.id}/${item.id}`, command: item.command })));
  }
  if (name === 'package.json' || name === 'composer.json') {
    const scripts = JSON.parse(text).scripts ?? {};
    return Object.entries(scripts).flatMap(([script, value]) => [value].flat().map(command => ({ name: script, command })));
  }
  if (name === 'Makefile') {
    const commands = [];
    let target = '';
    const lines = text.replace(/\\\n\s*/g, ' ').split('\n');
    for (const line of lines) {
      const rule = /^([^\s#][^:=]*):(?!=)/.exec(line);
      if (rule) target = rule[1].trim();
      else if (line.startsWith('\t')) commands.push({ name: target, command: line.trim().replace(/^[@-]+/, '') });
    }
    return commands;
  }
  if (file.startsWith('.github/workflows/')) {
    const commands = [];
    const lines = text.split('\n');
    for (let index = 0; index < lines.length; index++) {
      const step = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[index]);
      if (!step) continue;
      const [, indent, value] = step;
      if (value !== '|' && value !== '>') {
        commands.push({ name: `line ${index + 1}`, command: value });
        continue;
      }
      const block = [];
      while (index + 1 < lines.length && (lines[index + 1].trim() === '' || lines[index + 1].search(/\S/) > indent.length + 2)) block.push(lines[++index].trim());
      const joined = value === '>' ? [block.join(' ')] : block.join('\n').replace(/\\\n/g, ' ').split('\n');
      for (const command of joined.filter(Boolean)) commands.push({ name: `line ${index + 1}`, command });
    }
    return commands;
  }
  return [];
}

const runner = /(?:^|\/)scripts\/run-tests\.mjs$/;

/** The test tools a command calls directly, outside scripts/run-tests.mjs. */
export function directTestTools(command) {
  const tools = [];
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    while (tokens.length && /^[A-Z_][A-Z0-9_]*=/.test(tokens[0])) tokens.shift();
    if (!tokens.length) continue;
    if (tokens.some(token => runner.test(token))) continue;
    const program = tokens[0].split('/').pop();
    const args = tokens.slice(1);
    // The first argument that is neither an option nor the value of a directory option.
    const subcommand = (() => {
      for (let index = 0; index < args.length; index++) {
        if (['-C', '--manifest-path', '--working-dir', '-d'].includes(args[index])) { index++; continue; }
        if (!args[index].startsWith('-')) return args[index];
      }
      return undefined;
    })();
    if (program === 'node' && args.includes('--test')) tools.push('node --test');
    if (tokens.some(token => token.split('/').pop() === 'vitest')) tools.push('vitest');
    if (program === 'go' && subcommand === 'test') tools.push('go test');
    if (program === 'cargo' && subcommand === 'test') tools.push('cargo test');
    if (program === 'node' && args[0]?.endsWith('run-rust-command.mjs') && args.slice(1).find(arg => !arg.startsWith('-')) === 'test') tools.push('cargo test');
    if (tokens.some(token => token.split('/').pop() === 'phpunit')) tools.push('phpunit');
  }
  return tools;
}

/** Whether a project command runs tests: a test script or target, a CI step or a feature verification. */
export function isTestCommand(file, name) {
  const base = file.split('/').pop();
  if (file === 'contracts/features.json' || file.startsWith('.github/workflows/')) return true;
  if (base === 'Makefile') return /^(?:test|conformance)/.test(name);
  return /(?:^|:)(?:pre)?test(?::|$)/.test(name);
}

/** The Node.js scripts a command starts directly, other than the test runner. */
export function nodeScripts(command) {
  const scripts = [];
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    while (tokens.length && /^[A-Z_][A-Z0-9_]*=/.test(tokens[0])) tokens.shift();
    if (tokens[0]?.split('/').pop() !== 'node') continue;
    let script;
    for (let index = 1; index < tokens.length && !script; index++) {
      if (['--import', '--require', '-r', '--loader', '--env-file'].includes(tokens[index])) index++;
      else if (!tokens[index].startsWith('-')) script = tokens[index];
    }
    if (script && /\.(?:mjs|cjs|js)$/.test(script) && !runner.test(script)) scripts.push(script);
  }
  return scripts;
}

/** The file arguments of every `node scripts/run-tests.mjs node` segment of a command. */
export function nodeTestArguments(command) {
  const files = [];
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    const at = tokens.findIndex(token => runner.test(token));
    if (at === -1 || tokens[at + 1] !== 'node') continue;
    files.push(...tokens.slice(at + 2).filter(token => /\.(?:mjs|cjs|js)$/.test(token)));
  }
  return files;
}

/** Whether a repository path matches a command's file argument, where `*` matches within one segment. */
export function matchesArgument(file, argument) {
  const pattern = argument.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
  return new RegExp(`^${pattern}$`).test(file);
}

/**
 * The jobs of a workflow with their steps. A job or a step has `timeout` when it declares
 * `timeout-minutes`; a step has `run` (its command) or `uses` (an action).
 */
export function workflowJobs(text) {
  const jobs = [];
  const lines = text.split('\n');
  const jobsAt = lines.findIndex(line => /^jobs:\s*$/.test(line));
  if (jobsAt === -1) return jobs;
  let job;
  let step;
  for (let index = jobsAt + 1; index < lines.length; index++) {
    const line = lines[index];
    if (/^\S/.test(line)) break;
    const name = /^ {2}([\w-]+):\s*$/.exec(line);
    if (name) {
      job = { name: name[1], line: index + 1, timeout: false, steps: [] };
      step = undefined;
      jobs.push(job);
      continue;
    }
    if (!job) continue;
    if (/^ {4}timeout-minutes:/.test(line)) job.timeout = true;
    const item = /^ {6}- (.*)$/.exec(line);
    if (item) {
      step = { line: index + 1, timeout: false };
      job.steps.push(step);
    }
    const key = item ? /^([\w-]+):\s*(.*)$/.exec(item[1]) : /^ {8}([\w-]+):\s*(.*)$/.exec(line);
    if (!step || !key) continue;
    const [, field, value] = key;
    if (field === 'timeout-minutes') step.timeout = true;
    else if (field === 'name') step.name = value;
    else if (field === 'uses') step.uses = value;
    else if (field === 'run') {
      if (value !== '|' && value !== '>') {
        step.run = value;
        continue;
      }
      const block = [];
      while (index + 1 < lines.length && (lines[index + 1].trim() === '' || lines[index + 1].search(/\S/) > 8)) block.push(lines[++index].trim());
      step.run = block.filter(Boolean).join(value === '>' ? ' ' : '\n');
    }
  }
  return jobs;
}

/** The value of an option given as `--name value` or `--name=value`, and the remaining arguments. */
function takeOptions(args, names) {
  const options = {};
  const rest = [];
  for (let index = 0; index < args.length; index++) {
    const [flag, inline] = args[index].split(/=(.*)/s);
    if (names.includes(flag)) options[flag] = inline ?? args[++index];
    else rest.push(args[index]);
  }
  return { options, rest };
}

/**
 * Whether a command runs tests: it calls scripts/run-tests.mjs, or an npm script, a Composer
 * script or a Makefile target that is a test command (`isTestCommand`) or that reaches one.
 * `project` holds the declared commands: `npm` and `composer` map a directory to its scripts,
 * `workspaces` maps a package name to its directory and `make` maps a target to its prerequisites
 * and recipe lines.
 */
export function runsTests(command, project, directory = '.', seen = new Set()) {
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    while (tokens.length && /^[A-Z_][A-Z0-9_]*=/.test(tokens[0])) tokens.shift();
    if (tokens.some(token => runner.test(token))) return true;
    const reached = [];
    // The Makefile starts npm by its path in the checkout, $(NPM).
    if (tokens[0] === 'npm' || tokens[0] === '$(NPM)') {
      const { options, rest } = takeOptions(tokens.slice(1), ['-w', '--workspace', '--prefix']);
      const [subcommand, script] = rest.filter(token => !token.startsWith('-'));
      const name = ['test', 't'].includes(subcommand) ? 'test' : ['run', 'run-script'].includes(subcommand) ? script : undefined;
      if (!name) continue;
      if (isTestCommand('package.json', name)) return true;
      const workspace = options['-w'] ?? options['--workspace'];
      const target = workspace ? project.workspaces[workspace] : options['--prefix'] ? path.posix.join(directory, options['--prefix']) : directory;
      reached.push(...[project.npm[target]?.[name] ?? []].flat().map(value => [value, target, `npm ${target} ${name}`]));
    } else if (tokens[0] === 'composer') {
      const { options, rest } = takeOptions(tokens.slice(1), ['--working-dir', '-d']);
      const [name] = rest.filter(token => !token.startsWith('-'));
      if (!name) continue;
      if (isTestCommand('composer.json', name)) return true;
      const target = path.posix.join(directory, options['--working-dir'] ?? options['-d'] ?? '.');
      reached.push(...[project.composer[target]?.[name] ?? []].flat().map(value => [value, target, `composer ${target} ${name}`]));
    } else if (tokens[0] === 'make' || tokens[0] === '$(MAKE)') {
      for (const target of tokens.slice(1).filter(token => !token.startsWith('-') && !token.includes('='))) {
        if (isTestCommand('Makefile', target)) return true;
        const rule = project.make[target];
        if (!rule) continue;
        reached.push(...rule.prerequisites.map(prerequisite => [`make ${prerequisite}`, directory, `make ${prerequisite}`]));
        reached.push(...rule.commands.map(value => [value, directory, `make ${target}`]));
      }
    }
    for (const [value, target, key] of reached) {
      const id = `${key}\n${value}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (runsTests(value, project, target, seen)) return true;
    }
  }
  return false;
}

/** The prerequisites and recipe lines of every Makefile target. */
export function makeTargets(text) {
  const targets = {};
  let current;
  for (const line of text.replace(/\\\n\s*/g, ' ').split('\n')) {
    const rule = /^([^\s#.][^:=]*):(?!=)([^#]*)/.exec(line);
    if (rule) {
      const prerequisites = rule[2].trim().split(/\s+/).filter(Boolean);
      for (const target of rule[1].trim().split(/\s+/)) targets[target] = current = { prerequisites, commands: [] };
    } else if (line.startsWith('\t') && current) {
      current.commands.push(line.trim().replace(/^[@-]+/, ''));
    }
  }
  return targets;
}
