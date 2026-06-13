/**
 * legacyDisplay — pure ports of the legacy Legacy conditional-display
 * pipeline (framework-independent port of generator-react). The reference
 * fixtures are the single source of truth; every rule is a verbatim port of
 * the PHP code:
 *   - minifyJs                    : \Legacy\minify_js()
 *   - applyDisplaySwitchTransform : Form\Parser\ElementVisibilityManager
 *   - resolveDisplayTargetParts   : Fields\Group::processSingleTarget
 *
 * Contract pinned by the references (registration.html, LargeForm.html):
 *   - Legacy NEVER removes a condition-failing field from the DOM (kept with
 *     an identifying class and style="display: none").
 *   - display_switch condition EXPRESSIONS (string form) are evaluated by the
 *     validator's ConditionParser elsewhere — never re-implemented here.
 */

import { phpString } from '../legacyParity';

const TOKEN_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

function fnv1a(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function displayTokenForSeed(seed: string): string {
  let h = fnv1a(seed);
  let token = '';
  for (let i = 0; i < 5; i++) {
    token += TOKEN_CHARS[h % TOKEN_CHARS.length];
    h = (Math.imul(h, 0x01000193) >>> 0) ^ (h >>> 13);
    h >>>= 0;
  }
  return token;
}

/** Port of \Legacy\minify_js(). */
export function minifyJs(input: string): string {
  if (input.trim() === '') return input;
  let out = input;
  out = out.replace(
    /\s*("(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*')\s*|\s*\/\*(?!!|@cc_on)[\s\S]*?\*\/\s*|\s*(?<![:=])\/\/.*(?=[\n\r]|$)|^\s+|\s+$/g,
    '$1'
  );
  out = out.replace(
    /("(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|\/\*[\s\S]*?\*\/|\/(?!\/)[^\n\r]*?\/(?=[\s.,;]|[gimuy]|$))|\s*([!%&*()\-=+[\]{}|;:,.<>?/])\s*/g,
    '$1$2'
  );
  out = out.replace(/;+\}/g, '}');
  out = out.replace(/([{,])(')((?:\d+|[a-z_][a-z0-9_]*))\2(?=:)/gi, '$1$3');
  out = out.replace(/([a-z0-9_)\]])\[(['"])([a-z_][a-z0-9_]*)\2\]/gi, '$1.$3');
  return out;
}

type SpecNode = Record<string, unknown>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function isDisplaySwitchMap(v: unknown): v is Record<string, unknown> {
  return isPlainObject(v);
}

function elementClassFor(element: string, token: string): string {
  return element.split('[]').join('__') + `_${token}`;
}

function switchBranches(ds: Record<string, unknown>): Array<[string, string[]]> {
  const out: Array<[string, string[]]> = [];
  for (const [scriptKey, elements] of Object.entries(ds)) {
    if (!Array.isArray(elements)) continue;
    out.push([
      scriptKey,
      elements.map((e) => String(e).trim()).filter((e) => e !== ''),
    ]);
  }
  return out;
}

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
  code +=
    `if($self.closest('form').length > 0) {\n` +
    `    var elementsToCheck = $('.valid-target', $self.closest('.form-group').find('${allElementsSelector}').closest('.form-element-wrapper'));\n` +
    `    if(elementsToCheck.length > 0) {\n` +
    `        $self.closest('form').validate().checkByElements(elementsToCheck);\n` +
    `    }\n` +
    `}`;
  return code;
}

function setupVisibilityAt(
  level: Record<string, SpecNode>,
  key: string,
  token: string
): void {
  const fields = level[key]!;
  const ds = fields.display_switch as Record<string, unknown>;
  const branches = switchBranches(ds);
  const defaultValue = fields.default ?? null;

  const allElementsClasses: string[] = [];
  for (const [, elements] of branches) {
    for (const el of elements) {
      const sel = '.' + elementClassFor(el, token);
      if (!allElementsClasses.includes(sel)) allElementsClasses.push(sel);
    }
  }

  const dsKeys = Object.keys(ds);
  const items = fields.items;
  const diffKeys = isPlainObject(items)
    ? Object.keys(items).filter((k) => !dsKeys.includes(k))
    : [];

  for (const [scriptKey, elements] of branches) {
    for (const el of elements) {
      const sibling = level[el];
      if (!sibling) continue;
      const cls = elementClassFor(el, token);

      const existingClasses = String((sibling.class as string) ?? '').split(' ');
      if (!existingClasses.includes(cls)) existingClasses.push(cls);
      sibling.class = [...new Set(existingClasses)].join(' ');

      sibling.display_target = '.' + key;
      sibling.display_target_condition_class = {};

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
        .filter((s) => s !== '' && s !== '0')
        .join('; ');
    }
  }

  const code = buildOnChangeCode(branches, token, allElementsClasses.join(', '));
  if (code !== null) fields.onchange = code;
}

/** Recursive pass over every `properties` level. Returns a DEEP CLONE. */
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

export function resolveRelativePath(targetPath: string, currentPath: string): string {
  if (!targetPath.startsWith('.')) return targetPath;
  const cleanPath = targetPath.replace(/^\.+/, '');
  const levelsUp = targetPath.length - cleanPath.length;
  const pathParts = currentPath.split('.');
  const kept = pathParts.slice(0, pathParts.length - (levelsUp - 1));
  if (kept.filter((p) => p !== '').length === 0) return cleanPath;
  return kept.join('.') + '.' + cleanPath;
}

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
  addClass: string[];
  style: string | null;
}

export function resolveDisplayTargetParts(
  fieldSpec: SpecNode,
  parentDotPath: string,
  data: unknown,
  rootSpec: SpecNode
): DisplayTargetParts {
  const none: DisplayTargetParts = { addClass: [], style: null };
  const dt = fieldSpec.display_target;
  if (typeof dt !== 'string' || dt === '') return none;
  if (dt.includes('*')) return none;

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
    result.style = String(styleMap[lookupKey]).replace(/^;+|;+$/g, '') || null;
  }
  const classMap = fieldSpec.display_target_condition_class;
  if (isPlainObject(classMap) && classMap[lookupKey] !== undefined) {
    const cls = String(classMap[lookupKey]).trim();
    if (cls !== '') result.addClass.push(cls);
  }
  return result;
}

export function hasDisplayTargetConditionMaps(fieldSpec: SpecNode): boolean {
  return (
    fieldSpec.display_target_condition_style !== undefined ||
    fieldSpec.display_target_condition_class !== undefined
  );
}

// ---------------------------------------------------------------------------
// wrapper class/style assembly (Group::write addClass/addStyle ordering)
// ---------------------------------------------------------------------------

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
 * form-element-wrapper style chain — returns a canonical style STRING (or
 * undefined). spec.style, all_of inline, displayUnique match, display:none.
 */
export function legacyWrapperStyle(
  spec: SpecNode,
  allOfStyle: string | null | undefined,
  condition: DisplayTargetParts | null,
  hidden = false
): string | undefined {
  const parts: string[] = [];
  const specStyle = spec.style;
  if (typeof specStyle === 'string' && specStyle.trim() !== '') {
    parts.push(specStyle.replace(/^;+|;+$/g, ''));
  }
  if (allOfStyle) parts.push(allOfStyle);
  if (condition?.style) parts.push(condition.style);
  if (hidden) parts.push('display: none');
  if (parts.length === 0) return undefined;
  return parts.join('; ');
}
