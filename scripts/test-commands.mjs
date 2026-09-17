// Project commands and the test tools they call. tests/build/test-commands.test.mjs uses these to
// require that every test runs through scripts/run-tests.mjs. `npm test` and `composer test` run a
// declared script, which is checked where it is declared.

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
