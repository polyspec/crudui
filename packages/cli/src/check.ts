/**
 * `crudui check` — meta-schema validation + forbidden-scan + leaf-type catalog.
 *
 * Three checks use the registered schema and widget catalog directly:
 *   1. ajv against schema/crudui.schema.json (additionalProperties:false →
 *      rejects non-first-class keys, unregistered slot keys, ForbiddenKeyNames).
 *   2. scanForbiddenKeys (validator-ts/CRUDUI/forbidden-scan.ts) — the runtime
 *      backstop that the meta-schema mirrors, walked to arbitrary depth.
 *   3. leaf-type catalog — compose the spec, walk the field tree, and reject any
 *      LEAF field (no `properties`) whose `type` is not a registered widget kind
 *      (generator-core WIDGET_KINDS). The meta-schema models `Field.type` as an
 *      unconstrained string and the forbidden-scan only bounds KEY names — so an
 *      invented leaf type (`type: checkbox`) passes checks 1 and 2. Check 3
 *      enforces the rule "pick a type from describe's
 *      catalog". Container fields (those that own `properties`) are exempt — per
 *      SPEC §3, `properties` marks a group/container, not a leaf widget.
 *
 * Checks 1 and 2 remain type-agnostic. Check 3 runs in
 * the CLI (orchestrator) layer ONLY and reads the live registry, so a widget
 * added to generator-core is admitted with zero edits here (drift 0).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname } from 'node:path';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';

import { scanForbiddenKeys } from '../../validator-ts/src/forbidden-scan.ts';
import { composeSpec, MemoryLoader } from '../../validator-ts/src/compose/index.ts';
// Live widget registry (drift 0): the same key set `describe`/`list-widgets`
// surface. Imported, never re-declared as a static enum.
import { WIDGET_KINDS } from '../../generator-core/src/widget.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const SCHEMA_PATH = resolve(REPO_ROOT, 'schema/crudui.schema.json');

export interface CheckError {
  path: string;
  key?: string;
  reason: string;
}

export interface CheckResult {
  ok: boolean;
  errors: CheckError[];
}

function loadSpec(file: string): unknown {
  const raw = readFileSync(file, 'utf-8');
  const ext = extname(file).toLowerCase();
  if (ext === '.json') return JSON.parse(raw);
  return yaml.load(raw);
}

/** A field node is a record (object, not array). */
function isFieldNode(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** A field is a CONTAINER when it owns a `properties` map (SPEC §3). */
function isContainer(field: Record<string, unknown>): boolean {
  return isFieldNode(field.properties);
}

const REGISTERED_KINDS = new Set(WIDGET_KINDS);

/**
 * Walk the field tree and collect every LEAF field whose `type` is not a
 * registered widget kind. Containers (those that own `properties`) are not
 * leaf-checked — only descended into. The root spec is itself a container
 * (`type: group, properties: {…}`) so it is exempt for the same reason.
 *
 * A field with no `type` is left to the meta-schema (`required: type`); this
 * catalog check only compares a present `type` with registered kinds.
 */
function catalogErrors(field: Record<string, unknown>, path: string): CheckError[] {
  const out: CheckError[] = [];

  if (isContainer(field)) {
    const props = field.properties as Record<string, unknown>;
    for (const childName of Object.keys(props)) {
      // composition directives are not fields; the compose pass already removed
      // resolved ones, but a literal `$ref`/`$patch` key is never a child field.
      if (childName === '$ref' || childName === '$patch') continue;
      const child = props[childName];
      if (isFieldNode(child)) {
        out.push(...catalogErrors(child, path ? `${path}.${childName}` : childName));
      }
    }
    return out;
  }

  // Leaf field — its `type` value must be a registered widget kind.
  const type = field.type;
  if (typeof type === 'string' && !REGISTERED_KINDS.has(type.toLowerCase())) {
    out.push({
      path: path || '/',
      key: type,
      reason: `unregistered leaf type: "${type}" is not a known widget kind (see \`crudui describe\`)`,
    });
  }
  return out;
}

export async function runCheck(file: string | undefined): Promise<CheckResult> {
  if (!file) {
    return { ok: false, errors: [{ path: '', reason: 'no spec path given' }] };
  }

  let spec: unknown;
  try {
    spec = loadSpec(file);
  } catch (e) {
    return { ok: false, errors: [{ path: file, reason: `parse failed: ${(e as Error).message}` }] };
  }

  // Check 1 — meta-schema (ajv). strict:false: the schema carries $comment and
  // descriptive metadata the strict mode would flag; the constraints are intact.
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(spec);

  const errors: CheckError[] = [];
  if (!valid) {
    for (const err of validate.errors ?? []) {
      const key =
        err.keyword === 'additionalProperties'
          ? (err.params as { additionalProperty?: string }).additionalProperty
          : undefined;
      errors.push({
        path: err.instancePath || '/',
        ...(key ? { key } : {}),
        reason: `${err.keyword}: ${err.message ?? ''}`.trim(),
      });
    }
  }

  // Check 2 — runtime forbidden-scan used by the validators.
  try {
    scanForbiddenKeys(spec);
  } catch (e) {
    const err = e as { message?: string; trace?: string[] };
    errors.push({
      path: (err.trace ?? []).join('.') || '/',
      key: (err.trace ?? []).slice(-1)[0],
      reason: err.message ?? 'forbidden meta key',
    });
  }

  // Compose before checking widget types. An unresolved reference fails the check.
  if (isFieldNode(spec)) {
    try {
      const tree = composeSpec(spec, new MemoryLoader({}));
      errors.push(...catalogErrors(tree, ''));
    } catch (error) {
      errors.push({ path: '/', reason: `composition failed: ${(error as Error).message}` });
    }
  }

  return { ok: errors.length === 0, errors };
}
