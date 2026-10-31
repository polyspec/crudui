// Records the one package folder that PIE built for polyspec/ordered-json-php-ext under the PIE work folder (C17.96, C17.102):
// node scripts/ordered-json-package.mts <pie-work> <output-file>
import fs from 'node:fs';
import path from 'node:path';

interface InstalledPackage {
  name?: string;
  extra?: { 'pie-built-binary'?: unknown };
  'install-path'?: unknown;
}

const [work, output] = process.argv.slice(2);
const builds: string[] = [];
for (const target of fs.existsSync(work) ? fs.readdirSync(work) : []) {
  const composer = path.join(work, target, 'vendor', 'composer');
  const file = path.join(composer, 'installed.json');
  if (!fs.existsSync(file)) continue;
  const installed = JSON.parse(fs.readFileSync(file, 'utf8')) as { packages?: InstalledPackage[] };
  for (const entry of installed.packages ?? []) {
    const binary = entry.extra?.['pie-built-binary'];
    if (entry.name === 'polyspec/ordered-json-php-ext' && typeof binary === 'string' && typeof entry['install-path'] === 'string') {
      builds.push(path.resolve(composer, entry['install-path']));
    }
  }
}
if (builds.length !== 1) throw new Error(`PIE recorded ${builds.length} builds of polyspec/ordered-json-php-ext in ${work}, not one`);
fs.writeFileSync(output, `${builds[0]}\n`);
