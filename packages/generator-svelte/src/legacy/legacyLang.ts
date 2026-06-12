/**
 * legacyLang — render-spec port of the legacy Legacy `lang:` parser stage.
 *
 *   - applyLangAppendTransform : Form\Parser::processForm() steps 1+2 for the
 *     `lang` element option (Parser\LanguageHandler::processSingle). A field
 *     spec carrying `lang: append` expands into the original field (class
 *     += ' pb-1' when remove_lang_title) plus a sibling `<key>_langs` group
 *     with one per-language child (ko/en/ja/zh) directly AFTER the original
 *     key. `lang: <non-append>` REPLACES the key with the `<key>_langs`
 *     group (legacy processSingleLang sets only `$key.'_langs'`).
 *
 * Contract pinned by the golden (LargeForm.html):
 *   - name (text, remove_lang_title): original wrapper gains pb-1; the
 *     name_langs group wrapper is `border-0 pt-0 mt-1`, inner form-group is
 *     `p-1`, has NO label/h6; each language wrapper is
 *     `border-0 pb-1 pt-0 mt-1` with an `<span class="lang-code">` prepend
 *     and no label.
 *   - content (tinymce, no remove_lang_title): content_langs keeps the
 *     `<label> - 언어팩` h6 and per-language labels (한국어/English/日本語/中文).
 *   - rules.required is dropped from the language children when no explicit
 *     `langs` map restricts them (LanguageHandler::processSingle).
 *
 * Known deviations (recorded, not silently widened):
 *   - Legacy resolves the group label suffix via \Legacy\__('core','언어팩')
 *     and per-language labels via __('core', name) against the request
 *     locale; no fixture renders a non-ko locale, so the ko translations are
 *     emitted literally (spec `lang_name` still overrides the suffix).
 *   - Di::getLanguageModels() (site-configured language set) is not a React
 *     concept; the default ko/en/ja/zh set of LanguageHandler's fallback
 *     branch is always used.
 *   - `lang` on a multiple `key[]` element (processMultiple, requires
 *     lang_key) is not expanded — no fixture uses it; the spec passes
 *     through unchanged.
 */

/** Loose spec node — the transform works on plain YAML-derived data. */
type SpecNode = Record<string, unknown>;

function isPlainObject(v: unknown): v is SpecNode {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** LanguageHandler default language set — insertion order ko, en, ja, zh. */
const LANGUAGES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'ko', name: '한국어' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中文' },
];

/** LanguageHandler::buildLanguageProperties $desiredOrder (assoc langs sort). */
const DESIRED_ORDER = ['ko', 'ja', 'en', 'zh'];

/** Properties unset from the per-language child spec (processSingle). */
const LANG_CHILD_UNSET = [
  'lang',
  'class',
  'style',
  'description',
  'default',
  'display_switch',
  'display_target',
  'display_target_condition',
  'display_target_condition_class',
  'display_target_condition_style',
] as const;

/** display_* keys copied onto the generated group (buildLanguageGroup). */
const DISPLAY_KEYS = [
  'display_target',
  'display_target_condition',
  'display_target_condition_class',
  'display_target_condition_style',
] as const;

