// The JSON and YAML data that the tests of the repository read (package.json, composer.json, the cases of the fixtures, the
// workflows, the output of a command), checked against a JSON Type Definition (RFC 8927) with ajv before a test reads a
// field of it. A value that breaks its schema fails with the source and the errors of ajv.
import { readFileSync } from 'node:fs';
import { Ajv, type JTDSchemaType } from 'ajv/dist/jtd.js';

export type { JTDSchemaType } from 'ajv/dist/jtd.js';

const ajv = new Ajv();

/** `value` as T, the type that the JSON Type Definition `schema` describes; throws an Error that names `source`. */
export function checked<T>(value: unknown, schema: JTDSchemaType<T>, source: string): T {
  const validate = ajv.compile(schema);
  if (validate(value)) return value;
  throw new Error(`${source} breaks its schema: ${ajv.errorsText(validate.errors)}`);
}

/** The JSON text `text` as T, checked against `schema`; `source` names the file or command in the error. */
export function parseJson<T>(text: string, schema: JTDSchemaType<T>, source: string): T {
  const value: unknown = JSON.parse(text);
  return checked(value, schema, source);
}

/** The JSON file `file` as T, checked against `schema`. */
export function readJson<T>(file: string | URL, schema: JTDSchemaType<T>): T {
  return parseJson(readFileSync(file, 'utf8'), schema, String(file));
}

/** The fields of a package.json or composer.json that the tests read; every other field is allowed. */
export interface Manifest {
  name?: string;
  version?: string;
  type?: string;
  private?: boolean;
  packageManager?: string;
  workspaces?: string[];
  scripts?: Record<string, string>;
}

/** The JSON Type Definition of Manifest. */
export const manifestSchema: JTDSchemaType<Manifest> = {
  optionalProperties: {
    name: { type: 'string' },
    version: { type: 'string' },
    type: { type: 'string' },
    private: { type: 'boolean' },
    packageManager: { type: 'string' },
    workspaces: { elements: { type: 'string' } },
    scripts: { values: { type: 'string' } },
  },
  additionalProperties: true,
};

/** The package.json or composer.json `file`. */
export function readManifest(file: string | URL): Manifest {
  return readJson(file, manifestSchema);
}

/** The script `name` of `manifest`; throws an Error that names the script when the manifest has none. */
export function script(manifest: Manifest, name: string): string {
  const command = manifest.scripts?.[name];
  if (command === undefined) throw new Error(`the manifest ${manifest.name ?? ''} has no script ${name}`);
  return command;
}


/**
 * The render options of a complete form case that renders (tests/fixtures/form-complete/cases.json): the members of
 * FormRenderOptions of @polyspec/crudui-generator-core. A node error may carry the other members of a validation error.
 */
export interface RenderOptions {
  action?: { method?: string; url?: string; enctype?: string };
  hidden?: Record<string, string>;
  formErrors?: string[];
  errors?: Array<{ path: string; message: string }>;
}

/** The JSON Type Definition of RenderOptions. */
export const renderOptionsSchema: JTDSchemaType<RenderOptions> = {
  optionalProperties: {
    action: { optionalProperties: { method: { type: 'string' }, url: { type: 'string' }, enctype: { type: 'string' } } },
    hidden: { values: { type: 'string' } },
    formErrors: { elements: { type: 'string' } },
    errors: { elements: { properties: { path: { type: 'string' }, message: { type: 'string' } }, additionalProperties: true } },
  },
};
