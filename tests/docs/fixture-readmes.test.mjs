import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repository = path.resolve(import.meta.dirname, '../..');
const fixtures = path.join(repository, 'tests/fixtures');
const families = readdirSync(fixtures, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();

/** Link targets of Markdown prose, without fenced code, external URLs or fragments. */
function relativeLinks(source) {
  const prose = source.replace(/^```[^\n]*\n[\s\S]*?^```/gm, '');
  const links = [];
  for (const match of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    links.push(target);
  }
  return links;
}

test('fixture README link extraction ignores code, external links and fragments', () => {
  assert.deepEqual(
    relativeLinks('[a](a.md#part) [b](https://example.com) [c](#here)\n```md\n[d](d.md)\n```\n'),
    ['a.md'],
  );
});

test('tests/fixtures contains shared fixture families', () => {
  assert.ok(families.length > 0, 'tests/fixtures must contain fixture directories');
});

test('every fixture family has an English and a Korean README', () => {
  const missing = [];
  for (const family of families) {
    for (const file of ['README.md', 'README.ko.md']) {
      if (!existsSync(path.join(fixtures, family, file))) missing.push(`tests/fixtures/${family}/${file}`);
    }
  }
  assert.deepEqual(missing, [], `missing fixture READMEs:\n${missing.join('\n')}`);
});

test('fixture READMEs link to each other and every relative link resolves', () => {
  const failures = [];
  for (const family of families) {
    for (const [file, counterpart] of [['README.md', 'README.ko.md'], ['README.ko.md', 'README.md']]) {
      const location = path.join(fixtures, family, file);
      if (!existsSync(location)) continue;
      const label = `tests/fixtures/${family}/${file}`;
      const links = relativeLinks(readFileSync(location, 'utf8'));
      if (!links.includes(counterpart)) failures.push(`${label}: does not link ${counterpart}`);
      for (const link of links) {
        if (!existsSync(path.resolve(path.dirname(location), decodeURIComponent(link)))) {
          failures.push(`${label}: missing link target ${link}`);
        }
      }
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});
