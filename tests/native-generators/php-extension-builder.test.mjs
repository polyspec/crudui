import assert from 'node:assert/strict';
import {
  chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertRegularPath,
  cleanGeneratedPaths,
  readPhpMetadata,
  readPhpPcreConfiguration,
  resolveDebianPackageExecutable,
  resolveHomebrewPhpConfig,
  resolvePhpBuildTools,
  resolvePhpPcreArguments,
} from '../../scripts/php-extension-builder.mjs';

async function executable(filename) {
  await writeFile(filename, '#!/bin/sh\nexit 0\n');
  await chmod(filename, 0o755);
  return filename;
}

async function temporaryDirectory(t) {
  const temporaryRoot = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(temporaryRoot, 'crudui-php-build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('non-Linux tool discovery uses regular PHP and C executables', async t => {
  const root = await temporaryDirectory(t);
  const bin = path.join(root, 'bin');
  await mkdir(bin);
  const phpConfig = await executable(path.join(bin, 'php-config'));
  const compiler = await executable(path.join(bin, 'cc'));
  const calls = [];
  const run = async (file, args, options) => {
    calls.push([file, args, options]);
    if (file === phpConfig) return { stdout: '8.5.10\n', stderr: '' };
    if (file === compiler) return { stdout: 'clang version 21.0.0\n', stderr: '' };
    throw new Error('Unexpected command: ' + file + ' ' + args.join(' '));
  };

  assert.deepEqual(await resolvePhpBuildTools({
    environment: { PATH: bin },
    platform: 'darwin', run,
  }), { phpConfig, compiler });
  assert.deepEqual(calls.map(([file]) => file), [phpConfig, compiler]);
});

test('tool discovery rejects symbolic and ambiguous executable paths', async t => {
  const root = await temporaryDirectory(t);
  const first = path.join(root, 'first');
  const second = path.join(root, 'second');
  const tools = path.join(root, 'tools');
  await Promise.all([mkdir(first), mkdir(second), mkdir(tools)]);
  const target = await executable(path.join(tools, 'php-config'));
  await symlink(target, path.join(first, 'php-config'));
  await executable(path.join(first, 'cc'));

  await assert.rejects(resolvePhpBuildTools({
    environment: { PATH: first },
    run: async () => ({ stdout: 'clang version 21.0.0\n', stderr: '' }),
  }), /symbolic link/i);

  await rm(path.join(first, 'php-config'));
  await executable(path.join(first, 'php-config'));
  await executable(path.join(second, 'php-config'));
  await executable(path.join(second, 'cc'));
  await assert.rejects(resolvePhpBuildTools({
    environment: { PATH: first + path.delimiter + second },
    run: async () => ({ stdout: '8.5.10\n', stderr: '' }),
  }), /requires one result; received 2/i);

  await assert.rejects(assertRegularPath('relative/php-config', 'file'), /absolute/i);
});

test('Homebrew PHP discovery selects php-config from one installed record', async t => {
  const root = await temporaryDirectory(t);
  const bin = path.join(root, 'bin');
  const cellar = path.join(root, 'Cellar', 'php');
  const version = '8.5.10';
  const phpConfigDirectory = path.join(cellar, version, 'bin');
  await Promise.all([mkdir(bin), mkdir(phpConfigDirectory, { recursive: true })]);
  const brew = await executable(path.join(bin, 'brew'));
  const phpConfig = await executable(path.join(phpConfigDirectory, 'php-config'));
  const calls = [];
  const run = async (file, args, options) => {
    calls.push([file, args, options]);
    assert.equal(file, brew);
    if (args[0] === 'info') {
      return {
        stdout: JSON.stringify({
          casks: [],
          formulae: [{ name: 'php', installed: [{ version }], linked_keg: version }],
        }) + '\n',
        stderr: '',
      };
    }
    assert.deepEqual(args, ['--cellar', 'php']);
    return { stdout: cellar + '\n', stderr: '' };
  };

  assert.equal(await resolveHomebrewPhpConfig({
    environment: { PATH: bin }, run,
  }), phpConfig);
  assert.deepEqual(calls.map(([, args]) => args), [
    ['info', '--json=v2', 'php'],
    ['--cellar', 'php'],
  ]);
  assert.ok(calls.every(([, , options]) => options.capture === true));
});

