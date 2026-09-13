import { composeProperties, MemoryLoader, type FileLoader } from '@crudui/validator';
import { makeTranslate, type Language } from './content';
import { DEFAULT_FORM_BUTTONS, FORM_BUTTON_TYPES } from './buttons';
import { formMessages } from './messages';
import { buildField, type BuildState, type NodeVM, type UnsupportedMode } from './viewmodel';

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
  /** Form buttons in declaration order; one submit button when the spec declares none. */
  readonly buttons: readonly Readonly<Record<string, unknown>>[];
  /** Submission target declared by the spec, kept for the application. */
  readonly action?: Readonly<Record<string, unknown>>;
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
  /** Content and interface language, defaulting to Korean. */
  language?: Language;
  /** Instance input prefix overriding the template prefix. */
  keyPrefix?: string;
  /** Unsupported widget handling. */
  unsupported?: UnsupportedMode;
  /** Row paths (`{collection}.{key}`) rendered collapsed; omitted renders every row expanded. */
  collapsed?: ReadonlySet<string>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A string, or a condition map: a non-empty object. */
function conditionValue(value: unknown): boolean {
  return typeof value === 'string' || (isRecord(value) && Object.keys(value).length > 0);
}

/** A child that renders one scalar value: not repeated, not a group and not a language field. */
function scalarChild(child: unknown): boolean {
  if (!isRecord(child)) return false;
  const repeated = child.multiple === true || isRecord(child.multiple);
  const lang = child.lang === true || isRecord(child.lang);
  return child.type !== 'group' && !('properties' in child) && !repeated && !lang;
}

