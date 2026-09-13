/**
 * `crudui explain` — spec → natural-language back-check (SKILL §1g loop exit).
 *
 * The reverse leg of the nl→CRUDUI loop: it turns a (composed) spec back into prose
 * so the author can diff the prose against the source 기획서 and catch a dropped
 * field, a misread condition, or a missing multilingual dimension. §1g makes
 * "explain ↔ 기획서 일치" the loop's TERMINATION condition; §5 lists explain as a
 * tool — so this must surface every first-class field, every condition (verbatim
 * expression), and every lang/multiple/items dimension, leaving nothing for the
 * back-check to miss.
 *
 * Invented interpretation 0. Meaning is not hand-authored here — it is read from
 * `describe()`:
 *   - type → widget meaning  (describe.widgets: kind/layout/aliases)
 *   - validate rule → phrasing (describe.rules: name + paramClass)
 *   - expression `required`/rule → "~일 때 필수" with the raw expression kept
 *   - lang / multiple / items → describe.buckets keys
 *   - design.show / behavior → describe.slots role distribution
 * A type absent from describe.widgets is reported as unknown — explain never
 * pretends to know a widget the code single-source-of-truth does not list.
 *
 * It composes FIRST (G5: `$ref`/`$patch` → single spec) via the validator's own
 * engine, so explain describes the resolved field tree, not the directives.
 */

import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

import yaml from 'js-yaml';

import { composeSpec, MemoryLoader } from '../../validator-ts/src/compose/index.ts';
import { describe, type DescribeResult, type RuleEntry } from './describe.ts';

export interface ExplainOptions {
  /** Output language for the prose. ko (default) | en. */
  lang?: 'ko' | 'en';
}

type Spec = Record<string, unknown>;

// ---------------------------------------------------------------------------
// phrasing tables — these are LANGUAGE STRINGS for the prose, not a catalog.
// The catalog (which types/rules/slots EXIST, and each rule's paramClass) is
// read from describe(); these only translate that structure into a sentence.
// ---------------------------------------------------------------------------

interface Phrases {
  field: (name: string, label: string) => string;
  unknownType: (type: string) => string;
  widgetMeaning: (kind: string, layout: string) => string;
  requiredUnconditional: string;
  requiredConditional: (expr: string) => string;
  ruleConditional: (rulePhrase: string, expr: string) => string;
  ruleNames: Record<string, string>;
  ruleByParamClass: (name: string, paramClass: string[]) => string;
  defaultValue: (v: string) => string;
  langDim: (langs: string[] | null) => string;
  multipleDim: (parts: string[]) => string;
  multipleMin: (n: number) => string;
  multipleMax: (n: number) => string;
  multipleSortable: string;
  multipleCopy: string;
  itemsStatic: (values: string[]) => string;
  itemsDynamic: (source: string) => string;
  designShow: (expr: string) => string;
  behavior: (events: string[]) => string;
  group: string;
  noFields: string;
  header: string;
}

const PHRASES_KO: Phrases = {
  header: '# 스펙 자연어 역검증 (explain)',
  field: (name, label) => (label ? `필드 \`${name}\` (${label})` : `필드 \`${name}\``),
  unknownType: (type) => `타입 \`${type}\` — 알 수 없는 위젯(describe 미등록). 발명 금지 — 확인 필요`,
  widgetMeaning: (kind, layout) => `${kind} 위젯 (${layout} 레이아웃)`,
  requiredUnconditional: '필수',
  requiredConditional: (expr) => `\`${expr}\` 일 때 필수`,
  ruleConditional: (rulePhrase, expr) => `\`${expr}\` 일 때 ${rulePhrase}`,
  ruleNames: {
    email: '이메일 형식',
    url: 'URL 형식',
    number: '숫자',
    digits: '숫자만',
    date: '날짜',
    dateISO: 'ISO 날짜',
    enddate: '종료일',
    accept: '허용 파일/값',
    in: '허용 목록 중 하나',
    match: '정규식 패턴 일치',
    pattern: '정규식 패턴 일치',
    equalTo: '다른 필드와 동일',
    notEqual: '다른 필드와 다름',
    unique: '중복 없음',
    min: '최솟값',
    max: '최댓값',
    range: '값 범위',
    step: '증가 단위',
    minlength: '최소 길이',
    maxlength: '최대 길이',
    rangelength: '길이 범위',
    mincount: '최소 개수',
    maxcount: '최대 개수',
  },
  ruleByParamClass: (name, paramClass) => {
    if (paramClass.includes('regex-param')) return `정규식 \`${name}\` 검증`;
    if (paramClass.includes('membership-param')) return `허용 목록 \`${name}\` 검증`;
    if (paramClass.includes('path-reference')) return `다른 필드 참조 \`${name}\` 검증`;
    if (paramClass.includes('array-level')) return `반복 행 \`${name}\` 검증`;
    if (paramClass.includes('literal-param')) return `\`${name}\` 검증`;
    return `\`${name}\` 검증`;
  },
  defaultValue: (v) => `기본값 ${v}`,
  langDim: (langs) =>
    langs && langs.length
      ? `다국어 입력 (${langs.join('/')} 입력란 분리)`
      : '다국어 입력',
  multipleDim: (parts) => `반복 행${parts.length ? ' — ' + parts.join(', ') : ''}`,
  multipleMin: (n) => `최소 ${n}행`,
  multipleMax: (n) => `최대 ${n}행`,
  multipleSortable: '정렬 가능',
  multipleCopy: '행 복사 가능',
  itemsStatic: (values) => `정적 선택지 (${values.join(', ')})`,
  itemsDynamic: (source) => `동적 선택지 (소스: ${source})`,
  designShow: (expr) => `\`${expr}\` 일 때 표시`,
  behavior: (events) => `동작 스크립트 (${events.join(', ')})`,
  group: '그룹 (자식 필드 구성)',
  noFields: '(필드 없음)',
};

