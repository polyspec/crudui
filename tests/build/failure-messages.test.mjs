// Every failure names what failed and why (AGENTS, "Idempotency"): a file read of a Rust program names the path and
// the error of the system, so a missing or unreadable file is found from the message alone.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('no Rust file read discards the path and the error', () => {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.rs'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(file => file && existsSync(path.join(ROOT, file)));
  const violations = [];
  for (const file of files) {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    // A read whose result is unwrapped or expected with a fixed text, or whose error is dropped by `|_|`.
    for (const match of source.matchAll(/fs::read_to_string\((?:[^;]|\n)*?\)\s*\.\s*(unwrap\(\)|expect\("[^"]*"\)|map_err\(\|_\|)/g)) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(`${file}:${line}: ${match[1]}`);
    }
  }
  assert.deepEqual(violations, [], 'name the path and the error, as in unwrap_or_else(|error| panic!("read {path}: {error}"))');
});
