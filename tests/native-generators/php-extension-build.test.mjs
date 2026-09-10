import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

function executable(filename, source) {
  writeFileSync(filename, source);
  chmodSync(filename, 0o755);
}

test('PHP extension build removes previous generated configuration', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'crudui-php-extension-build-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const scripts = path.join(root, 'scripts');
  const extension = path.join(root, 'packages/php-ext');
  const commands = path.join(root, 'commands');
  const trace = path.join(root, 'trace');
  mkdirSync(scripts, { recursive: true });
  mkdirSync(path.join(extension, 'build'), { recursive: true });
  mkdirSync(path.join(extension, 'tests'), { recursive: true });
  mkdirSync(commands);
  writeFileSync(
    path.join(scripts, 'build-php-extension.sh'),
    readFileSync(path.join(repositoryRoot, 'scripts/build-php-extension.sh')),
  );
  writeFileSync(path.join(extension, 'config.m4'), 'PHP_ARG_ENABLE([crudui])\n');
  writeFileSync(path.join(extension, 'build/previous'), 'previous configuration\n');
  chmodSync(path.join(extension, 'build/previous'), 0o444);
  const testSource = '<?php echo \'tracked test source\\n\';\n';
  writeFileSync(path.join(extension, 'tests/api.php'), testSource);
  writeFileSync(path.join(extension, 'tests/validate.php'), testSource);

  executable(path.join(commands, 'phpize'), `#!/bin/sh
set -eu
if [ "\${1-}" = --clean ]; then
  printf 'phpize --clean\n' >>"$TRACE"
  rm -rf build configure
  rm -f tests/*.php
  exit 0
fi
printf 'phpize\n' >>"$TRACE"
if [ -e build/previous ]; then
  echo 'previous generated configuration was not removed' >&2
  exit 64
fi
mkdir -p build
cat >configure <<'EOF'
#!/bin/sh
printf 'configure %s\n' "$*" >>"$TRACE"
EOF
chmod +x configure
`);
  executable(path.join(commands, 'make'), `#!/bin/sh
printf 'make %s\n' "$*" >>"$TRACE"
`);
  executable(path.join(commands, 'php'), `#!/bin/sh
printf 'php %s\n' "$*" >>"$TRACE"
`);

  const result = spawnSync('sh', [path.join(scripts, 'build-php-extension.sh')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${commands}:/usr/bin:/bin`,
      TRACE: trace,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(path.join(extension, 'tests/api.php'), 'utf8'), testSource);
  assert.equal(readFileSync(path.join(extension, 'tests/validate.php'), 'utf8'), testSource);
  assert.deepEqual(readFileSync(trace, 'utf8').trim().split('\n'), [
    'phpize',
    'configure --enable-crudui',
    'make -j2',
    `php -n -d extension=${extension}/modules/crudui.so --ri crudui`,
  ]);
});
