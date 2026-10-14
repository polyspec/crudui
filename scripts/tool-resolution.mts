import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { Stats } from 'node:fs';

export interface CommandOptions {
  capture?: boolean | undefined;
  cwd?: string | undefined;
  environment?: NodeJS.ProcessEnv | undefined;
}
export interface CommandOutput {
  stdout: string;
  stderr: string;
}
/** A command runner: runCommand, or a replacement that a test passes; the callers read its standard output. */
export type CommandRunner = (
  executable: string, args: string[], options?: CommandOptions,
) => Promise<Pick<CommandOutput, 'stdout'>>;
export interface RustToolchainOptions {
  environment?: NodeJS.ProcessEnv | undefined;
  run?: CommandRunner | undefined;
  cwd?: string | undefined;
  cargo?: string | undefined;
  rustc?: string | undefined;
  rustdoc?: string | undefined;
}
export interface RustToolchain {
  cargo: string;
  rustc: string;
  rustdoc: string;
  rustHost: string;
}

export async function pathState(filename: string): Promise<Stats | null> {
  try {
    return await lstat(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Require one absolute path composed of regular directories and the expected final type. */
export async function assertRegularPath(
  filename: string, expected: 'file' | 'directory',
): Promise<string> {
  assert.ok(path.isAbsolute(filename), 'Path must be absolute: ' + filename);
  assert.equal(path.normalize(filename), filename, 'Path must be normalized: ' + filename);
  const parsed = path.parse(filename);
  let current = parsed.root;
  for (const segment of filename.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const state = await pathState(current);
    assert.ok(state, 'Path is missing: ' + current);
    assert.equal(state.isSymbolicLink(), false,
      'Path contains a symbolic link: ' + current);
    if (current === filename) {
      assert.equal(expected === 'file' ? state.isFile() : state.isDirectory(), true,
        'Path has the wrong type: ' + current);
    } else {
      assert.equal(state.isDirectory(), true, 'Path parent is not a directory: ' + current);
    }
  }
  assert.equal(await realpath(filename), filename, 'Path must be canonical: ' + filename);
  if (expected === 'file') await access(filename, constants.R_OK);
  return filename;
}

/** Require one executable regular file with no symbolic-link path component. */
export async function assertExecutable(filename: string, label: string): Promise<string> {
  assert.ok(label.length > 0, 'Executable label is required');
  await assertRegularPath(filename, 'file');
  await access(filename, constants.X_OK);
  return filename;
}

function pathDirectories(environment: NodeJS.ProcessEnv): string[] {
  const directories = (environment.PATH ?? '').split(path.delimiter).filter(Boolean);
  assert.ok(directories.every(directory => path.isAbsolute(directory)),
    'PATH entries must be absolute');
  return [...new Set(directories)];
}

async function regularCandidate(filename: string, label: string): Promise<string | undefined> {
  if (!(await pathState(filename))) return undefined;
  return assertExecutable(filename, label);
}

/** Discover every regular executable with one name from declared PATH entries. */
export async function discoverExecutables(
  name: string, environment: NodeJS.ProcessEnv,
): Promise<string[]> {
  const candidates: string[] = [];
  for (const directory of pathDirectories(environment)) {
    const candidate = await regularCandidate(path.join(directory, name), name);
    if (candidate) candidates.push(candidate);
  }
  return [...new Set(candidates)];
}

/** Discover exactly one regular executable with one name from declared PATH entries. */
export async function discoverOneExecutable(
  name: string, environment: NodeJS.ProcessEnv,
): Promise<string> {
  const candidates = await discoverExecutables(name, environment);
  assert.equal(candidates.length, 1,
    'Executable discovery for ' + name + ' requires one result; received ' + candidates.length);
  const [candidate] = candidates;
  assert.ok(candidate !== undefined);
  return candidate;
}

function commandText(executable: string, args: readonly string[]): string {
  return [executable, ...args].map(value => JSON.stringify(value)).join(' ');
}

/** Resolve one child process from its error or close event. */
export function runCommand(
  executable: string, args: readonly string[], options: CommandOptions = {},
): Promise<CommandOutput> {
  const capture = options.capture ?? false;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.environment,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      assert.ok(child.stdout && child.stderr);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => { stdout += chunk; });
      child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    }
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0 && signal === null) {
        resolve({ stdout, stderr });
        return;
      }
      const result = signal ?? code ?? 'unknown';
      // A program such as PHP reports a startup failure on its standard output.
      const output = stderr.trim() || stdout.trim();
      const detail = capture && output ? ': ' + output : '';
      reject(new Error('Command failed (' + result + '): '
        + commandText(executable, args) + detail));
    });
  });
}