test('Linux tool discovery follows Debian package records to one target compiler', async t => {
  const root = await temporaryDirectory(t);
  const bin = path.join(root, 'bin');
  await mkdir(bin);
  const phpConfig = await executable(path.join(bin, 'php-config8.4'));
  const packageQuery = await executable(path.join(bin, 'dpkg-query'));
  const compiler = await executable(path.join(bin, 'aarch64-linux-gnu-gcc-14'));
  const calls = [];
  const statusAndDependencies = '-f=${db:Status-Abbrev}\n${Depends}\n';
  const status = '-f=${db:Status-Abbrev}\n';
  const run = async (file, args, options) => {
    calls.push([file, args, options]);
    if (file === phpConfig) return { stdout: '8.4.11\n', stderr: '' };
    if (file === compiler) return { stdout: 'gcc (Debian 14.2.0) 14.2.0\n', stderr: '' };
    if (file !== packageQuery) throw new Error('Unexpected command: ' + file);
    if (args[0] === '-L') {
      assert.deepEqual(args, ['-L', 'gcc-14-aarch64-linux-gnu']);
      return { stdout: compiler + '\n', stderr: '' };
    }
    if (args[2] === 'gcc') {
      assert.deepEqual(args, ['-W', statusAndDependencies, 'gcc']);
      return {
        stdout: 'ii \ncpp, gcc-14 (>= 14.2.0-6~), gcc-aarch64-linux-gnu\n',
        stderr: '',
      };
    }
    if (args[2] === 'gcc-14') {
      assert.deepEqual(args, ['-W', statusAndDependencies, 'gcc-14']);
      return {
        stdout: 'ii \ngcc-14-aarch64-linux-gnu (= 14.2.0-19), gcc-14-base\n',
        stderr: '',
      };
    }
    assert.deepEqual(args, ['-W', status, 'gcc-14-aarch64-linux-gnu']);
    return { stdout: 'ii \n', stderr: '' };
  };

  assert.deepEqual(await resolvePhpBuildTools({
    environment: { PATH: bin },
    packageQuery,
    phpConfig,
    platform: 'linux',
    run,
  }), { phpConfig, compiler });
  assert.deepEqual(calls.map(([file, args]) => [file, args]), [
    [phpConfig, ['--version']],
    [packageQuery, ['-W', statusAndDependencies, 'gcc']],
    [packageQuery, ['-W', statusAndDependencies, 'gcc-14']],
    [packageQuery, ['-W', status, 'gcc-14-aarch64-linux-gnu']],
    [packageQuery, ['-L', 'gcc-14-aarch64-linux-gnu']],
    [compiler, ['--version']],
  ]);
  assert.ok(calls.every(([, , options]) => options.capture === true));
});

test('PHP metadata uses one matching installation and declared include paths', async t => {
  const root = await temporaryDirectory(t);
  const prefix = path.join(root, 'php');
  const include = path.join(prefix, 'include', 'php');
  const mainInclude = path.join(include, 'main');
  const bin = path.join(prefix, 'bin');
  await mkdir(prefix);
  await Promise.all([mkdir(mainInclude, { recursive: true }), mkdir(bin)]);
  const phpConfig = await executable(path.join(bin, 'php-config'));
  const php = await executable(path.join(bin, 'php'));
  const values = {
    '--prefix': prefix,
    '--includes': '-I' + include + ' -I' + mainInclude,
    '--include-dir': include,
    '--vernum': '80510',
    '--php-binary': php,
  };
  const run = async (file, args) => {
    if (file === phpConfig) return { stdout: values[args[0]] + '\n', stderr: '' };
    if (file === php) return { stdout: '[80510,8,false,false]', stderr: '' };
    throw new Error('Unexpected command: ' + file);
  };

  const metadata = await readPhpMetadata(phpConfig, {
    minimumVersion: 80400, require64Bit: true, run,
  });
  assert.deepEqual(metadata.includeArguments, ['-I' + include, '-I' + mainInclude]);
  assert.equal(metadata.includeDirectory, include);
  assert.equal(metadata.executable, php);
  assert.equal(metadata.version, 80510);
});

