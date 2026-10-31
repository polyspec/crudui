// The npm release that devEngines.packageManager of package.json records: an exact version of npm that npm enforces with onFail
// error (K938). Every reader of the field goes through this helper (C17.98, C17.105).
import type { PackageManagerEngine } from '../json.mts';

/** The exact npm release of devEngines.packageManager; throws when the entry names another package manager or no exact version. */
export function recordedNpmRelease(packageManager: PackageManagerEngine | undefined): string {
  const version = packageManager?.version ?? '';
  if (packageManager?.name !== 'npm' || packageManager.onFail !== 'error' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`package.json must declare devEngines.packageManager as npm with an exact version and onFail error; it declares ${JSON.stringify(packageManager)}`);
  }
  return version;
}
