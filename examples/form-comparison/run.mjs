import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const exampleDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(exampleDir, '../..');
const work = path.join(root, '.form-comparison');
const context = path.join(work, 'context');
const name = 'crudui-form-comparison';
const image = 'localhost/crudui-form-comparison:1';
const revisions = { corrected: '78723bb0503aaf82fc83a6e4e84c98d9da2b4af4', original: '1e8702a6d5eeeb942aeb2f1d2950b9b30e2d0244', keyed: 'b516226447a8f7b4896a0573ac8861689e57553b' };
const command = process.argv[2] ?? 'start';
function container(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('container', args, { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`container ${args[0]} exited ${code}`)));
  });
}
if (command === 'stop') {
  await container(['stop', name]); await container(['delete', name]);
} else if (command === 'start' || command === 'prepare') {
  await mkdir(context, { recursive: true });
  await mkdir(path.join(work, 'data'), { recursive: true });
  const metadata = {};
  for (const [mode, commit] of Object.entries(revisions)) {
    const archive = execFileSync('git', ['archive', commit], { cwd: root, maxBuffer: 100 * 1024 * 1024 });
    await writeFile(path.join(context, `${mode}.tar`), archive);
    metadata[mode] = { commit, archiveSha256: createHash('sha256').update(archive).digest('hex') };
  }
  await cp(exampleDir, path.join(context, 'example'), { recursive: true });
  await cp(path.join(exampleDir, 'Containerfile'), path.join(context, 'Containerfile'));
  await writeFile(path.join(context, 'metadata.json'), JSON.stringify(metadata, null, 2));
  if (command === 'start') {
    await container(['build', '-t', image, '--progress', 'plain', context]);
    await container(['run', '-d', '--name', name, '--cpus', '1', '--memory', '512M', '-p', '127.0.0.1:4317:8080', '-v', `${work}/data:/data`, image]);
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch('http://127.0.0.1:4317/api/health')).ok) break; } catch {}
      if (attempt === 99) throw new Error('CRUDUI form comparison did not become ready');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    process.stdout.write('CRUDUI form comparison: http://localhost:4317\n');
  }
} else throw new Error('Use start, prepare or stop');
