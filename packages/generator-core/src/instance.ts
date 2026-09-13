import { bindForm, copyFormValue, type BindFormOptions, type FormFieldTemplate, type FormTemplate } from './form';
import type { FieldViewModel } from './viewmodel';
import { getValueByPath, parsePathString } from './util';

/** Transport key for an existing database sequence. */
export function sequenceRowKey(sequence: string | number | bigint): string {
  if (typeof sequence === 'number' && !Number.isSafeInteger(sequence)) {
    throw new RangeError('A sequence must be a safe integer or a decimal string');
  }
  const digits = String(sequence);
  if (!/^\d{1,13}$/.test(digits)) throw new RangeError('A sequence must contain 1–13 decimal digits');
  return `__${digits.padStart(13, '0')}__`;
}

/** Generate a new row key. This is identity, never a serialization index. */
export function createRowKey(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(7));
  return `__${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').slice(0, 13)}__`;
}

/** Per-instance presentation options. */
export type CreateFormOptions = Pick<BindFormOptions, 'language' | 'keyPrefix' | 'idPrefix'>;

/** Values and insertion position for a new repeated row. */
export interface AddRowOptions {
  /** Explicit row key; omitted to generate one. */
  key?: string;
  /** Insert after this existing key; omitted to append. */
  afterKey?: string;
  /** Initial values; omitted to use field defaults. */
  value?: unknown;
}

/** Stable subscription snapshot, changed only after a successful operation. */
export interface FormSnapshot {
  /** Evaluated fields for the current data. */
  readonly fields: FieldViewModel[];
  /** Number of successful instance updates. */
  readonly revision: number;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function repeats(field: FormFieldTemplate): boolean {
  return field.spec.multiple === true || isRecord(field.spec.multiple);
}

function checkedSegments(path: string): string[] {
  const segments = parsePathString(path);
  if (!segments.length || segments.some(s => ['__proto__', 'prototype', 'constructor'].includes(s))) {
    throw new TypeError(`Invalid form path: ${path}`);
  }
  return segments;
}

function checkKey(key: string): void {
  // Dot/bracket characters are path syntax. Numeric object keys cannot retain
  // insertion order in JavaScript; normalize database sequences explicitly.
  if (!/^[A-Za-z0-9_-]+$/.test(key) || /^\d+$/.test(key) ||
      ['__proto__', 'prototype', 'constructor'].includes(key)) {
    throw new TypeError(`Invalid row key: ${key}; use sequenceRowKey for numeric ids`);
  }
}

function putAt(data: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  const [head, ...tail] = path;
  return { ...data, [head]: tail.length
    ? putAt(isRecord(data[head]) ? data[head] : {}, tail, value) : value };
}

/**
 * One editable form instance over a shared template. All row operations are
 * scoped to a collection path; no global string replacement touches siblings.
 */
export class FormInstance {
  private data: Record<string, unknown>;
  private snapshot: FormSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly options: CreateFormOptions;

  /** Shared immutable structure. */
  readonly template: FormTemplate;

  /** Create an instance with independent record data. */
  constructor(template: FormTemplate, data: Record<string, unknown> = {}, options: CreateFormOptions = {}) {
    this.template = template;
    this.options = { ...options };
    this.data = this.normalizeFields(template.fields, data);
    this.snapshot = { fields: this.build(this.data), revision: 0 };
  }

  /** Subscribe to injection, editing and row operations. Returns an unsubscribe function. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Return the current subscription snapshot. */
  getSnapshot = (): FormSnapshot => this.snapshot;

  /** Effective root prefix for submitted input names. */
  get keyPrefix(): string | undefined { return this.options.keyPrefix ?? this.template.keyPrefix; }

  /** Detached submission data, retaining keyed nested collections. */
  getData(): Record<string, unknown> { return copyFormValue(this.data); }

  /** Read a detached value relative to the data root. */
  getValue(path: string): unknown {
    checkedSegments(path);
    return copyFormValue(getValueByPath(this.data, path));
  }

