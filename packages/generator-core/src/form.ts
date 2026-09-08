import { composeProperties, MemoryLoader, type FileLoader } from '@crudui/validator';
import { makeTranslate, type Language } from './content';
import { buildField, type BuildState, type FieldViewModel, type UnsupportedMode } from './viewmodel';

/** A data-independent field blueprint. Repeated children are stored just once. */
export interface FormFieldTemplate {
  /** Property name relative to the parent group. */
  readonly name: string;
  /** Composed field settings without nested properties. */
  readonly spec: Readonly<Record<string, unknown>>;
  /** Nested field definitions, stored once for repeated groups. */
  readonly children: readonly FormFieldTemplate[];
}

/** JSON-serializable, immutable form structure. Safe to share between records. */
export interface FormTemplate {
  /** Template format identifier. */
  readonly kind: 'crudui/form-template';
  /** Optional root prefix for input names. */
  readonly keyPrefix?: string;
  /** Top-level field definitions. */
  readonly fields: readonly FormFieldTemplate[];
}

/** Composition inputs used only when preparing a template. */
export interface CompileFormOptions {
  /** Documents available to composition references. */
  files?: Record<string, Record<string, unknown>>;
  /** Composition document loader. */
  loader?: FileLoader;
  /** Directory used to resolve relative references. */
  basepath?: string;
  /** Root prefix for input names. */
  keyPrefix?: string;
}

/** Per-instance data and presentation; never stored in the shared template. */
export interface BindFormOptions {
  /** Stable DOM identifier prefix; use distinct values for forms in one document. */
  idPrefix?: string;
  /** Content language, defaulting to Korean. */
  language?: Language;
  /** Instance input prefix overriding the template prefix. */
  keyPrefix?: string;
  /** Unsupported widget handling. */
  unsupported?: UnsupportedMode;
}

/** Copy JSON-shaped values, retaining browser File/Blob and other opaque values. */
export function copyFormValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copyFormValue) as T;
  if (value && typeof value === 'object' &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copyFormValue(v)])) as T;
  }
  return value;
}

function freezeTree<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

function compileFields(properties: Record<string, unknown>): FormFieldTemplate[] {
  return Object.entries(properties).flatMap(([name, raw]) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const { properties: children, ...spec } = raw as Record<string, unknown>;
    return [{
      name,
      spec,
      children: children && typeof children === 'object' && !Array.isArray(children)
        ? compileFields(children as Record<string, unknown>) : [],
    }];
  });
}

/** Compose and prepare the entire form before any record data exists. */
export function compileForm(
  rootSpec: Record<string, unknown>,
  options: CompileFormOptions = {}
): FormTemplate {
  if (rootSpec.type !== 'group' || !rootSpec.properties ||
      typeof rootSpec.properties !== 'object' || Array.isArray(rootSpec.properties)) {
    throw new TypeError('A form spec must be a group with properties');
  }
  const properties = composeProperties(
    (rootSpec.properties as Record<string, unknown>) ?? {},
    options.loader ?? new MemoryLoader(options.files ?? {}),
    options.basepath ? { basepath: options.basepath } : {}
  );
  return freezeTree({
    kind: 'crudui/form-template' as const,
    keyPrefix: options.keyPrefix,
    fields: compileFields(copyFormValue(properties)),
  });
}

/** Bind fresh data to a cached structure. No loader, composition or template mutation. */
export function bindForm(
  template: FormTemplate,
  data: Record<string, unknown> = {},
  options: BindFormOptions = {}
): FieldViewModel[] {
  if (template.kind !== 'crudui/form-template') throw new TypeError('Unsupported form template');
  const state: BuildState = {
    data,
    idPrefix: options.idPrefix ?? 'crudui',
    t: makeTranslate(options.language ?? 'ko'),
    keyPrefix: options.keyPrefix ?? template.keyPrefix,
    unsupported: options.unsupported ?? 'throw',
  };
  return template.fields.map(field => buildField(field.spec, field.name, state, field.children));
}
