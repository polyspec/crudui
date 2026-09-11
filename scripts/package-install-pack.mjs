import assert from 'node:assert/strict';
import path from 'node:path';

/** Pack one workspace package from its own directory and return the archive path. */
export function packPackage(source, destination, packageName, run) {
  assert.ok(path.isAbsolute(source), `Package source must be absolute: ${source}`);
  assert.ok(path.isAbsolute(destination),
    `Package destination must be absolute: ${destination}`);
  assert.equal(typeof packageName, 'string', 'Package name is required');
  assert.equal(typeof run, 'function', 'Package command runner is required');

  const output = run('npm', [
    'pack', '.', '--json', '--pack-destination', destination, '--workspaces=false',
  ], source);
  let report;
  try {
    report = JSON.parse(output);
  } catch {
    assert.fail('npm pack returned invalid JSON');
  }
  assert.ok(report !== null && typeof report === 'object' && !Array.isArray(report),
    'npm pack report must be an object');
  const entries = Object.entries(report);
  assert.equal(entries.length, 1,
    `npm pack must produce one archive; received ${entries.length}`);
  const [[reportedName, result]] = entries;
  assert.equal(reportedName, packageName, 'npm pack report key must match the package name');
  assert.equal(result?.name, packageName, 'npm pack result must match the package name');
  const filename = result?.filename;
  assert.equal(typeof filename, 'string', 'npm pack report must include the archive filename');
  assert.equal(path.basename(filename), filename,
    `npm pack archive must be a filename: ${filename}`);
  return path.join(destination, filename);
}
