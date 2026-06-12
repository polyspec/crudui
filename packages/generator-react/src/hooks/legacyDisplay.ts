/**
 * legacyDisplay — pure ports of the legacy Limepie conditional-display
 * pipeline. The golden fixtures (tests/fixtures/golden-html) are the single
 * source of truth; every rule here is a verbatim port of the PHP code:
 *
 *   - minifyJs                    : \Limepie\minify_js()
 *   - applyDisplaySwitchTransform : Form\Parser\ElementVisibilityManager
 *                                   (map-form display_switch -> sibling
 *                                   class/display_target/condition maps/style
 *                                   + onchange JS on the controlling field)
 *   - resolveDisplayTargetParts   : Fields\Group::processSingleTarget +
 *                                   the displayUnique resolution in write()
 *
 * Contract pinned by the goldens (registration.html, ProductNft.html):
 *   - Legacy NEVER removes a condition-failing field from the DOM. The
 *     wrapper keeps an identifying class (<element>_<5-char token>) and is
 *     hidden with style="display: none". Do NOT "optimize" this into
 *     conditional rendering.
 *   - display_switch condition EXPRESSIONS (string form) are evaluated with
 *     the validator's ConditionParser elsewhere — never re-implement that
 *     here. This module only owns the legacy map form and presentation.
 *
 * Known deviations (recorded, not silently widened):
 *   - ElementVisibilityManager::setupInitialState appends a 'ready' JS blob;
 *     no golden fixture ever renders it, so it is not produced.
 *   - '*' display_target paths (getFixedPath) and display_targets (eq/lt/gt
 *     pairs) are not used by any fixture spec; both resolve to "no styling"
 *     here instead of crashing.
 *   - PHP iterates display_switch keys in insertion order; JS objects order
 *     integer-like keys numerically first. All fixture specs use
 *     non-numeric scriptKeys, so order is identical today.
 */

import type { CSSProperties } from 'react';
import { phpString, parseStyleString } from '../components/fields/limepieParity';

/** \Limepie\genRandomString() charset: no i/l/o/0/1 — matches the parity
 *  normalization mask `_[a-hj-km-np-z2-9]{5}` (normalize.js rule 4). */
const TOKEN_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * 32-bit FNV-1a string hash. Deterministic across processes (no Math.random,
 * no Date) — the basis for SSR/CSR-stable display tokens below.
 */
