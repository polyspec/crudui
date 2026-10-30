// The npm release that `packageManager` of package.json records, with the sha512 digest of its tarball that kit requires
// (K933): npm@<major>.<minor>.<patch>+sha512.<128 hex>. Every reader of the field goes through this helper (C17.98).

/** The exact npm release of `packageManager`; throws when the field lacks the digest form. */
export function recordedNpmRelease(packageManager: string | undefined): string {
  const match = /^npm@(\d+\.\d+\.\d+)\+sha512\.[0-9a-f]{128}$/.exec(packageManager ?? '');
  if (!match) throw new Error(`package.json must record packageManager as npm@<major>.<minor>.<patch>+sha512.<hex>; it records ${packageManager}`);
  return match[1] ?? '';
}
