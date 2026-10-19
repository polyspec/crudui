// Installs the phpDocumentor release that the PHP API documentation runs (scripts/gen-api-docs.mts) into
// var/tools/phpdocumentor/phpDocumentor.phar, the download of `make crudui-install-phpdocumentor`. The phar is checked by its
// SHA-256 before it replaces an installed one, and a release already installed with that digest stays.
//
//   node scripts/install-phpdocumentor.mts
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '3.10.0';
const SHA256 = 'fe1e7c23ba3329aa6f19ac3c807446159a431a195ec5d9163b0c281a15105207';
const URL = `https://github.com/phpDocumentor/phpDocumentor/releases/download/v${VERSION}/phpDocumentor.phar`;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The installed phar, which scripts/gen-api-docs.mts runs. */
export const PHAR = path.join(root, 'var/tools/phpdocumentor/phpDocumentor.phar');

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

if (existsSync(PHAR) && sha256(readFileSync(PHAR)) === SHA256) {
  process.stdout.write(`[phpdocumentor] ${VERSION} is installed in ${path.relative(root, PHAR)}\n`);
} else {
  const response = await fetch(URL);
  if (!response.ok) throw new Error(`GET ${URL} answered ${response.status} ${response.statusText}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== SHA256) throw new Error(`phpDocumentor ${VERSION}: SHA-256 mismatch: expected ${SHA256}, received ${actual}`);
  mkdirSync(path.dirname(PHAR), { recursive: true });
  const next = `${PHAR}.next`;
  rmSync(next, { force: true });
  writeFileSync(next, bytes);
  renameSync(next, PHAR);
  process.stdout.write(`[phpdocumentor] installed ${VERSION} in ${path.relative(root, PHAR)}\n`);
}
process.stdout.write(execFileSync('php', [PHAR, '--version'], { encoding: 'utf8' }));
