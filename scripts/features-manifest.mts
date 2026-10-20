// contracts/features.json, the feature contract manifest, read through its JSON Schema contracts/features.schema.json (kit
// K158): ajv's type guard gives a value the type FeatureManifest only once the schema accepts it, and a manifest of another
// shape fails with the errors of ajv.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv, type SchemaObject } from 'ajv';
import { shapeOf } from './json-schema.mts';

/** An entry of a package of the manifest. */
export interface ManifestEntry {
  visibility: 'public' | 'internal';
  exports: string[];
}

/** A package of the manifest. */
export interface ManifestPackage {
  name: string;
  path: string;
  layer: 'model' | 'renderer' | 'validation';
  entries: Record<string, ManifestEntry>;
}

/** A support value of a feature for a runtime. */
export type SupportValue = 'pass';

/** A feature of the manifest. */
export interface ManifestFeature {
  id: string;
  owner: string;
  signature: string;
  input: string;
  output: string;
  status: 'planned' | 'partial' | 'implemented';
  state: string;
  errors: string[];
  fixtures: string[];
  tests: string[];
  docs: string[];
  support: Record<string, SupportValue>;
  verification: { id: string, command: string }[];
}

/** A registered fixture of the manifest; `export` names the export of a module that holds its cases. */
export interface ManifestFixture {
  path: string;
  kind: string;
  cases?: string[];
  export?: string;
}

/** contracts/features.json, in the shape of contracts/features.schema.json. */
export interface FeatureManifest {
  format: 'crudui/features-manifest';
  version: string;
  supportValues: SupportValue[];
  packages: ManifestPackage[];
  features: ManifestFeature[];
  examples: { id: string, input: string, expected: string }[];
  fixtures: ManifestFixture[];
}

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schema: unknown = JSON.parse(readFileSync(resolve(scriptRoot, 'contracts/features.schema.json'), 'utf8'));
/** Whether `value` is a JSON object, the shape of a JSON Schema that ajv compiles. */
const isSchemaObject = shapeOf<SchemaObject>({ type: 'object' });
if (!isSchemaObject(schema)) throw new Error('contracts/features.schema.json is no JSON object');

/** The type guard of contracts/features.schema.json; its `errors` hold the errors of the last value that it refused. */
export const isFeatureManifest = new Ajv({ allErrors: true, strict: false }).compile<FeatureManifest>(schema);

/** The errors of the last value that isFeatureManifest refused, one `<JSON Pointer> <message>` each, joined with `; `. */
export function featureManifestErrors(): string {
  return (isFeatureManifest.errors ?? []).map((error) => `${error.instancePath} ${error.message}`).join('; ');
}

/** The JSON text `text` of a feature manifest, checked; `source` names it in the Error of a manifest that breaks the schema. */
export function parseFeatureManifest(text: string, source: string): FeatureManifest {
  const manifest: unknown = JSON.parse(text);
  if (!isFeatureManifest(manifest)) throw new Error(`${source} breaks contracts/features.schema.json: ${featureManifestErrors()}`);
  return manifest;
}

/** contracts/features.json of the repository at `root`, checked. */
export function readFeatureManifest(root: string): FeatureManifest {
  return parseFeatureManifest(readFileSync(resolve(root, 'contracts/features.json'), 'utf8'), 'contracts/features.json');
}
