import { spawnSync } from 'node:child_process';
import { readGitArchiveCommit } from '../verify-candidate-context.mjs';

const phpClasses = new Map([
  ['CRUDUI\\Generator', '/packages/generator-php/src/Generator.php'],
  ['CRUDUI\\Form', '/packages/generator-php/src/Form.php'],
  ['CRUDUI\\Validator', '/packages/validator-php/src/Public/Validator.php'],
]);

/** Read the embedded commit without buffering the remaining archive into Git. */
export function readSourceArchiveCommit(archiveFile, execute = spawnSync) {
  return readGitArchiveCommit(archiveFile, execute);
}

/** Verify metadata against the deployed Git archive. */
export function sourceArchiveReady(metadata, archiveSha256, archiveCommit) {
  return /^[a-f0-9]{64}$/.test(archiveSha256)
    && /^[a-f0-9]{40}$/.test(archiveCommit)
    && metadata.source?.archiveSha256 === archiveSha256
    && metadata.source?.commit === archiveCommit;
}

function phpReady(server, value, metadata, expectedSignatures) {
  const native = server === 'php-ext';
  const generator = value.generator;
  if (!generator || generator.runtime !== server || generator.commit !== metadata.source?.commit || generator.nativeCRUDUI !== native) return false;
  if (generator.archiveSha256 !== metadata.source?.archiveSha256) return false;
  if (generator.moduleSha256 !== (native ? metadata.cruduiModuleSha256 : null)) return false;
  if (generator.composerAutoload !== !native) return false;
  if (value.nativeJson !== native || !generator.classes || Array.isArray(generator.classes)) return false;
  if (!generator.signatures || Array.isArray(generator.signatures)) return false;
  const classes = Object.keys(generator.classes);
  if (classes.length !== phpClasses.size || classes.some(name => !phpClasses.has(name))) return false;
  const signatures = Object.keys(generator.signatures);
  if (signatures.length !== phpClasses.size || signatures.some(name => !phpClasses.has(name))) return false;
  if (native && expectedSignatures === undefined) return false;
  if (expectedSignatures !== undefined && JSON.stringify(generator.signatures) !== JSON.stringify(expectedSignatures)) return false;
  return classes.every(name => {
    const source = generator.classes[name];
    if (!source || source.internal !== native || source.extension !== (native ? 'crudui' : null)) return false;
    return native ? source.file === null : typeof source.file === 'string' && source.file.startsWith('/') && source.file.endsWith(phpClasses.get(name));
  });
}

/** Verify that a child server reports the source and implementation it must run. */
export function serverReady(server, responseOk, value, metadata, expectedPhpSignatures) {
  if (!responseOk || !value || value.status !== 'ok' || value.server !== server) return false;
  if (server === 'php' || server === 'php-ext') return phpReady(server, value, metadata, expectedPhpSignatures);
  return value.commit === metadata.source?.commit;
}
