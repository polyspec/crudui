import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

/**
 * The report of the one archive in the JSON output of `npm pack --json`. npm 11 prints an array of
 * reports and npm 12 an object keyed by package name; both name the package and its archive.
 */
export function packReport(output, packageName) {
  let report;
  try {
    report = JSON.parse(output);
  } catch {
    assert.fail(`npm pack returned invalid JSON instead of the report of ${packageName}`);
  }
  const results = Array.isArray(report)
    ? report
    : report && typeof report === 'object' && report.filename
      ? [report]
      : report && typeof report === 'object'
        ? Object.values(report)
        : [];
  assert.equal(results.length, 1,
    `npm pack must produce one archive of ${packageName}; received ${results.length}`);
  const [result] = results;
  if (result?.name !== undefined) {
    assert.equal(result.name, packageName, 'npm pack report name must match the package name');
  }
  return result;
}

/** Pack one workspace package under the lock of its dist and return the archive path. */
export async function packPackage(source, destination, packageName, run) {
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

  // scripts/package-dist.mjs packs under the lock of the package's dist, so no build of another
  // run empties dist during the pack.
  const output = await run(process.execPath, [
    path.join(repositoryRoot, 'scripts/package-dist.mjs'), 'pack', source, destination,
  ], repositoryRoot);
  const result = packReport(output, packageName);
  const filename = result?.filename;
  assert.equal(typeof filename, 'string', 'npm pack report must include the archive filename');
  assert.equal(path.basename(filename), filename,
    `npm pack archive must be a filename: ${filename}`);
  return path.join(destination, filename);
}