export async function verifyVersion(
  executable: string, pattern: RegExp, run: CommandRunner, environment: NodeJS.ProcessEnv,
  args: string[] = ['--version'], cwd?: string,
): Promise<string> {
  const result = await run(executable, args, { capture: true, cwd, environment });
  assert.match(result.stdout.trim(), pattern,
    'Executable returned an unexpected version: ' + executable);
  return result.stdout;
}

/** Resolve one declared or PATH-discovered executable and verify its version output. */
export async function resolveExecutable(
  name: string, explicit: string | undefined, label: string, environment: NodeJS.ProcessEnv,
  run: CommandRunner, versionPattern: RegExp,
): Promise<string> {
  const executable = explicit
    ? await assertExecutable(explicit, label)
    : await discoverOneExecutable(name, environment);
  await verifyVersion(executable, versionPattern, run, environment);
  return executable;
}

function rustHost(output: string): string {
  const records = output.split(/\r?\n/)
    .filter(line => line.startsWith('host: '))
    .map(line => line.slice('host: '.length));
  assert.equal(records.length, 1, 'rustc must identify one host target');
  const [host] = records;
  assert.ok(host !== undefined);
  assert.match(host, /^[a-z0-9_]+(?:-[a-z0-9_]+)+$/,
    'rustc returned an invalid host target');
  return host;
}

function cargoHome(environment: NodeJS.ProcessEnv): string {
  if (environment.CARGO_HOME !== undefined) {
    assert.ok(path.isAbsolute(environment.CARGO_HOME), 'CARGO_HOME must be absolute');
    return path.normalize(environment.CARGO_HOME);
  }
  const home = environment.HOME;
  assert.ok(home !== undefined && path.isAbsolute(home),
    'HOME must be absolute when CARGO_HOME is omitted');
  return path.join(home, '.cargo');
}

async function discoverRustup(environment: NodeJS.ProcessEnv): Promise<string> {
  const candidates = await discoverExecutables('rustup', environment);
  const home = cargoHome(environment);
  const standard = await regularCandidate(path.join(home, 'bin', 'rustup'), 'rustup');
  if (standard) candidates.push(standard);
  const unique = [...new Set(candidates)];
  assert.equal(unique.length, 1,
    'Rustup discovery requires one result; received ' + unique.length);
  const [rustup] = unique;
  assert.ok(rustup !== undefined);
  return rustup;
}

/** Resolve Cargo, rustc and rustdoc from explicit paths or one Rustup toolchain record. */
export async function resolveRustToolchain(
  options: RustToolchainOptions = {},
): Promise<RustToolchain> {
  const environment = options.environment ?? process.env;
  const run = options.run ?? runCommand;
  assert.ok(typeof options.cwd === 'string', 'Rust toolchain working directory is required');
  const cwd = await assertRegularPath(options.cwd, 'directory');
  if (options.cargo || options.rustc || options.rustdoc) {
    assert.ok(options.cargo && options.rustc && options.rustdoc,
      'Explicit Rust tools require Cargo, rustc and rustdoc');
    const cargo = await assertExecutable(options.cargo, 'Cargo');
    const rustc = await assertExecutable(options.rustc, 'rustc');
    const rustdoc = await assertExecutable(options.rustdoc, 'rustdoc');
    await verifyVersion(cargo, /^cargo /, run, environment, ['--version'], cwd);
    const version = await verifyVersion(rustc, /^rustc /, run, environment, ['-vV'], cwd);
    await verifyVersion(rustdoc, /^rustdoc /, run, environment, ['--version'], cwd);
    return { cargo, rustc, rustdoc, rustHost: rustHost(version) };
  }
  const rustup = await discoverRustup(environment);
  await verifyVersion(rustup, /^rustup /, run, environment, ['--version'], cwd);
  const records: Partial<Record<'cargo' | 'rustc' | 'rustdoc', string>> = {};
  for (const name of ['cargo', 'rustc', 'rustdoc'] as const) {
    const result = await run(rustup, ['which', name], { capture: true, cwd, environment });
    const paths = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    assert.equal(paths.length, 1, 'Rustup must identify one ' + name + ' executable');
    const [found] = paths;
    assert.ok(found !== undefined);
    records[name] = await assertExecutable(found, name);
  }
  const { cargo, rustc, rustdoc } = records;
  assert.ok(cargo !== undefined && rustc !== undefined && rustdoc !== undefined);
  await verifyVersion(cargo, /^cargo /, run, environment, ['--version'], cwd);
  const version = await verifyVersion(
    rustc, /^rustc /, run, environment, ['-vV'], cwd,
  );
  await verifyVersion(rustdoc, /^rustdoc /, run, environment, ['--version'], cwd);
  return { cargo, rustc, rustdoc, rustHost: rustHost(version) };
}
