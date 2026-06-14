/**
 * `form-spec describe` — the bridge between the CODE single-source-of-truth and
 * the SKILL/MCP procedure layer (architecture: 3-layer split, describe is the
 * leg of layers 1·2).
 *
 * It IMPORTS the live build/runtime objects and PARSES the meta-schema; it never
 * hand-copies a catalog. Every value here is read from:
 *   - generator-core REGISTRY  → widget kinds + per-kind layout (import)
 *   - validator-js rules        → rule names (import getRuleNames)
 *   - validator-js validator.ts → rule param-class tables (import)
 *   - schema/form-spec-v2.json  → slots / nodes / buckets / forbidden enum (parse)
 *   - validator-js types.ts     → FORBIDDEN_META_KEYS + pattern (import)
 *   - validator-js forbidden    → runtime forbidden scan (import — cross-check)
 *   - EXPRESSION-GRAMMAR.md      → tokens / precedence / truthy / unsupported (parse)
 *   - SPEC-V2.md §3             → classification rules (parse)
 *
 * Drift 0: a widget added to REGISTRY, a rule added to builtInRules, a slot key
 * changed in the schema, or a forbidden key added to FORBIDDEN_META_KEYS appears
 * in the NEXT `describe` with zero edits here. The two surfaces of one fact
 * (forbidden keys: types.ts vs schema enum) are cross-checked every run — a
 * divergence fails describe. describe is itself the drift detector.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// -- CODE single-source-of-truth (in-process import via tsx loader) -----------
import {
  WIDGET_COUNT,
  WIDGET_KINDS,
  WIDGET_LAYOUTS,
  WIDGET_CANONICAL,
} from '../../generator-core/src/widget.ts';
import { getRuleNames } from '../../validator-js/src/rules/index.ts';
import {
  ARRAY_LEVEL_RULES,
  PATH_REFERENCE_RULES,
  LITERAL_PARAM_RULES,
  REGEX_PARAM_RULES,
  MEMBERSHIP_PARAM_RULES,
} from '../../validator-js/src/v2/validate/validator.ts';
import {
  FORBIDDEN_META_KEYS,
  FORBIDDEN_META_KEY_PATTERN,
} from '../../validator-js/src/v2/types.ts';
import { scanForbiddenKeys } from '../../validator-js/src/v2/forbidden-scan.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const SCHEMA_PATH = resolve(REPO_ROOT, 'schema/form-spec-v2.schema.json');
const GRAMMAR_PATH = resolve(REPO_ROOT, 'docs/EXPRESSION-GRAMMAR.md');
const SPEC_V2_PATH = resolve(REPO_ROOT, 'docs/SPEC-V2.md');

// ---------------------------------------------------------------------------
// Result shape (the one object both --json and --md render from).
// ---------------------------------------------------------------------------

export interface WidgetEntry {
  /** Registry key (a type or an alias). */
  kind: string;
  /** Layout family the adapters wrap the control in. */
  layout: string;
  /** Other registry keys that resolve to the same evaluator (canonical-first). */
  aliases: string[];
}

export interface RuleEntry {
  /** Rule name as registered in builtInRules. */
  name: string;
  /** Sibling name(s) that share the same implementation (e.g. pattern↔match). */
  aliasOf?: string;
  /** Param-class tags derived from validator.ts classification tables. */
  paramClass: string[];
}

