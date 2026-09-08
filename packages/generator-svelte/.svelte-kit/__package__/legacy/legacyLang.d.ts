/**
 * legacyLang — render-spec port of the legacy Limepie `lang:` parser stage.
 *
 *   - applyLangAppendTransform : Form\Parser::processForm() steps 1+2 for the
 *     `lang` element option (Parser\LanguageHandler::processSingle). A field
 *     spec carrying `lang: append` expands into the original field (class
 *     += ' pb-1' when remove_lang_title) plus a sibling `<key>_langs` group
 *     with one per-language child (ko/en/ja/zh) directly AFTER the original
 *     key. `lang: <non-append>` REPLACES the key with the `<key>_langs`
 *     group (legacy processSingleLang sets only `$key.'_langs'`).
 *
 * Contract pinned by the reference (ProductNft.html):
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
 *   - Legacy resolves the group label suffix via \Limepie\__('core','언어팩')
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
/**
 * Render-spec transform: legacy Parser `lang:` expansion. Pure — clones the
 * spec; the validator keeps consuming the ORIGINAL spec (Phase B contract).
 */
export declare function applyLangAppendTransform<T>(spec: T, language?: string): T;
//# sourceMappingURL=legacyLang.d.ts.map