function fnv1a(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    // h *= 16777619, kept in 32-bit unsigned range
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic display token from a stable seed (the controlling field's
 * dot path). SSR and the client hydration pass derive the SAME 5-char token
 * because the seed and the hash are identical in both passes — no Math.random,
 * so no hydration mismatch and no parity non-determinism.
 *
 * Format invariant preserved: 5 chars drawn from TOKEN_CHARS, i.e. matches the
 * parity mask `_[a-hj-km-np-z2-9]{5}` (normalize.js rule 4). The token is still
 * masked by parity, so the goldens never see its literal value — only the shape
 * is contractual.
 */
export function displayTokenForSeed(seed: string): string {
  let h = fnv1a(seed);
  let token = '';
  for (let i = 0; i < 5; i++) {
    token += TOKEN_CHARS[h % TOKEN_CHARS.length];
    // advance the state so the 5 emitted chars are independent
    h = (Math.imul(h, 0x01000193) >>> 0) ^ (h >>> 13);
    h >>>= 0;
  }
  return token;
}

/**
 * @deprecated Non-deterministic — produces a fresh token each call, which
 * diverges between an SSR pass and the client hydration pass (hydration
 * mismatch) and makes parity non-deterministic. The transform now seeds tokens
 * by field path via displayTokenForSeed(); kept only for the legacy export
 * surface. Do NOT call from render paths.
 */
export function genDisplayToken(): string {
  let token = '';
  for (let i = 0; i < 5; i++) {
    token += TOKEN_CHARS[Math.floor(Math.random() * TOKEN_CHARS.length)];
  }
  return token;
}

/**
 * Port of \Limepie\minify_js(). Same regex pipeline, with PHP possessive
 * quantifiers relaxed to greedy (no behavior change for non-pathological
 * input). Inline onchange/onclick spec JS MUST pass through this before
 * being emitted — the goldens contain the minified form.
 */
export function minifyJs(input: string): string {
  if (input.trim() === '') return input;
  let out = input;
  // 1. strip comments and whitespace around string literals / input edges
  out = out.replace(
    /\s*("(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*')\s*|\s*\/\*(?!!|@cc_on)[\s\S]*?\*\/\s*|\s*(?<![:=])\/\/.*(?=[\n\r]|$)|^\s+|\s+$/g,
    '$1'
  );
  // 2. drop whitespace around punctuation outside strings/regex literals
  out = out.replace(
    /("(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|\/\*[\s\S]*?\*\/|\/(?!\/)[^\n\r]*?\/(?=[\s.,;]|[gimuy]|$))|\s*([!%&*()\-=+[\]{}|;:,.<>?/])\s*/g,
    '$1$2'
  );
  // 3. remove the last semicolon before a closing brace
  out = out.replace(/;+\}/g, '}');
  // 4. minify quoted object keys: {'foo': -> {foo:
  out = out.replace(/([{,])(')((?:\d+|[a-z_][a-z0-9_]*))\2(?=:)/gi, '$1$3');
  // 5. foo['bar'] -> foo.bar
  out = out.replace(/([a-z0-9_)\]])\[(['"])([a-z_][a-z0-9_]*)\2\]/gi, '$1.$3');
  return out;
}

/** Loose spec node — transform/resolution work on plain YAML-derived data. */
type SpecNode = Record<string, unknown>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Map-form display_switch ({ scriptKey: [element, ...] }). String/boolean
 *  forms are condition expressions owned by the validator's ConditionParser. */
export function isDisplaySwitchMap(v: unknown): v is Record<string, unknown> {
  return isPlainObject(v);
}

/** ElementVisibilityManager::generateElementClass */
function elementClassFor(element: string, token: string): string {
  return element.split('[]').join('__') + `_${token}`;
}

function switchBranches(ds: Record<string, unknown>): Array<[string, string[]]> {
  const out: Array<[string, string[]]> = [];
  for (const [scriptKey, elements] of Object.entries(ds)) {
    if (!Array.isArray(elements)) continue; // PHP: !is_array -> skip
    out.push([
      scriptKey,
      elements.map((e) => String(e).trim()).filter((e) => e !== ''),
    ]);
  }
  return out;
}

/** ElementVisibilityManager::generateOnChangeCode + generateValidationCode.
 *  Produces the UNMINIFIED source — fields minify at render time exactly
 *  like Choice.php does. */
function buildOnChangeCode(
  branches: Array<[string, string[]]>,
  token: string,
  allElementsSelector: string
): string | null {
  const jsConditions: string[] = [];
  for (const [scriptKey, elements] of branches) {
    if (elements.length === 0) continue;
    const shows = elements.map(
      (el) =>
        `$self.closest('.form-group').find('.${elementClassFor(el, token)}').show();`
    );
    const condition =
      `((this.type === 'checkbox' || this.type === 'radio')\n` +
      `    ? (this.checked && this.value == '${scriptKey}')\n` +
      `    : this.value == '${scriptKey}')`;
    jsConditions.push(`if(${condition}) { ${shows.join(' ')} }`);
  }
  if (jsConditions.length === 0) return null;

  let code = 'var $self = $(this);\n';
  code += `$self.closest('.form-group').find('${allElementsSelector}').hide();\n`;
  code += jsConditions[0];
  for (let i = 1; i < jsConditions.length; i++) {
    code += ` else ${jsConditions[i]}`;
  }
  code += ` else { $self.closest('.form-group').find('${allElementsSelector}').hide(); }`;
  // generateValidationCode (heredoc body after PHP indentation strip)
  code +=
    `if($self.closest('form').length > 0) {\n` +
    `    var elementsToCheck = $('.valid-target', $self.closest('.form-group').find('${allElementsSelector}').closest('.form-element-wrapper'));\n` +
    `    if(elementsToCheck.length > 0) {\n` +
    `        $self.closest('form').validate().checkByElements(elementsToCheck);\n` +
    `    }\n` +
    `}`;
  return code;
}

/** ElementVisibilityManager::setupVisibility applied to one properties level. */
function setupVisibilityAt(
  level: Record<string, SpecNode>,
  key: string,
  token: string
): void {
  const fields = level[key]!;
  const ds = fields.display_switch as Record<string, unknown>;
  const branches = switchBranches(ds);
  const defaultValue = fields.default ?? null;

  // mapElementsToScriptKeys — unique '.class' selectors in iteration order
  const allElementsClasses: string[] = [];
  for (const [, elements] of branches) {
    for (const el of elements) {
      const sel = '.' + elementClassFor(el, token);
      if (!allElementsClasses.includes(sel)) allElementsClasses.push(sel);
    }
  }

  // findDiffKeys — items present but absent from display_switch: always hide
  const dsKeys = Object.keys(ds);
  const items = fields.items;
  const diffKeys = isPlainObject(items)
    ? Object.keys(items).filter((k) => !dsKeys.includes(k))
    : [];

  // setupElementDisplay
  for (const [scriptKey, elements] of branches) {
    for (const el of elements) {
      const sibling = level[el];
      if (!sibling) continue; // legacy fabricates a typeless entry and crashes
      const cls = elementClassFor(el, token);

      // class (explode/array_unique/implode — leading '' survives, trimmed
      // later by the wrapper builder, same as PHP trim() in Group::write)
      const existingClasses = String((sibling.class as string) ?? '').split(' ');
      if (!existingClasses.includes(cls)) existingClasses.push(cls);
      sibling.class = [...new Set(existingClasses)].join(' ');

      sibling.display_target = '.' + key;
      sibling.display_target_condition_class = {};

      // setupElementConditionStyles
      if (!isPlainObject(sibling.display_target_condition_style)) {
        const init: Record<string, string> = {};
        for (const dk of diffKeys) init[dk] = 'display: none;';
        sibling.display_target_condition_style = init;
      }
      const styleMap = sibling.display_target_condition_style as Record<string, string>;
      styleMap[scriptKey] = 'display: block';
      for (const otherKey of dsKeys) {
        if (otherKey !== scriptKey && styleMap[otherKey] !== 'display: block') {
          styleMap[otherKey] = 'display: none';
        }
      }

      // setInitialElementStyle
      const existingStyles = String((sibling.style as string) ?? '').split(';');
      const defStr =
        defaultValue !== null && defaultValue !== undefined ? phpString(defaultValue) : null;
      if (defStr !== null && styleMap[defStr] !== undefined) {
        if (styleMap[defStr]!.includes('display: none')) {
          existingStyles.push('display: none');
        }
      } else {
        existingStyles.push('display: none');
      }
      sibling.style = [...new Set(existingStyles)]
        .filter((s) => s !== '' && s !== '0') // PHP array_filter default
        .join('; ');
    }
  }

  // setupOnChangeHandler — overwrites any spec-authored onchange (PHP does)
  const code = buildOnChangeCode(branches, token, allElementsClasses.join(', '));
  if (code !== null) fields.onchange = code;
  // setupInitialState ('ready') intentionally not produced — see header.
}

/**
 * Recursive Parser/DisplayScriptManager pass over every `properties` level.
 * Returns a DEEP CLONE — never mutates the caller's spec (React prop purity).
 *
 * The identifying token per controlling field is derived from that field's dot
 * path (displayTokenForSeed), NOT Math.random — so SSR and the client
 * hydration pass produce byte-identical class tokens. The result is still
 * memoized per spec instance, but no longer for determinism reasons: a fresh
 * transform of the same spec now yields the same tokens.
 */
export function applyDisplaySwitchTransform<T>(spec: T): T {
  const clone = JSON.parse(JSON.stringify(spec)) as T & SpecNode;

  const walkLevel = (level: Record<string, SpecNode>, parentPath: string): void => {
    for (const [childKey, value] of Object.entries(level)) {
      if (isPlainObject(value) && isPlainObject(value.properties)) {
        const childPath = parentPath ? `${parentPath}.${childKey}` : childKey;
        walkLevel(value.properties as Record<string, SpecNode>, childPath);
      }
    }
    for (const key of Object.keys(level)) {
      const fs = level[key];
      if (isPlainObject(fs) && isDisplaySwitchMap(fs.display_switch)) {
        const fieldPath = parentPath ? `${parentPath}.${key}` : key;
        setupVisibilityAt(level, key, displayTokenForSeed(fieldPath));
      }
    }
  };

  if (isPlainObject(clone.properties)) {
    walkLevel(clone.properties as Record<string, SpecNode>, '');
  }
  return clone;
}

// ---------------------------------------------------------------------------
// display_target wrapper presentation (Fields\Group::processSingleTarget)
// ---------------------------------------------------------------------------

const ROW_KEY_SEGMENT = /^__[^_]{12,14}__$/;

/** Fields\Group::resolveRelativePath — '.x' = sibling scope, '..x' = one up. */
export function resolveRelativePath(targetPath: string, currentPath: string): string {
  if (!targetPath.startsWith('.')) return targetPath;
  const cleanPath = targetPath.replace(/^\.+/, '');
  const levelsUp = targetPath.length - cleanPath.length;
  const pathParts = currentPath.split('.'); // explode('.','') === ['']
  const kept = pathParts.slice(0, pathParts.length - (levelsUp - 1));
  if (kept.filter((p) => p !== '').length === 0) return cleanPath;
  return kept.join('.') + '.' + cleanPath;
}

/** Fields::getValueByDot — strict key-exists walk, null when missing. */
function getValueByDot(data: unknown, key: string): unknown {
  let value: unknown = data;
  for (const id of key.split('.')) {
    if (isPlainObject(value) && id in value) {
      value = value[id];
    } else if (Array.isArray(value) && id in value) {
      value = (value as unknown[])[Number(id)];
    } else {
      return null;
    }
  }
  return value;
}

/** Fields::getDefaultByDot — spec walk skipping row-key/'*' segments.
 *  Legacy throws on unknown keys; render-side stays lenient (null). */
function getDefaultByDot(rootSpec: SpecNode, key: string): unknown {
  let property: SpecNode = rootSpec;
  for (const id of key.split('.')) {
    if (ROW_KEY_SEGMENT.test(id) || id === '*') continue;
    const props = property.properties;
    if (!isPlainObject(props)) return null;
    const next = (props[id] ?? props[id + '[]']) as SpecNode | undefined;
    if (!isPlainObject(next)) return null;
    property = next;
  }
  return property.default ?? null;
}

export interface DisplayTargetParts {
  /** display_target_condition_class match — appended to the wrapper class. */
  addClass: string[];
  /** Resolved displayUnique style (trimmed of ';'), null when no match. */
  style: string | null;
}

/**
 * Port of processSingleTarget + the displayUnique resolution in
 * Group::write (single entry -> that style; the multi-entry 'display: none;'
 * arm needs display_targets, which no fixture uses).
 *
 * parentDotPath = the legacy $elementDotName: the dot path of the PARENT
 * group ('' for top-level fields), NOT including the field's own key.
 */
export function resolveDisplayTargetParts(
  fieldSpec: SpecNode,
  parentDotPath: string,
  data: unknown,
  rootSpec: SpecNode
): DisplayTargetParts {
  const none: DisplayTargetParts = { addClass: [], style: null };
  const dt = fieldSpec.display_target;
  if (typeof dt !== 'string' || dt === '') return none;
  if (dt.includes('*')) return none; // getFixedPath — unused by fixtures

  const target = resolveRelativePath(dt, parentDotPath);

  let targetValue: unknown = getValueByDot(data, target);
  if (phpString(targetValue).length === 0) {
    targetValue = getDefaultByDot(rootSpec, target);
  }
  if (phpString(targetValue).length === 0) return none;

  const lookupKey = phpString(targetValue);
  const result: DisplayTargetParts = { addClass: [], style: null };

  const styleMap = fieldSpec.display_target_condition_style;
  if (isPlainObject(styleMap) && styleMap[lookupKey] !== undefined) {
    // PHP trim($style, ';') — an all-';' style degenerates to "no style"
    result.style = String(styleMap[lookupKey]).replace(/^;+|;+$/g, '') || null;
  }
  const classMap = fieldSpec.display_target_condition_class;
  if (isPlainObject(classMap) && classMap[lookupKey] !== undefined) {
    const cls = String(classMap[lookupKey]).trim();
    if (cls !== '') result.addClass.push(cls);
  }
  return result;
}

/** True when the spec carries legacy condition maps — presentation is then
 *  owned by resolveDisplayTargetParts, and the truthy-target visibility
 *  semantics (validator extension) must NOT also apply. */
export function hasDisplayTargetConditionMaps(fieldSpec: SpecNode): boolean {
  return (
    fieldSpec.display_target_condition_style !== undefined ||
    fieldSpec.display_target_condition_class !== undefined
  );
}

// ---------------------------------------------------------------------------
// wrapper class/style assembly (Group::write addClass/addStyle ordering)
// ---------------------------------------------------------------------------

/**
 * form-element-wrapper class chain: base, spec.class (trimmed — NOT
 * wrapper_class, which belongs to .input-group-wrapper), element.all_of
 * class, then display_target_condition_class matches. Order is part of the
 * golden contract.
 */
export function legacyWrapperClassName(
  spec: SpecNode,
  allOfClassName: string | null | undefined,
  condition: DisplayTargetParts | null
): string {
  const classes = ['form-element-wrapper'];
  if (spec.class) classes.push(String(spec.class).trim());
  if (allOfClassName) classes.push(allOfClassName);
  if (condition) classes.push(...condition.addClass);
  return classes.filter((c) => c !== '').join(' ');
}

/**
 * form-element-wrapper style chain: spec.style, element.all_of inline,
 * displayUnique (display_target_condition_style match), then the React
 * string-display_switch hidden flag — legacy never removes a hidden field
 * from the DOM, so invisibility renders as display:none here.
 *
 * Same-property duplicates collapse last-wins (React style object); PHP
 * would emit both declarations. No golden fixture produces a conflict.
 */
export function legacyWrapperStyle(
  spec: SpecNode,
  allOfStyle: string | null | undefined,
  condition: DisplayTargetParts | null,
  hidden = false
): CSSProperties | undefined {
  const parts: string[] = [];
  const specStyle = spec.style;
  if (typeof specStyle === 'string' && specStyle.trim() !== '') {
    parts.push(specStyle.replace(/^;+|;+$/g, '')); // PHP trim($style, ';')
  }
  if (allOfStyle) parts.push(allOfStyle);
  if (condition?.style) parts.push(condition.style);
  if (hidden) parts.push('display: none');
  if (parts.length === 0) return undefined;
  return parseStyleString(parts.join('; '));
}