/** arr::merge_deep subset for the assoc `langs` per-language overrides. */
function mergeDeep(base: SpecNode, override: SpecNode): SpecNode {
  const out: SpecNode = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = mergeDeep(out[k] as SpecNode, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Localized label string (PHP label[get_language()] ?? '' for arrays). */
function localizedLabel(label: unknown, language: string): string {
  if (isPlainObject(label)) {
    const v = label[language];
    return typeof v === 'string' ? v : '';
  }
  return typeof label === 'string' ? label : '';
}

/**
 * LanguageHandler::processSingle — returns the (optional) original spec and
 * the `<key>_langs` group spec. `value` must already be a private clone.
 */
function processSingleLang(
  value: SpecNode,
  language: string
): { original: SpecNode | null; langs: SpecNode } {
  const lang = String(value.lang);
  const isLangAppend = lang === 'append';
  const isRemoveLabel = Boolean(value.remove_lang_title);
  const isRemoveFrame = Boolean(value.remove_lang_frame);
  const orgClass = typeof value.class === 'string' ? value.class : '';

  let original: SpecNode | null = null;
  if (isLangAppend) {
    original = { ...value };
    if (isRemoveLabel) {
      original.class = `${orgClass} pb-1`;
    }
  }

  // Common child properties (lang/class/style/... removed; required dropped
  // when no explicit `langs` restriction).
  const appendLangProperties: SpecNode = { ...value };
  for (const k of LANG_CHILD_UNSET) delete appendLangProperties[k];
  if (isLangAppend && value.langs === undefined && isPlainObject(appendLangProperties.rules)) {
    const rules = { ...(appendLangProperties.rules as SpecNode) };
    delete rules.required;
    appendLangProperties.rules = rules;
  }
  if (isRemoveLabel) delete appendLangProperties.label;

  const label = localizedLabel(value.label, language);

  // Per-language children (buildLanguageProperties fallback branch).
  let langProperties: Record<string, SpecNode> = {};
  for (const { code, name } of LANGUAGES) {
    const props: SpecNode = {
      prepend: `<span class="lang-code" title="${name}">${code.toUpperCase()}</span>`,
    };
    if (isRemoveLabel) {
      props.class = ' border-0 pb-1 pt-0 mt-1';
    } else {
      props.label = name;
    }
    // PHP `$properties + $appendLangProperties` — left ($properties) wins.
    langProperties[code] = { ...appendLangProperties, ...props };
  }

  // Optional `langs` restriction (filterLanguageProperties).
  const langsSpec = value.langs;
  if (Array.isArray(langsSpec)) {
    const filtered: Record<string, SpecNode> = {};
    for (const code of langsSpec) {
      const k = String(code);
      const child = langProperties[k];
      if (child) filtered[k] = child;
    }
    langProperties = filtered;
  } else if (isPlainObject(langsSpec)) {
    const ordered = Object.keys(langsSpec).sort(
      (a, b) => DESIRED_ORDER.indexOf(a) - DESIRED_ORDER.indexOf(b)
    );
    const filtered: Record<string, SpecNode> = {};
    for (const k of ordered) {
      const child = langProperties[k];
      if (!child) continue;
      const override = langsSpec[k];
      if (isPlainObject(override)) {
        const base = { ...child };
        delete base.langs;
        filtered[k] = mergeDeep(base, override);
      } else {
        filtered[k] = child;
      }
    }
    langProperties = filtered;
  }

  // buildLanguageGroup.
  const languagePackName =
    typeof value.lang_name === 'string' && value.lang_name !== ''
      ? value.lang_name
      : '언어팩'; // \Legacy\__('core', '언어팩') — ko locale (see header)
  const langClass = value.class !== undefined ? ` ${String(value.class)}` : '';
  const langGroupClass =
    value.lang_group_class !== undefined ? ` ${String(value.lang_group_class)}` : '';
  const appendGroupClass = isRemoveLabel ? (isRemoveFrame ? ' p-0 border-0' : ' p-1') : '';
  const defaultClass = isLangAppend
    ? langClass.trim() + (isRemoveLabel ? ' border-0 pt-0 mt-1' : '')
    : langClass.trim();

  const group: SpecNode = {
    label: `${label} - ${languagePackName}`,
    type: 'group',
    class: defaultClass,
    group_class: langGroupClass.trim() + appendGroupClass,
    properties: langProperties,
  };
  if (isLangAppend && isRemoveLabel) delete group.label;
  for (const k of DISPLAY_KEYS) {
    if (value[k] !== undefined) group[k] = value[k];
  }

  return { original, langs: group };
}

/** True for a field spec entry the legacy parser routes to processSingleLang. */
function isSingleLangSpec(key: string, value: unknown): value is SpecNode {
  return (
    isPlainObject(value) && typeof value.lang === 'string' && !/\[\]$/.test(key)
  );
}

/**
 * Parser::processForm step 1 — display_switch element lists gain the
 * `<element>_langs` sibling right after every element with lang: append.
 */
function patchDisplaySwitchLists(properties: Record<string, SpecNode>): void {
  for (const fields of Object.values(properties)) {
    if (!isPlainObject(fields) || !isPlainObject(fields.display_switch)) continue;
    const ds = { ...(fields.display_switch as Record<string, unknown>) };
    let changed = false;
    for (const [scriptKey, elements] of Object.entries(ds)) {
      if (!Array.isArray(elements)) continue;
      const next: unknown[] = [];
      for (const raw of elements) {
        const element = typeof raw === 'string' ? raw.trim() : raw;
        if (element === '' || element === undefined || element === null) continue;
        next.push(element);
        if (
          typeof element === 'string' &&
          isPlainObject(properties[element]) &&
          (properties[element] as SpecNode).lang === 'append'
        ) {
          const langElement = `${element}_langs`;
          if (!next.includes(langElement)) next.push(langElement);
        }
      }
      ds[scriptKey] = next;
      changed = true;
    }
    if (changed) fields.display_switch = ds;
  }
}

/**
 * Recursive walk — every `properties` map is rebuilt with `<key>_langs`
 * groups inserted (append) or substituted (replace) in legacy parser order.
 */
function walkNode(node: SpecNode, language: string): void {
  const properties = node.properties;
  if (!isPlainObject(properties)) return;

  const props = properties as Record<string, SpecNode>;
  patchDisplaySwitchLists(props);

  const rebuilt: Record<string, SpecNode> = {};
  for (const [key, value] of Object.entries(props)) {
    if (isSingleLangSpec(key, value)) {
      const { original, langs } = processSingleLang(value, language);
      if (original) {
        rebuilt[key] = original;
        walkNode(original, language);
      }
      rebuilt[`${key}_langs`] = langs;
      walkNode(langs, language);
    } else {
      rebuilt[key] = value;
      if (isPlainObject(value)) walkNode(value, language);
    }
  }
  node.properties = rebuilt;
}

/**
 * Render-spec transform: legacy Parser `lang:` expansion. Pure — clones the
 * spec; the validator keeps consuming the ORIGINAL spec (Phase B contract).
 */
export function applyLangAppendTransform<T>(spec: T, language = 'ko'): T {
  const clone = JSON.parse(JSON.stringify(spec)) as T & SpecNode;
  walkNode(clone, language);
  return clone;
}