const PHRASES_EN: Phrases = {
  header: '# Spec natural-language back-check (explain)',
  field: (name, label) => (label ? `Field \`${name}\` (${label})` : `Field \`${name}\``),
  unknownType: (type) => `type \`${type}\` — unknown widget (not in describe). Do not invent — confirm`,
  widgetMeaning: (kind, layout) => `${kind} widget (${layout} layout)`,
  requiredUnconditional: 'required',
  requiredConditional: (expr) => `required when \`${expr}\``,
  ruleConditional: (rulePhrase, expr) => `${rulePhrase} when \`${expr}\``,
  ruleNames: {
    email: 'email format',
    url: 'URL format',
    number: 'number',
    digits: 'digits only',
    date: 'date',
    dateISO: 'ISO date',
    enddate: 'end date',
    accept: 'accepted file/value',
    in: 'one of the allowed list',
    match: 'matches regex pattern',
    pattern: 'matches regex pattern',
    equalTo: 'equals another field',
    notEqual: 'differs from another field',
    unique: 'no duplicates',
    min: 'minimum value',
    max: 'maximum value',
    range: 'value range',
    step: 'step increment',
    minlength: 'minimum length',
    maxlength: 'maximum length',
    rangelength: 'length range',
    mincount: 'minimum count',
    maxcount: 'maximum count',
  },
  ruleByParamClass: (name, paramClass) => {
    if (paramClass.includes('regex-param')) return `regex \`${name}\` check`;
    if (paramClass.includes('membership-param')) return `membership \`${name}\` check`;
    if (paramClass.includes('path-reference')) return `field-reference \`${name}\` check`;
    if (paramClass.includes('array-level')) return `repeated-row \`${name}\` check`;
    if (paramClass.includes('literal-param')) return `\`${name}\` check`;
    return `\`${name}\` check`;
  },
  defaultValue: (v) => `default ${v}`,
  langDim: (langs) =>
    langs && langs.length ? `multilingual input (${langs.join('/')} fields)` : 'multilingual input',
  multipleDim: (parts) => `repeated rows${parts.length ? ' — ' + parts.join(', ') : ''}`,
  multipleMin: (n) => `at least ${n} rows`,
  multipleMax: (n) => `up to ${n} rows`,
  multipleSortable: 'sortable',
  multipleCopy: 'row copy',
  itemsStatic: (values) => `static options (${values.join(', ')})`,
  itemsDynamic: (source) => `dynamic options (source: ${source})`,
  designShow: (expr) => `shown when \`${expr}\``,
  behavior: (events) => `behavior scripts (${events.join(', ')})`,
  group: 'group (child fields)',
  noFields: '(no fields)',
};

// ---------------------------------------------------------------------------
// describe-backed lookups (the catalog — what EXISTS).
// ---------------------------------------------------------------------------

interface Catalog {
  /** registry key (kind or alias) → { canonical kind, layout }. */
  widgetByKey: Map<string, { kind: string; layout: string }>;
  ruleByName: Map<string, RuleEntry>;
  langKeys: Set<string>;
  multipleKeys: Set<string>;
}