/** Reject a wrong value type in one field's `multiple`, `lang` and `design` declarations. */
function checkDeclarations(spec: Record<string, unknown>, path: string): void {
  const has = (object: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(object, key);
  const fail = (key: string, expected: string): never => {
    throw new TypeError(`Invalid ${key} at ${path}: expected ${expected}`);
  };
  // Buttons and the submission target belong to the form, not to a field.
  for (const key of ['buttons', 'action']) {
    if (has(spec, key)) fail(key, 'the form root');
  }
  if (has(spec, 'multiple')) {
    const multiple = spec.multiple;
    if (typeof multiple !== 'boolean' && !isRecord(multiple)) fail('multiple', 'a boolean or an object');
    if (isRecord(multiple)) {
      for (const key of ['min', 'max']) {
        if (has(multiple, key) && typeof multiple[key] !== 'number') fail(`multiple.${key}`, 'a number');
      }
      for (const key of ['copy', 'sortable']) {
        if (has(multiple, key) && typeof multiple[key] !== 'boolean') fail(`multiple.${key}`, 'a boolean');
      }
      if (has(multiple, 'title')) {
        if (spec.type !== 'group') fail('multiple.title', 'a repeated group');
        const properties = isRecord(spec.properties) ? spec.properties : {};
        if (typeof multiple.title !== 'string' || !has(properties, multiple.title) || !scalarChild(properties[multiple.title])) {
          fail('multiple.title', 'the name of a direct child field without multiple, properties or lang');
        }
      }
      if (has(multiple, 'controls') && !['header', 'footer', 'outline'].includes(multiple.controls as string)) {
        fail('multiple.controls', 'header, footer or outline');
      }
      if (has(multiple, 'header') && !['static', 'sticky'].includes(multiple.header as string)) {
        fail('multiple.header', 'static or sticky');
      }
    }
  }
  if (has(spec, 'lang') && typeof spec.lang !== 'boolean' && !isRecord(spec.lang)) {
    fail('lang', 'a boolean or an object');
  }
  if (isRecord(spec.lang) && has(spec.lang, 'only')) {
    const only = spec.lang.only;
    const codes = Array.isArray(only) && only.every(code => typeof code === 'string');
    if (!codes && !isRecord(only)) fail('lang.only', 'a list of language codes or an object');
  }
  if (has(spec, 'design')) {
    const design = spec.design;
    if (typeof design !== 'boolean' && !isRecord(design)) fail('design', 'a boolean or an object');
    if (isRecord(design)) {
      if (has(design, 'show') && typeof design.show !== 'boolean' && !conditionValue(design.show)) {
        fail('design.show', 'an expression, a boolean or a condition map');
      }
      for (const key of ['class', 'style']) {
        if (has(design, key) && !conditionValue(design[key])) fail(`design.${key}`, 'a string or a condition map');
      }
      for (const node of ['label', 'wrapper', 'group', 'prepend']) {
        if (!has(design, node)) continue;
        const value = design[node];
        if (!isRecord(value)) fail(`design.${node}`, 'an object');
        for (const key of ['class', 'style']) {
          if (has(value as Record<string, unknown>, key) && !conditionValue((value as Record<string, unknown>)[key])) {
            fail(`design.${node}.${key}`, 'a string or a condition map');
          }
        }
      }
    }
  }
}

/** Reject a wrong root `action` or `buttons` declaration. */
function checkFormDeclarations(spec: Record<string, unknown>): void {
  const has = (object: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(object, key);
  const fail = (key: string, expected: string): never => {
    throw new TypeError(`Invalid ${key} at form: expected ${expected}`);
  };
  if (has(spec, 'action')) {
    if (!isRecord(spec.action)) fail('action', 'an object');
    for (const key of ['method', 'url', 'enctype']) {
      if (has(spec.action as Record<string, unknown>, key) && typeof (spec.action as Record<string, unknown>)[key] !== 'string') {
        fail(`action.${key}`, 'a string');
      }
    }
  }
  if (!has(spec, 'buttons')) return;
  if (!Array.isArray(spec.buttons)) fail('buttons', 'a list of buttons');
  // A button type without interface text needs declared text.
  const texts = formMessages('ko') as unknown as Record<string, unknown>;
  (spec.buttons as unknown[]).forEach((button, index) => {
    const key = `buttons.${index}`;
    if (!isRecord(button)) fail(key, 'an object');
    const declared = button as Record<string, unknown>;
    if (!FORM_BUTTON_TYPES.includes(declared.type as never)) fail(`${key}.type`, 'submit, reset, button or link');
    for (const name of ['name', 'value', 'href']) {
      if (has(declared, name) && typeof declared[name] !== 'string') fail(`${key}.${name}`, 'a string');
    }
    if (!has(texts, declared.type as string) && !has(declared, 'text')) fail(`${key}.text`, 'content for this button type');
    if (declared.type === 'link' && !has(declared, 'href')) fail(`${key}.href`, 'a link target');
    checkDeclarations(declared, `form.${key}`);
  });
}

function compileFields(properties: Record<string, unknown>, parent = ''): FormFieldTemplate[] {
  return Object.entries(properties).flatMap(([name, raw]) => {
    if (!isRecord(raw)) return [];
    const path = parent ? `${parent}.${name}` : name;
    checkDeclarations(raw, path);
    const { properties: children, ...spec } = raw;
    return [{
      name,
      spec,
      children: isRecord(children) ? compileFields(children, path) : [],
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
  checkFormDeclarations(rootSpec);
  const properties = composeProperties(
    (rootSpec.properties as Record<string, unknown>) ?? {},
    options.loader ?? new MemoryLoader(options.files ?? {}),
    options.basepath ? { basepath: options.basepath } : {}
  );
  return freezeTree({
    kind: 'crudui/form-template' as const,
    keyPrefix: options.keyPrefix,
    fields: compileFields(copyFormValue(properties)),
    buttons: copyFormValue((rootSpec.buttons as Record<string, unknown>[] | undefined) ?? [...DEFAULT_FORM_BUTTONS]),
    ...(isRecord(rootSpec.action) ? { action: copyFormValue(rootSpec.action) } : {}),
  });
}

/** Bind fresh data to a cached structure. No loader, composition or template mutation. */
export function bindForm(
  template: FormTemplate,
  data: Record<string, unknown> = {},
  options: BindFormOptions = {}
): NodeVM[] {
  if (template.kind !== 'crudui/form-template') throw new TypeError('Unsupported form template');
  const language = options.language ?? 'ko';
  // Callers can pass decoded JSON; each text option is a string when present.
  if (typeof language !== 'string') throw new TypeError('Language must be a string');
  for (const name of ['keyPrefix', 'idPrefix'] as const) {
    const value: unknown = options[name];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      throw new TypeError(`${name} must be a string`);
    }
  }
  const unsupported: unknown = options.unsupported;
  if (unsupported !== undefined && unsupported !== null && unsupported !== 'throw' && unsupported !== 'marker') {
    throw new TypeError('unsupported must be throw or marker');
  }
  const state: BuildState = {
    data,
    idPrefix: options.idPrefix ?? 'crudui',
    t: makeTranslate(language),
    messages: formMessages(language),
    keyPrefix: options.keyPrefix ?? template.keyPrefix,
    unsupported: options.unsupported ?? 'throw',
    ...(options.collapsed ? { collapsed: options.collapsed } : {}),
  };
  return template.fields.map(field => buildField(field.spec, field.name, state, field.children));
}
