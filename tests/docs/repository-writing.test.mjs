import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repository = path.resolve(import.meta.dirname, '../..');
const excludedPrefixes = [
  'docs/api/',
  'docs/.site/',
  'docs/.vitepress/',
];
const sourceExtensions = new Set([
  '.c', '.cjs', '.go', '.js', '.mjs', '.mts', '.php', '.rs', '.sh', '.ts', '.tsx', '.vue',
]);
const descriptiveJsonKeys = new Set(['description', 'message', 'note', 'summary', 'title']);
const discouraged = [
  ['color-coded test status', /\b(?:RED|GREEN)\b/g],
  ['test-path metaphor', /\blanes?\b/gi],
  ['acceptance-check metaphor', /\bgates?\b/gi],
  ['implementation-history wording', /\b(?:ported|porting|copied from|adapted from|inspired by)\b/gi],
  ['등급 비유', /1급/g],
  ['상태 비유', /죽은 코드|반쪽 게이트/g],
  ['이식 이력', /포팅|무수정 적용/g],
];

function trackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: repository, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split('\0').filter(Boolean)
    .filter(file => !excludedPrefixes.some(prefix => file.startsWith(prefix)))
    .filter(file => existsSync(path.join(repository, file)));
}

function markdownProse(source) {
  return removeInlineCode(source.replace(/^```[^\n]*\n[\s\S]*?^```/gm, ''));
}

function removeInlineCode(source) {
  return source.replace(/`[^`\n]+`/g, '');
}

function sourceComments(source) {
  const comments = [];
  for (const match of source.matchAll(/\/\*[\s\S]*?\*\//g)) comments.push(match[0]);
  for (const line of source.split('\n')) {
    const slash = line.indexOf('//');
    if (slash >= 0 && line[slash - 1] !== ':') comments.push(line.slice(slash));
    if (/^\s*#(?![!])/.test(line)) comments.push(line);
  }
  return removeInlineCode(comments.join('\n'));
}

function jsonDescriptions(source) {
  const values = [];
  function visit(value, key = '') {
    if (typeof value === 'string' && descriptiveJsonKeys.has(key)) values.push(value);
    else if (Array.isArray(value)) value.forEach(item => visit(item, key));
    else if (value && typeof value === 'object') {
      for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
    }
  }
  visit(JSON.parse(source));
  return removeInlineCode(values.join('\n'));
}

function maintainedProse(file, source) {
  if (file.endsWith('.md')) return markdownProse(source);
  if (file.endsWith('.json')) return jsonDescriptions(source);
  if (sourceExtensions.has(path.extname(file))) return sourceComments(source);
  return '';
}

test('repository prose extraction excludes inline code only', () => {
  assert.equal(markdownProse('Uses `gate` as an identifier.'), 'Uses  as an identifier.');
  assert.equal(sourceComments('// Calls `gate()`.'), '// Calls .');
  assert.equal(
    jsonDescriptions('{"description":"Returns `gate` unchanged."}'),
    'Returns  unchanged.',
  );
  assert.match(markdownProse('The gate accepts the result.'), /\bgates?\b/i);
});

test('maintained repository prose describes current operations directly', () => {
  const failures = [];
  for (const file of trackedFiles()) {
    const source = readFileSync(path.join(repository, file), 'utf8');
    const prose = maintainedProse(file, source);
    for (const [label, pattern] of discouraged) {
      pattern.lastIndex = 0;
      for (const match of prose.matchAll(pattern)) {
        const line = prose.slice(0, match.index).split('\n').length;
        failures.push(`${file}:${line}: ${label}: ${JSON.stringify(match[0])}`);
      }
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});