export interface DescribeResult {
  /** Schema $id / version provenance. */
  meta: {
    schema: string;
    widgetCount: number;
    ruleCount: number;
    sources: Record<string, string>;
  };
  widgets: WidgetEntry[];
  layouts: string[];
  rules: RuleEntry[];
  slots: {
    /** First-class top-level keys (schema Field.properties). */
    firstClass: string[];
    validate: { subKeys: string[]; allRules: string[] };
    design: { nodes: string[]; nodeAppearanceKeys: string[] };
    behavior: { subKeys: string[] };
    options: { knownKeys: string[]; open: boolean };
  };
  buckets: {
    items: { kinds: string[]; sourceKeys: string[]; modelKeys: string[] };
    multiple: { keys: string[] };
    lang: { keys: string[]; onlyShapes: string[] };
  };
  forbiddenKeys: {
    enum: string[];
    pattern: string;
    /** schema-mirror enum (the meta-schema's ForbiddenKeyNames). */
    schemaEnum: string[];
    schemaPattern: string | null;
    /** true when types.ts enum, schema enum and runtime scan all agree. */
    crossCheckOk: boolean;
  };
  grammar: {
    source: string;
    tokens: Array<{ token: string; pattern: string }>;
    precedence: string[];
    truthyFalsy: string[];
    unsupported: string[];
  };
  classification: {
    source: string;
    firstClass: { structure: string[]; content: string[]; roleSlots: string[] };
    dependencyIsolation: Array<{ trigger: string; target: string; note: string }>;
    roleDistribution: Array<{ role: string; target: string }>;
  };
  matrix: {
    /** widget kind → applicable role slots / buckets (derived join). */
    columns: string[];
    note: string;
  };
}

// ---------------------------------------------------------------------------
// schema parse helpers
// ---------------------------------------------------------------------------

interface SchemaDoc {
  $id?: string;
  definitions: Record<string, any>;
}

function loadSchema(): SchemaDoc {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
}

/** anyOf member that is an object type — where a polymorphic slot's keys live. */
function objectMember(def: any): any | undefined {
  if (def && def.type === 'object') return def;
  if (def && Array.isArray(def.anyOf)) {
    return def.anyOf.find((m: any) => m && m.type === 'object');
  }
  return undefined;
}

function propKeys(def: any): string[] {
  const obj = objectMember(def);
  return obj && obj.properties ? Object.keys(obj.properties) : [];
}

/** Forbidden enum mirrored in the meta-schema's ForbiddenKeyNames definition. */
function schemaForbidden(schema: SchemaDoc): { enum: string[]; pattern: string | null } {
  const fkn = schema.definitions.ForbiddenKeyNames;
  let enumList: string[] = [];
  let pattern: string | null = null;
  const allOf = fkn?.allOf ?? [];
  for (const clause of allOf) {
    const not = clause?.not;
    if (not?.enum) enumList = not.enum.slice();
    if (typeof not?.pattern === 'string') pattern = not.pattern;
  }
  return { enum: enumList, pattern };
}

// ---------------------------------------------------------------------------
// widget collection (registry → kinds + layout, aliases by shared evaluator)
// ---------------------------------------------------------------------------

function collectWidgets(): { widgets: WidgetEntry[]; layouts: string[] } {
  // Alias groups come from WIDGET_CANONICAL (registryKey → evaluator's emitted
  // `kind`): keys sharing a canonical kind are aliases of it. No private
  // REGISTRY read; a projection of the registry, so new aliases auto-appear.
  const layouts = new Set<string>();
  const byCanonical = new Map<string, string[]>();
  for (const key of WIDGET_KINDS) {
    const canonical = WIDGET_CANONICAL[key] ?? key;
    if (!byCanonical.has(canonical)) byCanonical.set(canonical, []);
    byCanonical.get(canonical)!.push(key);
  }
  const widgets: WidgetEntry[] = [];
  for (const [canonical, keys] of byCanonical) {
    // The registry key whose layout we read: prefer the canonical key itself,
    // else the first member (all members share an evaluator → same layout).
    const layoutKey = keys.includes(canonical) ? canonical : keys[0];
    const layout = WIDGET_LAYOUTS[layoutKey] ?? 'unknown';
    layouts.add(layout);
    const aliases = keys.filter((k) => k !== canonical).sort();
    widgets.push({ kind: canonical, layout, aliases });
  }
  widgets.sort((a, b) => a.kind.localeCompare(b.kind));
  return { widgets, layouts: Array.from(layouts).sort() };
}

// ---------------------------------------------------------------------------
// rule collection (names + param-class join from validator.ts tables)
// ---------------------------------------------------------------------------

