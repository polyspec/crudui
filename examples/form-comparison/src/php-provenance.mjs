import assert from 'node:assert/strict';
import path from 'node:path';

const classFiles = Object.freeze({
  'CRUDUI\\Generator': 'packages/generator-php/src/Generator.php',
  'CRUDUI\\Form': 'packages/generator-php/src/Form.php',
  'CRUDUI\\Validator':
    'packages/generator-php/vendor/crudui/validator/src/Public/Validator.php',
});

export const phpClassNames = Object.freeze(Object.keys(classFiles));

/** Return the PHP class files selected from one explicit candidate source directory. */
export function phpClassFiles(sourceDirectory) {
  assert.ok(typeof sourceDirectory === 'string' && path.isAbsolute(sourceDirectory),
    'PHP provenance requires an absolute candidate source directory');
  return Object.fromEntries(Object.entries(classFiles).map(([name, file]) =>
    [name, path.join(sourceDirectory, file)]));
}

/** Return the first PHP class provenance field that differs from the selected runtime. */
export function phpClassProvenanceFailure(classes, native, sourceDirectory) {
  assert.equal(typeof native, 'boolean', 'PHP provenance requires an explicit runtime type');
  const files = phpClassFiles(sourceDirectory);
  if (!classes || typeof classes !== 'object' || Array.isArray(classes)) {
    return 'generator.classes';
  }
  const names = Object.keys(classes);
  if (names.length !== phpClassNames.length
    || names.some(name => !Object.hasOwn(files, name))) return 'generator.classes';
  for (const name of phpClassNames) {
    const source = classes[name];
    const field = 'generator.classes.' + name;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return field;
    if (source.internal !== native) return field + '.internal';
    if (source.extension !== (native ? 'crudui' : null)) return field + '.extension';
    if (source.file !== (native ? null : files[name])) return field + '.file';
  }
  return null;
}