  /** Replace the record after an asynchronous load or save; keep the template. */
  setData(data: Record<string, unknown>): void {
    this.commit(this.normalizeFields(this.template.fields, data));
  }

  /** Update one data path and reevaluate affected form presentation. */
  setValue(path: string, value: unknown): void {
    const segments = checkedSegments(path);
    this.commit(this.normalizeFields(this.template.fields, putAt(this.data, segments, copyFormValue(value))));
  }

  /** Insert a blank/defaulted row, or supplied row data, with one new identity. */
  addRow(path: string, options: AddRowOptions = {}): string {
    const { field, rows } = this.collection(path);
    const settings = isRecord(field.spec.multiple) ? field.spec.multiple : {};
    if (typeof settings.max === 'number' && Object.keys(rows).length >= settings.max) {
      throw new RangeError(`Maximum row count reached: ${path}`);
    }
    const key = options.key ?? this.freshKey(new Set(Object.keys(rows)));
    checkKey(key);
    if (hasOwn(rows, key)) throw new Error(`Row key already exists: ${key}`);
    const entries = Object.entries(rows);
    const at = options.afterKey === undefined ? entries.length : entries.findIndex(([k]) => k === options.afterKey) + 1;
    if (options.afterKey !== undefined && at === 0) throw new Error(`Unknown row: ${options.afterKey}`);
    entries.splice(at, 0, [key, this.normalizeRow(field, options.value, [...checkedSegments(path), key].join('.'))]);
    this.commit(putAt(this.data, checkedSegments(path), Object.fromEntries(entries)));
    return key;
  }

  /** Copy current values and give every descendant repeated row a fresh key. */
  copyRow(path: string, key: string, options: Omit<AddRowOptions, 'value'> = {}): string {
    const { field, rows } = this.collection(path);
    if (!hasOwn(rows, key)) throw new Error(`Unknown row: ${key}`);
    const value = this.copyRowValue(field, rows[key]);
    return this.addRow(path, { ...options, afterKey: options.afterKey ?? key, value });
  }

  /** Remove one row unless the minimum count would be violated. */
  removeRow(path: string, key: string): void {
    const { field, rows } = this.collection(path);
    if (!hasOwn(rows, key)) throw new Error(`Unknown row: ${key}`);
    const settings = isRecord(field.spec.multiple) ? field.spec.multiple : {};
    if (typeof settings.min === 'number' && Object.keys(rows).length <= settings.min) {
      throw new RangeError(`Minimum row count reached: ${path}`);
    }
    this.commit(putAt(this.data, checkedSegments(path),
      Object.fromEntries(Object.entries(rows).filter(([k]) => k !== key))));
  }

  /** Change order without changing row keys, values or descendant identities. */
  moveRow(path: string, key: string, toIndex: number): void {
    const { rows } = this.collection(path);
    const entries = Object.entries(rows);
    const from = entries.findIndex(([k]) => k === key);
    if (from === -1) throw new Error(`Unknown row: ${key}`);
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= entries.length) {
      throw new RangeError(`Invalid row position: ${toIndex}`);
    }
    if (from === toIndex) return;
    const [row] = entries.splice(from, 1);
    entries.splice(toIndex, 0, row);
    this.commit(putAt(this.data, checkedSegments(path), Object.fromEntries(entries)));
  }

  /** Apply a saved seq key to exactly one row. Descendant paths follow automatically. */
  rekeyRow(path: string, oldKey: string, newKey: string): void {
    const { rows } = this.collection(path);
    checkKey(newKey);
    if (!hasOwn(rows, oldKey)) throw new Error(`Unknown row: ${oldKey}`);
    if (oldKey === newKey) return;
    if (hasOwn(rows, newKey)) throw new Error(`Row key already exists: ${newKey}`);
    this.commit(putAt(this.data, checkedSegments(path),
      Object.fromEntries(Object.entries(rows).map(([key, value]) => [key === oldKey ? newKey : key, value]))));
  }

  private build(data: Record<string, unknown>): FieldViewModel[] {
    return bindForm(this.template, data, this.options);
  }

