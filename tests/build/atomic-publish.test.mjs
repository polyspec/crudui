// Shared outputs that another run reads at any time are published atomically: each is written to a path of its run and
// renamed into place, so a reader finds the previous output or the new one, never a missing or partial one. The
// behaviour of each publication is tested beside its program; this file keeps every program on that form.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFileSync(path.join(ROOT, file), 'utf8');

// Each shared output: the program, the staging path it writes and the rename that publishes it.
const publications = [
  { output: 'the build stamp', file: 'scripts/require-current-build.mjs', staging: /writeFile\(`\$\{STAMP\}\.\$\{process\.pid\}`/, publish: /rename\(`\$\{STAMP\}\.\$\{process\.pid\}`, STAMP\)/ },
  { output: 'the PHP module', file: 'scripts/php-extension-builder.mjs', staging: /const linked = module \+ '\.' \+ process\.pid;/, publish: /await rename\(linked, module\);/ },
  { output: 'the PHP build manifest', file: 'scripts/php-extension-builder.mjs', staging: /writeFile\(manifest \+ '\.' \+ process\.pid,/, publish: /rename\(manifest \+ '\.' \+ process\.pid, manifest\)/ },
  { output: 'a package dist', file: 'scripts/package-dist.mjs', staging: /CRUDUI_DIST: 'dist\.next'/, publish: /fs\.renameSync\(next, dist\);/ },
  { output: 'the OrderedJSON checkout', file: 'examples/form-comparison/src/ordered-json-source.mjs', staging: /const next = `\$\{directory\}\.next-\$\{process\.pid\}`;/, publish: /await rename\(next, directory\);/ },
];

test('every shared output is written to a path of its run and renamed into place', () => {
  const violations = publications.flatMap(({ output, file, staging, publish }) => {
    const source = read(file);
    return [
      ...(staging.test(source) ? [] : [`${file}: ${output} is not written to a path of its run (${staging})`]),
      ...(publish.test(source) ? [] : [`${file}: ${output} is not renamed into place (${publish})`]),
    ];
  });
  assert.deepEqual(violations, []);
});

test('every package build writes into the staging directory that package-dist names', () => {
  const violations = [];
  for (const name of ['validator-ts', 'generator-core', 'generator-html', 'generator-react', 'generator-vue', 'generator-svelte', 'form-binding']) {
    const build = JSON.parse(read(`packages/${name}/package.json`)).scripts.build;
    const steps = build.slice(build.indexOf("'") + 1, build.lastIndexOf("'")).split(' && ');
    for (const step of steps) if (!step.includes('"$CRUDUI_DIST"')) violations.push(`${name}: \`${step}\` does not write into "$CRUDUI_DIST"`);
  }
  assert.deepEqual(violations, []);
});
