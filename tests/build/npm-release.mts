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

// The bootstrap step of kit's workflows (K938-1): the npm of devEngines.packageManager installs the lock outside the checkout,
// since the npm of the runner refuses a folder whose devEngines names another npm. kit-sync copies it into every workflow.
export const NATIVE_NPM_BOOTSTRAP = `root="$PWD"; version="$(node -p 'require("./package.json").devEngines.packageManager.version')"; (cd "\${RUNNER_TEMP:?RUNNER_TEMP is not set}" && npm_config_cache="$root/var/bootstrap/npm-cache" npm exec --yes --package="npm@$version" -- npm --prefix "$root" ci --ignore-scripts --allow-remote=root)`;

/** Whether a line of a workflow step is that bootstrap, matched whole, since its subshell holds an &&. */
export const nativeNpmBootstrap = (line: string | undefined): boolean => line?.trim() === NATIVE_NPM_BOOTSTRAP;

/** The assignment by which a bootstrap reads the npm release of devEngines.packageManager, on one line or over several. */
export const DEVENGINES_NPM_VERSION = `version="$(node -p 'require("./package.json").devEngines.packageManager.version')"`;
