#!/usr/bin/env node
/** Validate the executable CRUDUI contract manifest and its repository links. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, 'contracts/features.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const schema = JSON.parse(readFileSync(resolve(root, 'contracts/features.schema.json'), 'utf8'));
const schemaValidate = new Ajv({ allErrors: true, strict: false }).compile(schema);
const supportValues = new Set(manifest.supportValues);
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };

check(schemaValidate(manifest), `manifest schema: ${(schemaValidate.errors ?? []).map((error) => `${error.instancePath} ${error.message}`).join('; ')}`);
check(manifest.format === 'crudui/features-manifest', 'format must identify the CRUDUI feature manifest');
check(manifest.version === '0.0.1', 'manifest version must match the package version');

const packageNames = new Set();
for (const pkg of manifest.packages ?? []) {
  check(!packageNames.has(pkg.name), `duplicate package: ${pkg.name}`);
  packageNames.add(pkg.name);
  const packagePath = resolve(root, pkg.path);
  const packageFile = resolve(packagePath, 'package.json');
  check(existsSync(packageFile), `${pkg.name}: missing ${pkg.path}/package.json`);
  if (!existsSync(packageFile)) continue;
  const packageManifest = JSON.parse(readFileSync(packageFile, 'utf8'));
  check(packageManifest.name === pkg.name, `${pkg.path}: package name mismatch`);
  const source = resolve(packagePath, 'src');
  for (const exportName of pkg.exports ?? []) {
    check(existsSync(source), `${pkg.name}: missing source directory`);
    if (existsSync(source)) {
      const sourceText = [...readdirSync(source, { recursive: true })]
        .filter((name) => /\.(?:ts|tsx|js|mjs)$/.test(String(name)))
        .map((name) => readFileSync(resolve(source, String(name)), 'utf8'))
        .join('\n');
      check(new RegExp(`\\b${exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(sourceText), `${pkg.name}: export is not present in source: ${exportName}`);
    }
  }
}

const featureIds = new Set();
for (const feature of manifest.features ?? []) {
  check(!featureIds.has(feature.id), `duplicate feature: ${feature.id}`);
  featureIds.add(feature.id);
  check(packageNames.has(feature.owner), `${feature.id}: owner is not listed: ${feature.owner}`);
  check(['planned', 'partial', 'implemented'].includes(feature.status), `${feature.id}: invalid status: ${feature.status}`);
  check(typeof feature.signature === 'string' && feature.signature.length > 0, `${feature.id}: signature is required`);
  check(Array.isArray(feature.errors) && feature.errors.length > 0, `${feature.id}: errors are required`);
  for (const support of Object.values(feature.support ?? {})) check(supportValues.has(support), `${feature.id}: invalid support value: ${support}`);
  for (const fixture of feature.fixtures ?? []) check(existsSync(resolve(root, fixture)), `${feature.id}: missing fixture: ${fixture}`);
  for (const test of feature.tests ?? []) check(existsSync(resolve(root, test)), `${feature.id}: missing test: ${test}`);
  const verificationIds = new Set();
  check(feature.status === 'planned' || feature.verification.length > 0, `${feature.id}: verification commands are required for non-planned features`);
  for (const verification of feature.verification ?? []) {
    check(!verificationIds.has(verification.id), `${feature.id}: duplicate verification: ${verification.id}`);
    verificationIds.add(verification.id);
    check(typeof verification.command === 'string' && verification.command.length > 0, `${feature.id}: verification command is required: ${verification.id}`);
  }
  for (const doc of feature.docs ?? []) check(existsSync(resolve(root, doc)), `${feature.id}: missing document: ${doc}`);
}

for (const fixture of manifest.fixtures ?? []) check(existsSync(resolve(root, fixture.path)), `missing fixture: ${fixture.path}`);
for (const example of manifest.examples ?? []) {
  check(existsSync(resolve(root, example.input)), `${example.id}: missing input: ${example.input}`);
  check(existsSync(resolve(root, example.expected)), `${example.id}: missing expected output: ${example.expected}`);
}

assert.deepEqual(errors, [], errors.join('\n'));
process.stdout.write(`[manifest] ${manifest.features.length} features, ${manifest.packages.length} packages and ${manifest.fixtures.length} fixture links passed\n`);