test('generated path cleanup rejects a symbolic link without changing its target', async t => {
  const root = await temporaryDirectory(t);
  const target = path.join(root, 'retained');
  const extension = path.join(root, 'extension');
  const generated = path.join(extension, '.build');
  await Promise.all([mkdir(target), mkdir(extension)]);
  const retained = path.join(target, 'sentinel');
  await writeFile(retained, 'retained\n');
  await symlink(target, generated);

  await assert.rejects(cleanGeneratedPaths(extension, ['.build']), /symbolic link/i);
  assert.equal(await readFile(retained, 'utf8'), 'retained\n');

  const nestedTarget = path.join(root, 'nested-retained');
  const linkedParent = path.join(extension, 'native');
  await mkdir(nestedTarget);
  const nestedRetained = path.join(nestedTarget, 'output');
  await writeFile(nestedRetained, 'nested retained\n');
  await symlink(nestedTarget, linkedParent);
  await assert.rejects(cleanGeneratedPaths(extension, ['native/output']), /symbolic link/i);
  assert.equal(await readFile(nestedRetained, 'utf8'), 'nested retained\n');
});

test('generated path cleanup removes declared regular trees', async t => {
  const root = await temporaryDirectory(t);
  const extension = path.join(root, 'extension');
  const generated = path.join(extension, '.build');
  const nested = path.join(generated, 'objects');
  const output = path.join(nested, 'module.o');
  await mkdir(nested, { recursive: true });
  await writeFile(output, 'generated\n');

  await cleanGeneratedPaths(extension, ['.build']);
  await assert.rejects(readFile(output, 'utf8'), error => error.code === 'ENOENT');
});

async function phpHeaders(root, configuration) {
  const include = path.join(root, 'include', 'php');
  await mkdir(path.join(include, 'main'), { recursive: true });
  await writeFile(path.join(include, 'main', 'php_config.h'), configuration);
  return include;
}

const externalPcre = '/* Define to 1 if PHP uses the bundled PCRE library. */\n'
  + '/* #undef HAVE_BUNDLED_PCRE */\n'
  + '/* Number of bits in non-UTF mode for PCRE library. */\n'
  + '#define PCRE2_CODE_UNIT_WIDTH 8\n';
const bundledPcre = '#define HAVE_BUNDLED_PCRE 1\n#define PCRE2_CODE_UNIT_WIDTH 8\n';

test('a bundled PCRE2 needs only the headers PHP installs', async t => {
  const root = await temporaryDirectory(t);
  const includeDirectory = await phpHeaders(root, bundledPcre);
  const run = async (file, args) => {
    throw new Error('Unexpected command: ' + file + ' ' + args.join(' '));
  };
  await assert.rejects(resolvePhpPcreArguments({ includeDirectory }, { run }),
    /bundled PCRE2 library, whose installed header is required: .*pcre2lib\/pcre2\.h$/);

  await mkdir(path.join(includeDirectory, 'ext', 'pcre', 'pcre2lib'), { recursive: true });
  await writeFile(path.join(includeDirectory, 'ext', 'pcre', 'pcre2lib', 'pcre2.h'), '');
  const pcre = await resolvePhpPcreArguments({ includeDirectory }, { run, platform: 'linux' });
  assert.equal(pcre.bundled, true);
  assert.equal(pcre.pkgConfig, null);
  assert.deepEqual(pcre.compilerArguments, []);
});

test('php_config.h must declare the PCRE build and the 8-bit code unit width once', async t => {
  const root = await temporaryDirectory(t);
  for (const [configuration, message] of [
    ['#define PCRE2_CODE_UNIT_WIDTH 8\n', /declare HAVE_BUNDLED_PCRE once/],
    ['/* #undef HAVE_BUNDLED_PCRE */\n', /declare PCRE2_CODE_UNIT_WIDTH once/],
    ['/* #undef HAVE_BUNDLED_PCRE */\n#define PCRE2_CODE_UNIT_WIDTH 16\n',
      /PCRE2_CODE_UNIT_WIDTH as 8/],
    ['#define HAVE_BUNDLED_PCRE 1\n/* #undef HAVE_BUNDLED_PCRE */\n#define PCRE2_CODE_UNIT_WIDTH 8\n',
      /declare HAVE_BUNDLED_PCRE once/],
  ]) {
    const directory = await mkdtemp(path.join(root, 'php-'));
    await assert.rejects(readPhpPcreConfiguration(await phpHeaders(directory, configuration)),
      message);
  }
  assert.deepEqual(await readPhpPcreConfiguration(await phpHeaders(root, externalPcre)), {
    bundled: false, codeUnitWidth: 8, library: 'libpcre2-8',
  });
});

