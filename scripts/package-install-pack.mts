import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isRecord, parseJson } from './values.mts';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

/**
 * The report of the one archive in the JSON output of `npm pack --json`. npm 11 prints an array of
 * reports and npm 12 an object keyed by package name; both name the package and its archive.
 */
/** The report of one archive of `npm pack --json`. */
export interface PackReport {
  [key: string]: unknown;
  name?: string;
  filename?: string;
  files: { path: string }[];
}

/** Whether `value` has the fields of an archive report of npm pack that the callers read. */
function isPackReport(value: unknown): value is PackReport {
  return isRecord(value)
    && (value.name === undefined || typeof value.name === 'string')
    && (value.filename === undefined || typeof value.filename === 'string')
    && Array.isArray(value.files) && value.files.every((file) => isRecord(file) && typeof file.path === 'string');
}

export function packReport(output: string, packageName: string): PackReport {
  let report: unknown;
  try {
    report = JSON.parse(output);
  } catch {
    assert.fail(`npm pack returned invalid JSON instead of the report of ${packageName}`);
  }
  const results: unknown[] = Array.isArray(report)
    ? report
    : report && typeof report === 'object' && 'filename' in report && report.filename
      ? [report]
      : report && typeof report === 'object'
        ? Object.values(report)
        : [];
  assert.equal(results.length, 1,
    `npm pack must produce one archive of ${packageName}; received ${results.length}`);
  // An archive report of npm pack, whose name and filename the callers check.
  const [result] = results;
  assert.ok(isPackReport(result), `npm pack must report the archive of ${packageName} with its name, filename and files`);
  if (result.name !== undefined) {
    assert.equal(result.name, packageName, 'npm pack report name must match the package name');
  }
  return result;
}

/** Pack one workspace package under the lock of its dist and return the archive path. */
export async function packPackage(
  source: string, destination: string, packageName: string,
  run: (command: string, args: string[], cwd: string) => Promise<string>,
): Promise<string> {
  assert.ok(path.isAbsolute(source), `Package source must be absolute: ${source}`);
  assert.ok(path.isAbsolute(destination),
    `Package destination must be absolute: ${destination}`);
  assert.equal(typeof packageName, 'string', 'Package name is required');
  assert.equal(typeof run, 'function', 'Package command runner is required');
  const sourceManifest = parseJson(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  assert.equal(isRecord(sourceManifest) ? sourceManifest.name : undefined, packageName,
    'Package source name must match the expected package name');

  // scripts/package-dist.mts packs under the lock of the package's dist, so no build of another
  // run empties dist during the pack.
  const output = await run(process.execPath, [
    path.join(repositoryRoot, 'scripts/package-dist.mts'), 'pack', source, destination,
  ], repositoryRoot);
  const result = packReport(output, packageName);
  const filename = result?.filename;
  assert.ok(typeof filename === 'string', 'npm pack report must include the archive filename');
  assert.equal(path.basename(filename), filename,
    `npm pack archive must be a filename: ${filename}`);
  return path.join(destination, filename);
}