  private commit(data: Record<string, unknown>): void {
    const fields = this.build(data); // Failure leaves both data and view unchanged.
    this.data = data;
    this.snapshot = { fields, revision: this.snapshot.revision + 1 };
    for (const listener of this.listeners) listener();
  }

  private freshKey(used: Set<string>): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      const key = createRowKey();
      checkKey(key);
      if (!used.has(key)) return key;
    }
    throw new Error('Unable to generate an unused row key');
  }

  /** Normalize record data; `path` is the full data path, empty at the root. */
  private normalizeFields(fields: readonly FormFieldTemplate[], value: unknown, path = ''): Record<string, unknown> {
    if (value !== undefined && !isRecord(value)) {
      throw new TypeError(path ? `Group data must be an object: ${path}` : 'Form data must be an object');
    }
    const data = value === undefined ? {} : copyFormValue(value as Record<string, unknown>);
    for (const field of fields) {
      const raw = data[field.name];
      const fieldPath = path ? `${path}.${field.name}` : field.name;
      if (repeats(field)) {
        const rows: Record<string, unknown> = {};
        // Missing data creates one usable prototype. Explicit {} means zero rows.
        if (raw !== undefined && !isRecord(raw)) throw new TypeError(`Repeated data must be a keyed object: ${fieldPath}`);
        const entries = raw === undefined ? [[this.freshKey(new Set()), undefined] as const]
          : Object.entries(raw as Record<string, unknown>);
        for (const [key, row] of entries) {
          checkKey(key);
          if (hasOwn(rows, key)) throw new Error(`Duplicate normalized row key: ${key}`);
          rows[key] = this.normalizeRow(field, row, `${fieldPath}.${key}`);
        }
        data[field.name] = rows;
      } else if (field.spec.type === 'group') {
        data[field.name] = this.normalizeFields(field.children, raw, fieldPath);
      } else if (raw === undefined && field.spec.default !== undefined) {
        data[field.name] = copyFormValue(field.spec.default);
      }
    }
    return data;
  }

  private normalizeRow(field: FormFieldTemplate, value: unknown, path: string): unknown {
    return field.spec.type === 'group' ? this.normalizeFields(field.children, value, path)
      : copyFormValue(value === undefined ? field.spec.default ?? '' : value);
  }

  private copyRowValue(field: FormFieldTemplate, value: unknown): unknown {
    if (field.spec.type !== 'group') return copyFormValue(value);
    const row = isRecord(value) ? copyFormValue(value) : {};
    return this.copyChildren(field.children, row);
  }

  private copyChildren(fields: readonly FormFieldTemplate[], value: Record<string, unknown>): Record<string, unknown> {
    const out = { ...value };
    for (const child of fields) {
      const raw = out[child.name];
      if (repeats(child) && isRecord(raw)) {
        const used = new Set(Object.keys(raw));
        out[child.name] = Object.fromEntries(Object.values(raw).map(row => {
          const key = this.freshKey(used);
          used.add(key);
          return [key, this.copyRowValue(child, row)];
        }));
      } else if (child.spec.type === 'group' && isRecord(raw)) {
        out[child.name] = this.copyChildren(child.children, raw);
      }
    }
    return out;
  }

  private collection(path: string): { field: FormFieldTemplate; rows: Record<string, unknown> } {
    const segments = checkedSegments(path);
    let fields = this.template.fields;
    let field: FormFieldTemplate | undefined;
    for (let i = 0; i < segments.length; i++) {
      field = fields.find(f => f.name === segments[i]);
      if (!field) throw new Error(`Unknown collection: ${path}`);
      if (i === segments.length - 1) break;
      if (repeats(field)) i++;
      fields = field.children;
      field = undefined;
    }
    const rows = getValueByPath(this.data, path);
    if (!field || !repeats(field) || !isRecord(rows)) throw new Error(`Not a keyed collection: ${path}`);
    return { field, rows };
  }
}

/** Create an independent mutable instance from a cacheable form template. */
export function createForm(template: FormTemplate, data?: Record<string, unknown>, options?: CreateFormOptions): FormInstance {
  return new FormInstance(template, data, options);
}