test('an external PCRE2 adds the pkg-config include paths of libpcre2-8', async t => {
  const root = await temporaryDirectory(t);
  const includeDirectory = await phpHeaders(root, externalPcre);
  const pcreInclude = path.join(root, 'pcre2', 'include');
  await mkdir(pcreInclude, { recursive: true });
  const pkgConfig = await executable(path.join(root, 'pkgconf'));
  let cflags = '-I' + pcreInclude + '\n';
  let library = true;
  const calls = [];
  const run = async (file, args, options) => {
    calls.push([file, args]);
    assert.equal(file, pkgConfig);
    assert.equal(options.capture, true);
    if (args[0] === '--version') return { stdout: '2.3.0\n', stderr: '' };
    if (!library) throw new Error('Command failed (1): Package libpcre2-8 was not found');
    if (args[0] === '--modversion') return { stdout: '10.45\n', stderr: '' };
    return { stdout: cflags, stderr: '' };
  };

  const pcre = await resolvePhpPcreArguments({ includeDirectory }, { pkgConfig, run });
  assert.deepEqual(pcre, {
    bundled: false,
    codeUnitWidth: 8,
    library: 'libpcre2-8',
    pkgConfig,
    version: '10.45',
    compilerArguments: ['-I' + pcreInclude],
  });
  assert.deepEqual(calls.map(([, args]) => args), [
    ['--version'], ['--modversion', 'libpcre2-8'], ['--cflags', 'libpcre2-8'],
  ]);

  // Headers in the compiler's default search path give no flags.
  cflags = '\n';
  assert.deepEqual(
    (await resolvePhpPcreArguments({ includeDirectory }, { pkgConfig, run })).compilerArguments,
    [],
  );
  cflags = '-I' + pcreInclude + ' -DPCRE2_STATIC\n';
  await assert.rejects(resolvePhpPcreArguments({ includeDirectory }, { pkgConfig, run }),
    /Unsupported pkg-config --cflags libpcre2-8 flag: -DPCRE2_STATIC/);
  cflags = '-I' + path.join(root, 'missing') + '\n';
  await assert.rejects(resolvePhpPcreArguments({ includeDirectory }, { pkgConfig, run }),
    /Path is missing/);
  library = false;
  await assert.rejects(resolvePhpPcreArguments({ includeDirectory }, { pkgConfig, run }),
    /cannot find libpcre2-8; install the PCRE2 development package \(Debian: libpcre2-dev, Homebrew: pcre2\)/);
});

test('pkg-config comes from the pkgconf package record of the platform', async t => {
  const root = await temporaryDirectory(t);
  const includeDirectory = await phpHeaders(root, externalPcre);
  const bin = path.join(root, 'bin');
  await mkdir(bin);
  const brew = await executable(path.join(bin, 'brew'));
  const brewRun = async (file, args) => {
    assert.equal(file, brew);
    assert.deepEqual(args, ['info', '--json=v2', 'pkgconf']);
    return {
      stdout: JSON.stringify({ casks: [], formulae: [{ name: 'pkgconf', installed: [] }] }),
      stderr: '',
    };
  };
  await assert.rejects(resolvePhpPcreArguments({ includeDirectory }, {
    environment: { PATH: bin }, platform: 'darwin', run: brewRun,
  }), /read with pkg-config; install the Homebrew pkgconf package/);

  const packageQuery = await executable(path.join(bin, 'dpkg-query'));
  const missingRun = async (file, args) => {
    assert.equal(file, packageQuery);
    assert.deepEqual(args, ['-W', '-f=${db:Status-Abbrev}\n', 'pkgconf-bin']);
    throw new Error('Command failed (1): no packages found matching pkgconf-bin');
  };
  await assert.rejects(resolvePhpPcreArguments({ includeDirectory }, {
    environment: { PATH: bin }, platform: 'linux', packageQuery, run: missingRun,
  }), /read with pkg-config; install the Debian pkgconf-bin \(pkg-config\) package/);

  const pkgconf = await executable(path.join(bin, 'pkgconf'));
  const listedRun = async (file, args) => {
    assert.equal(file, packageQuery);
    if (args[0] === '-W') return { stdout: 'ii \n', stderr: '' };
    assert.deepEqual(args, ['-L', 'pkgconf-bin']);
    return { stdout: '/.\n/usr\n' + pkgconf + '\n', stderr: '' };
  };
  assert.equal(await resolveDebianPackageExecutable('pkgconf-bin', pkgconf, {
    environment: { PATH: bin }, packageQuery, run: listedRun,
  }), pkgconf);
  await assert.rejects(resolveDebianPackageExecutable('pkgconf-bin', path.join(bin, 'other'), {
    environment: { PATH: bin }, packageQuery, run: listedRun,
  }), /must contain/);
});
