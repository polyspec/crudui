import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/** Pack one workspace package from its own directory and return the archive path. */
export function packPackage(source, destination, packageName, run) {
  assert.ok(path.isAbsolute(source), `Package source must be absolute: ${source}`);
  assert.ok(path.isAbsolute(destination),
    `Package destination must be absolute: ${destination}`);
  assert.equal(typeof packageName, 'string', 'Package name is required');
  assert.equal(typeof run, 'function', 'Package command runner is required');
  const sourceManifest = JSON.parse(
    fs.readFileSync(path.join(source, 'package.json'), 'utf8'),
  );
  assert.equal(sourceManifest.name, packageName,
    'Package source name must match the expected package name');

  const output = run('npm', [
    'pack', '.', '--json', '--pack-destination', destination, '--workspaces=false',
  ], source);
  let report;
  try {
    report = JSON.parse(output);
  } catch {
    assert.fail('npm pack returned invalid JSON');
  }
  const results = Array.isArray(report)
    ? report
    : report && typeof report === 'object' && report.filename
      ? [report]
      : report && typeof report === 'object'
        ? Object.values(report)
        : [];
  assert.equal(results.length, 1,
    `npm pack must produce one archive; received ${results.length}`);
  const [result] = results;
  if (result?.name !== undefined) {
    assert.equal(result.name, packageName, 'npm pack report name must match the package name');
  }
  const filename = result?.filename;
  assert.equal(typeof filename, 'string', 'npm pack report must include the archive filename');
  assert.equal(path.basename(filename), filename,
    `npm pack archive must be a filename: ${filename}`);
  return path.join(destination, filename);
}