function buildCatalog(d: DescribeResult): Catalog {
  const widgetByKey = new Map<string, { kind: string; layout: string }>();
  for (const w of d.widgets) {
    widgetByKey.set(w.kind, { kind: w.kind, layout: w.layout });
    for (const a of w.aliases) widgetByKey.set(a, { kind: w.kind, layout: w.layout });
  }
  const ruleByName = new Map<string, RuleEntry>();
  for (const r of d.rules) ruleByName.set(r.name, r);
  return {
    widgetByKey,
    ruleByName,
    langKeys: new Set(d.buckets.lang.keys),
    multipleKeys: new Set(d.buckets.multiple.keys),
  };
}

// ---------------------------------------------------------------------------
// value helpers
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Resolve a Content value (string | { ko, en, … }) for the chosen language. */
function content(v: unknown, lang: string): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (isObj(v)) {
    if (typeof v[lang] === 'string') return v[lang] as string;
    // fall back to the first string value (a translation in another language).
    for (const k of Object.keys(v)) {
      if (typeof v[k] === 'string') return v[k] as string;
    }
  }
  return '';
}

function scalarText(v: unknown): string {
  if (typeof v === 'string') return `"${v}"`;
  return JSON.stringify(v);
}

// ---------------------------------------------------------------------------
// per-slot explainers — each returns prose fragments (clauses) for one field.
// ---------------------------------------------------------------------------

/** Convert validation rules into clauses and retain each declared condition. */
function explainValidate(
  validate: unknown,
  cat: Catalog,
  p: Phrases
): string[] {
  const clauses: string[] = [];
  if (validate === true) return clauses; // `validate: true` is the empty `{}`.
  if (!isObj(validate)) return clauses;

  for (const rule of Object.keys(validate)) {
    const val = validate[rule];
    const isRequired = rule === 'required';
    const known = cat.ruleByName.get(rule);
    const phrase = isRequired
      ? p.requiredUnconditional
      : p.ruleNames[rule] ?? (known ? p.ruleByParamClass(rule, known.paramClass) : `\`${rule}\``);

    if (val === true) {
      clauses.push(phrase);
    } else if (val === false) {
      // explicitly disabled — say nothing (rule off).
      continue;
    } else if (typeof val === 'string') {
      // For `required`, a string is the gating expression (G1). For other rules
      // it is the rule's literal param (regex/path/membership/number) — keep it.
      if (isRequired) {
        clauses.push(p.requiredConditional(val));
      } else if (known && known.paramClass.length > 0) {
        clauses.push(`${phrase}: ${scalarText(val)}`);
      } else {
        // a bare expression-gated rule (conditional value as expression).
        clauses.push(p.ruleConditional(phrase, val));
      }
    } else if (typeof val === 'number') {
      clauses.push(`${phrase}: ${val}`);
    } else if (Array.isArray(val)) {
      clauses.push(`${phrase}: [${val.map((x) => scalarText(x)).join(', ')}]`);
    } else if (isObj(val)) {
      // a ConditionMap: { "<expr>": <param> } — surface each branch verbatim.
      const branches = Object.keys(val).map((expr) =>
        isRequired ? p.requiredConditional(expr) : p.ruleConditional(phrase, expr)
      );
      clauses.push(...branches);
    }
  }
  return clauses;
}

/** lang slot → one clause, with the allowed languages when `only` is present. */
function explainLang(lang: unknown, p: Phrases): string | null {
  if (lang === false) return null;
  if (lang === true) return p.langDim(null);
  if (isObj(lang)) {
    const only = lang.only;
    if (Array.isArray(only)) return p.langDim(only.map((x) => String(x)));
    if (isObj(only)) return p.langDim(Object.keys(only)); // per-language override map.
    return p.langDim(null);
  }
  return null;
}

/** multiple slot → one clause, min/max/sortable/copy surfaced. */
function explainMultiple(multiple: unknown, p: Phrases): string | null {
  if (multiple === false) return null;
  if (multiple === true) return p.multipleDim([]);
  if (isObj(multiple)) {
    const parts: string[] = [];
    if (typeof multiple.min === 'number') parts.push(p.multipleMin(multiple.min));
    if (typeof multiple.max === 'number') parts.push(p.multipleMax(multiple.max));
    if (multiple.sortable === true) parts.push(p.multipleSortable);
    if (multiple.copy === true) parts.push(p.multipleCopy);
    return p.multipleDim(parts);
  }
  return null;
}

