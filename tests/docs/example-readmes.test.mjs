import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repository = path.resolve(import.meta.dirname, '../..');
const examples = path.join(repository, 'examples');
const languages = [['README.md', 'README.ko.md'], ['README.ko.md', 'README.md']];

function exampleDirectories() {
  return readdirSync(examples, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

function relativeLinks(source) {
  const prose = source.replace(/^```[^\n]*\n[\s\S]*?^```/gm, '').replace(/`[^`\n]+`/g, '');
  const links = [];
  for (const match of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
    links.push(target);
  }
  return links;
}

function resolvedTarget(readme, link) {
  return path.resolve(path.dirname(readme), decodeURIComponent(link.split('#')[0]));
}

test('relative link extraction ignores code, anchors and external links', () => {
  assert.deepEqual(relativeLinks([
    '[한국어](README.ko.md). [Site](https://example.com) [Top](#run)',
    '`[code](missing.md)`',
    '```sh',
    '[block](missing.md)',
    '```',
    '[Guide](../docs/guide.md#install)',
  ].join('\n')), ['README.ko.md', '../docs/guide.md#install']);
});

test('every example has English and Korean READMEs', () => {
  const missing = [];
  for (const directory of exampleDirectories()) {
    for (const [name] of languages) {
      if (!existsSync(path.join(examples, directory, name))) missing.push(`examples/${directory}/${name}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('example READMEs link to each other and every relative link resolves', () => {
  const failures = [];
  for (const directory of exampleDirectories()) {
    for (const [name, counterpart] of languages) {
      const readme = path.join(examples, directory, name);
      if (!existsSync(readme)) continue;
      const label = `examples/${directory}/${name}`;
      const links = relativeLinks(readFileSync(readme, 'utf8'));
      if (!links.some(link => resolvedTarget(readme, link) === path.join(examples, directory, counterpart))) {
        failures.push(`${label}: no link to ${counterpart}`);
      }
      for (const link of links) {
        if (!existsSync(resolvedTarget(readme, link))) failures.push(`${label}: unresolved ${link}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});
