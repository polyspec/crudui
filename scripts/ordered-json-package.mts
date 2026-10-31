// Records the one package folder that PIE built for polyspec/ordered-json-php-ext under the PIE work folder (C17.96, C17.102):
// node scripts/ordered-json-package.mts <pie-work> <output-file>
import fs from 'node:fs';
import path from 'node:path';

const work = process.argv[2];
const output = process.argv[3];
if (work === undefined || output === undefined) throw new Error('usage: ordered-json-package.mts <pie-work> <output-file>');
const builds: string[] = [];
for (const target of fs.existsSync(work) ? fs.readdirSync(work) : []) {
  const composer = path.join(work, target, 'vendor', 'composer');
  const file = path.join(composer, 'installed.json');
  if (!fs.existsSync(file)) continue;
  const installed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  const packages: unknown[] = typeof installed === 'object' && installed !== null && 'packages' in installed && Array.isArray(installed.packages) ? installed.packages : [];
  for (const entry of packages) {
    if (typeof entry !== 'object' || entry === null || !('name' in entry) || entry.name !== 'polyspec/ordered-json-php-ext') continue;
    const extra = 'extra' in entry ? entry.extra : undefined;
    const binary = typeof extra === 'object' && extra !== null && 'pie-built-binary' in extra ? extra['pie-built-binary'] : undefined;
    const installPath = 'install-path' in entry ? entry['install-path'] : undefined;
    if (typeof binary === 'string' && typeof installPath === 'string') builds.push(path.resolve(composer, installPath));
  }
}
if (builds.length !== 1) throw new Error(`PIE recorded ${builds.length} builds of polyspec/ordered-json-php-ext in ${work}, not one`);
fs.writeFileSync(output, `${builds[0]}\n`);