/** items slot → one clause (static value→label / static array / dynamic source). */
function explainItems(items: unknown, lang: string, p: Phrases): string | null {
  if (Array.isArray(items)) {
    return p.itemsStatic(items.map((x) => content(x, lang) || scalarText(x)));
  }
  if (isObj(items)) {
    // dynamic source has a `model`/`api_server`/`method` descriptor.
    if ('model' in items || 'api_server' in items || 'method' in items || 'table' in items) {
      const src =
        (typeof items.model === 'string' && items.model) ||
        (typeof items.table === 'string' && items.table) ||
        (typeof items.api_server === 'string' && 'api_server') ||
        'model';
      return p.itemsDynamic(String(src));
    }
    // value→label map: keys are the values (membership), values are labels.
    const values = Object.keys(items).map((k) => {
      const label = content(items[k], lang);
      return label ? `${k}=${label}` : k;
    });
    return p.itemsStatic(values);
  }
  return null;
}

// ---------------------------------------------------------------------------
// field explainer (recursive over group `properties`)
// ---------------------------------------------------------------------------

function explainField(
  name: string,
  field: unknown,
  cat: Catalog,
  p: Phrases,
  lang: string,
  depth: number,
  lines: string[]
): void {
  if (!isObj(field)) return;

  const indent = '  '.repeat(depth);
  const label = content(field.label, lang);
  const type = typeof field.type === 'string' ? field.type : '';

  // type → widget meaning (from describe). Unknown type is reported, not guessed.
  let meaning: string;
  if (!type) {
    meaning = p.unknownType('(none)');
  } else {
    const w = cat.widgetByKey.get(type);
    meaning = w
      ? type === 'group' || (isObj(field.properties) && type !== 'group')
        ? p.group
        : p.widgetMeaning(w.kind, w.layout)
      : p.unknownType(type);
  }
  // A group is identified by its `properties`; honor that even if the registry
  // labels the kind differently.
  if (isObj(field.properties)) meaning = p.group;

  const clauses: string[] = [meaning];

  if ('default' in field) clauses.push(p.defaultValue(scalarText(field.default)));

  const validateClauses = explainValidate(field.validate, cat, p);
  clauses.push(...validateClauses);

  const itemsClause = explainItems(field.items, lang, p);
  if (itemsClause) clauses.push(itemsClause);

  const multipleClause = explainMultiple(field.multiple, p);
  if (multipleClause) clauses.push(multipleClause);

  const langClause = explainLang(field.lang, p);
  if (langClause) clauses.push(langClause);

  // design.show — visibility condition (verbatim).
  if (isObj(field.design) && field.design.show !== undefined) {
    const show = field.design.show;
    if (typeof show === 'string') clauses.push(p.designShow(show));
    else if (isObj(show)) {
      for (const expr of Object.keys(show)) clauses.push(p.designShow(expr));
    }
  }

  // behavior — opaque scripts; name the events present.
  if (isObj(field.behavior)) {
    const events = Object.keys(field.behavior);
    if (events.length) clauses.push(p.behavior(events));
  }

  lines.push(`${indent}- ${p.field(name, label)}: ${clauses.join('; ')}`);

  // recurse into children (group / multiple group).
  if (isObj(field.properties)) {
    for (const childName of Object.keys(field.properties)) {
      explainField(childName, field.properties[childName], cat, p, lang, depth + 1, lines);
    }
  }
}

// ---------------------------------------------------------------------------
// top-level
// ---------------------------------------------------------------------------

/** Explain an already-parsed spec object. Composes (G5) before walking. */
export function explainSpec(spec: Spec, opts: ExplainOptions = {}): string {
  const lang = opts.lang ?? 'ko';
  const p = lang === 'en' ? PHRASES_EN : PHRASES_KO;
  const cat = buildCatalog(describe());

  // Compose first: expand any $ref/$patch into a single spec (the field tree the
  // engine validates), so explain describes the resolved form, not directives.
  // No disk $ref here — an embedded-only spec composes against an empty loader.
  const composed = composeSpec(spec, new MemoryLoader({})) as Spec;

  const lines: string[] = [p.header, ''];

  const props = composed.properties;
  if (isObj(props) && Object.keys(props).length > 0) {
    for (const name of Object.keys(props)) {
      explainField(name, props[name], cat, p, lang, 0, lines);
    }
  } else {
    // A single top-level field (no properties wrapper).
    explainField(String(composed.name ?? composed.type ?? 'field'), composed, cat, p, lang, 0, lines);
  }

  return lines.join('\n');
}

/** CLI entry: load a spec file (yml|json) and explain it. */
export function explainFile(file: string | undefined, opts: ExplainOptions = {}): string {
  if (!file) throw new Error('no spec path given');
  const raw = readFileSync(file, 'utf-8');
  const ext = extname(file).toLowerCase();
  const spec = (ext === '.json' ? JSON.parse(raw) : yaml.load(raw)) as Spec;
  return explainSpec(spec, opts);
}