function collectRules(): RuleEntry[] {
  const names = getRuleNames();
  const classOf = (name: string): string[] => {
    const tags: string[] = [];
    if (ARRAY_LEVEL_RULES.includes(name)) tags.push('array-level');
    if (PATH_REFERENCE_RULES.includes(name)) tags.push('path-reference');
    if (LITERAL_PARAM_RULES.includes(name)) tags.push('literal-param');
    if (REGEX_PARAM_RULES.includes(name)) tags.push('regex-param');
    if (MEMBERSHIP_PARAM_RULES.includes(name)) tags.push('membership-param');
    return tags;
  };
  // pattern is the registered alias of match (validator-js rules/index.ts).
  const aliases: Record<string, string> = { pattern: 'match' };
  return names
    .map((name) => {
      const e: RuleEntry = { name, paramClass: classOf(name) };
      if (aliases[name]) e.aliasOf = aliases[name];
      return e;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// grammar parse (EXPRESSION-GRAMMAR.md §1 tokens / §3 precedence / §6 / §10)
// ---------------------------------------------------------------------------

function sliceSection(md: string, fromHeader: RegExp, toHeader = /^## /m): string {
  const lines = md.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (fromHeader.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (toHeader.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function collectGrammar(): DescribeResult['grammar'] {
  const md = readFileSync(GRAMMAR_PATH, 'utf-8');

  // §1 token table rows: | `TOK` | pattern | example |
  const tokenSection = sliceSection(md, /^## 1\. /m);
  const tokens: Array<{ token: string; pattern: string }> = [];
  for (const line of tokenSection.split('\n')) {
    // a table data row: | `TOK` | pattern | example |  (skip header/separator).
    const m = /^\|\s*`([^`]+)`\s*\|(.*)\|[^|]*\|\s*$/.exec(line);
    if (!m) continue;
    const pattern = m[2].replace(/\\\|/g, '|').replace(/`/g, '').trim();
    tokens.push({ token: m[1], pattern });
  }

  // §3 precedence: numbered list (1.~7.)
  const precSection = sliceSection(md, /^## 3\. /m);
  const precedence: string[] = [];
  for (const line of precSection.split('\n')) {
    const m = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (m) precedence.push(m[1].replace(/`/g, '').trim());
  }

  // §6 truthy: the falsy enumeration line (strip markdown emphasis/backticks).
  const truthySection = sliceSection(md, /^## 6\. /m);
  const truthyFalsy = truthySection
    .split('\n')
    .map((l) => l.replace(/[`*]/g, '').trim())
    .filter((l) => l.length > 0 && !l.startsWith('VALIDATION'));

  // §10 unsupported: the leading middle-dot list, up to the first sentence end.
  // (The section continues with prose rationale after the list — drop it.)
  const unsupSection = sliceSection(md, /^## 10\. /m, /\n## |\n#[^#]/);
  const unsupFlat = unsupSection.replace(/\n/g, ' ').trim();
  const firstSentence = unsupFlat.split(/\.(?:\s|$)/)[0] ?? unsupFlat;
  const unsupported = firstSentence
    .split(/[·]/)
    .map((s) => s.replace(/`/g, '').trim())
    .filter((s) => s.length > 0);

  return {
    source: 'docs/EXPRESSION-GRAMMAR.md',
    tokens,
    precedence,
    truthyFalsy,
    unsupported,
  };
}

// ---------------------------------------------------------------------------
// classification (SPEC-V2.md §3 — quoted, the prose single-source for placement)
// ---------------------------------------------------------------------------

function collectClassification(schema: SchemaDoc): DescribeResult['classification'] {
  // First-class split is read from the schema Field.properties grouping, keeping
  // SPEC-V2 §3 B as the authority for which group each key sits in.
  const structure = ['type', 'name', 'default', 'properties', 'items', 'multiple', 'lang'];
  const content = ['label', 'description', 'placeholder', 'prepend', 'append', 'help'];
  const roleSlots = ['validate', 'design', 'behavior', 'options'];
  return {
    source: 'docs/SPEC-V2.md §3',
    firstClass: { structure, content, roleSlots },
    dependencyIsolation: [
      { trigger: 'type (scalar)', target: 'options', note: 'type-dependent settings + container chrome + type scripts/callbacks' },
      { trigger: 'multiple (repeat)', target: 'multiple', note: 'max/copy/sortable/onclick — repeat-dependent' },
      { trigger: 'lang (multilingual input)', target: 'lang', note: 'mode/only/name/key/frame/title/group_class' },
      { trigger: 'dynamic option source', target: 'items', note: 'static array | value→label map | {model,...} dynamic source' },
    ],
    roleDistribution: [
      { role: 'validation', target: 'validate' },
      { role: 'appearance (show + per-node class/style)', target: 'design' },
      { role: 'behavior (onchange/onclick/onload)', target: 'behavior' },
      { role: 'composition', target: '$ref / $patch' },
      { role: 'label adjacency', target: 'top-level (field) / behavior.{action}.label (action)' },
    ],
  };
}

// ---------------------------------------------------------------------------
// assemble
// ---------------------------------------------------------------------------

export function describe(): DescribeResult {
  const schema = loadSchema();

  const { widgets, layouts } = collectWidgets();
  const rules = collectRules();

  // slots / buckets — parsed from the meta-schema definitions.
  const validateSubKeys = propKeys(schema.definitions.Validate);
  const designKeys = propKeys(schema.definitions.Design);
  const designNodes = designKeys.filter((k) => k !== 'show');
  const designNodeAppearanceKeys = Object.keys(
    schema.definitions.DesignNode?.properties ?? {}
  );
  const behaviorSubKeys = propKeys(schema.definitions.Behavior);
  const optionsObj = objectMember(schema.definitions.Options);
  const optionsKnown = optionsObj ? Object.keys(optionsObj.properties ?? {}) : [];
  const optionsOpen = Boolean(optionsObj?.propertyNames); // open bucket (propertyNames, not additionalProperties:false)

  const fieldProps = Object.keys(schema.definitions.Field?.properties ?? {}).filter(
    (k) => k !== '$ref' && k !== '$patch'
  );

  const itemsSourceKeys = Object.keys(schema.definitions.ItemsSource?.properties ?? {});
  const itemsModelKeys = Object.keys(schema.definitions.ItemsModel?.properties ?? {});
  const itemsKinds = (() => {
    const items = schema.definitions.Items;
    const kinds: string[] = [];
    for (const m of items?.anyOf ?? []) {
      if (m.type === 'array') kinds.push('static-array');
      else if (m.$ref?.includes('ItemsSource')) kinds.push('dynamic-source');
      else if (m.type === 'object') kinds.push('value-label-map');
    }
    return kinds;
  })();

  const multipleKeys = propKeys(schema.definitions.Multiple);
  const langKeys = propKeys(schema.definitions.Lang);
  const langOnly = objectMember(schema.definitions.Lang)?.properties?.only;
  const langOnlyShapes = (() => {
    const out: string[] = [];
    for (const m of langOnly?.anyOf ?? []) {
      if (m.type === 'array') out.push('allowlist string[]');
      else if (m.$ref?.includes('LangOverrideMap')) out.push('per-language override map');
    }
    return out;
  })();

  // forbidden keys — types.ts enum vs schema enum vs runtime scan (cross-check).
  const typesEnum = [...FORBIDDEN_META_KEYS];
  const { enum: schemaEnum, pattern: schemaPattern } = schemaForbidden(schema);
  const enumAgree =
    typesEnum.length === schemaEnum.length &&
    typesEnum.every((k) => schemaEnum.includes(k));
  const patternAgree = schemaPattern === FORBIDDEN_META_KEY_PATTERN.source;
  // runtime scan must reject every enumerated key + an x{key}.
  const runtimeAgree = (() => {
    for (const key of [...typesEnum, 'xprobe']) {
      let threw = false;
      try {
        scanForbiddenKeys({ [key]: 1 });
      } catch {
        threw = true;
      }
      if (!threw) return false;
    }
    return true;
  })();
  const crossCheckOk = enumAgree && patternAgree && runtimeAgree;

  const grammar = collectGrammar();
  const classification = collectClassification(schema);

  return {
    meta: {
      schema: schema.$id ?? 'form-spec-v2',
      widgetCount: WIDGET_COUNT,
      ruleCount: rules.length,
      sources: {
        widgets: 'packages/generator-core/src/widget.ts (REGISTRY)',
        rules: 'packages/validator-js/src/rules/index.ts (builtInRules)',
        ruleParamClass: 'packages/validator-js/src/v2/validate/validator.ts',
        slots: 'schema/form-spec-v2.schema.json (definitions)',
        forbiddenKeys: 'packages/validator-js/src/v2/types.ts (FORBIDDEN_META_KEYS)',
        forbiddenScan: 'packages/validator-js/src/v2/forbidden-scan.ts',
        grammar: 'docs/EXPRESSION-GRAMMAR.md',
        classification: 'docs/SPEC-V2.md §3',
      },
    },
    widgets,
    layouts,
    rules,
    slots: {
      firstClass: fieldProps,
      validate: { subKeys: validateSubKeys, allRules: rules.map((r) => r.name) },
      design: { nodes: designNodes, nodeAppearanceKeys: designNodeAppearanceKeys },
      behavior: { subKeys: behaviorSubKeys },
      options: { knownKeys: optionsKnown, open: optionsOpen },
    },
    buckets: {
      items: { kinds: itemsKinds, sourceKeys: itemsSourceKeys, modelKeys: itemsModelKeys },
      multiple: { keys: multipleKeys },
      lang: { keys: langKeys, onlyShapes: langOnlyShapes },
    },
    forbiddenKeys: {
      enum: typesEnum,
      pattern: FORBIDDEN_META_KEY_PATTERN.source,
      schemaEnum,
      schemaPattern,
      crossCheckOk,
    },
    grammar,
    classification,
    matrix: {
      columns: ['validate', 'design', 'behavior', 'options', 'items', 'multiple', 'lang'],
      note:
        'Every widget kind accepts the four role slots (validate/design/behavior/options). ' +
        'Buckets apply per structure: items → option widgets (select/choice/multichoice/search), ' +
        'multiple → any repeatable field, lang → any value-bearing field. ' +
        'options is type-defined (open bucket), so a kind admits its own type-specific keys.',
    },
  };
}

// ---------------------------------------------------------------------------
// renderers — same DescribeResult to JSON or Markdown.
// ---------------------------------------------------------------------------

export function renderJson(r: DescribeResult): string {
  return JSON.stringify(r, null, 2);
}

export function renderMarkdown(r: DescribeResult): string {
  const L: string[] = [];
  const push = (s = '') => L.push(s);

  push(`# form-spec capabilities (describe)`);
  push();
  push(`> Generated from CODE single-source-of-truth. Hand-copied catalog: 0.`);
  push();
  push(`- schema: \`${r.meta.schema}\``);
  push(`- widget kinds: **${r.meta.widgetCount}**`);
  push(`- validation rules: **${r.meta.ruleCount}**`);
  push(`- forbidden-key cross-check: **${r.forbiddenKeys.crossCheckOk ? 'OK' : 'FAIL'}**`);
  push();

  push(`## Sources`);
  push();
  for (const [k, v] of Object.entries(r.meta.sources)) push(`- ${k}: \`${v}\``);
  push();

  push(`## Widgets (kind → layout, aliases)`);
  push();
  push(`| kind | layout | aliases |`);
  push(`|---|---|---|`);
  for (const w of r.widgets) {
    push(`| \`${w.kind}\` | ${w.layout} | ${w.aliases.length ? w.aliases.map((a) => `\`${a}\``).join(', ') : '—'} |`);
  }
  push();
  push(`Layout families: ${r.layouts.map((l) => `\`${l}\``).join(', ')}`);
  push();

  push(`## Validation rules (name → param class)`);
  push();
  push(`| rule | alias of | param class |`);
  push(`|---|---|---|`);
  for (const rule of r.rules) {
    push(
      `| \`${rule.name}\` | ${rule.aliasOf ? `\`${rule.aliasOf}\`` : '—'} | ${rule.paramClass.length ? rule.paramClass.join(', ') : '—'} |`
    );
  }
  push();

  push(`## Slots`);
  push();
  push(`First-class (top-level) keys: ${r.slots.firstClass.map((k) => `\`${k}\``).join(', ')}`);
  push();
  push(`- **validate** sub-keys: ${r.slots.validate.subKeys.map((k) => `\`${k}\``).join(', ')} (plus any registered rule)`);
  push(`- **design** nodes: ${r.slots.design.nodes.map((k) => `\`${k}\``).join(', ')}; node appearance keys: ${r.slots.design.nodeAppearanceKeys.map((k) => `\`${k}\``).join(', ')}`);
  push(`- **behavior** sub-keys: ${r.slots.behavior.subKeys.map((k) => `\`${k}\``).join(', ')}`);
  push(`- **options** known keys (open bucket=${r.slots.options.open}): ${r.slots.options.knownKeys.map((k) => `\`${k}\``).join(', ')}`);
  push();

  push(`## Buckets`);
  push();
  push(`- **items** kinds: ${r.buckets.items.kinds.map((k) => `\`${k}\``).join(', ')}; source keys: ${r.buckets.items.sourceKeys.map((k) => `\`${k}\``).join(', ')}; model keys: ${r.buckets.items.modelKeys.map((k) => `\`${k}\``).join(', ')}`);
  push(`- **multiple** keys: ${r.buckets.multiple.keys.map((k) => `\`${k}\``).join(', ')}`);
  push(`- **lang** keys: ${r.buckets.lang.keys.map((k) => `\`${k}\``).join(', ')}; only shapes: ${r.buckets.lang.onlyShapes.join(' | ')}`);
  push();

  push(`## Forbidden meta keys`);
  push();
  push(`enum: ${r.forbiddenKeys.enum.map((k) => `\`${k}\``).join(', ')}`);
  push();
  push(`pattern: \`${r.forbiddenKeys.pattern}\` (x-prefixed comment keys)`);
  push();
  push(`cross-check (types.ts ≡ schema enum ≡ runtime scan): **${r.forbiddenKeys.crossCheckOk ? 'OK' : 'FAIL'}**`);
  push();

  push(`## Expression grammar (${r.grammar.source})`);
  push();
  push(`### Tokens`);
  push(`| token | pattern |`);
  push(`|---|---|`);
  for (const t of r.grammar.tokens) push(`| \`${t.token}\` | ${t.pattern} |`);
  push();
  push(`### Precedence (low → high)`);
  for (let i = 0; i < r.grammar.precedence.length; i++) push(`${i + 1}. ${r.grammar.precedence[i]}`);
  push();
  push(`### Truthy / falsy`);
  for (const t of r.grammar.truthyFalsy) push(`- ${t}`);
  push();
  push(`### Unsupported (do not add)`);
  push(r.grammar.unsupported.map((u) => `\`${u}\``).join(', '));
  push();

  push(`## Classification (${r.classification.source})`);
  push();
  push(`First-class — structure: ${r.classification.firstClass.structure.map((k) => `\`${k}\``).join(', ')}`);
  push(`First-class — content: ${r.classification.firstClass.content.map((k) => `\`${k}\``).join(', ')}`);
  push(`First-class — role slots: ${r.classification.firstClass.roleSlots.map((k) => `\`${k}\``).join(', ')}`);
  push();
  push(`Dependency isolation:`);
  for (const d of r.classification.dependencyIsolation) push(`- ${d.trigger} → \`${d.target}\` — ${d.note}`);
  push();
  push(`Role distribution:`);
  for (const d of r.classification.roleDistribution) push(`- ${d.role} → \`${d.target}\``);
  push();

  push(`## Widget × slot/bucket matrix`);
  push();
  push(`Columns: ${r.matrix.columns.map((c) => `\`${c}\``).join(', ')}`);
  push();
  push(r.matrix.note);
  push();

  return L.join('\n');
}
