/**
 * CRUDUI content translation (G3 axis 1: author translation of CONTENT).
 *
 * `LocalizedText` (types.ts:83) is a plain string OR a per-language LangMap
 * (`{ ko, en, ja, zh }`). This is the author-translated content axis — distinct
 * from the `lang` bucket (G3 axis 2: the field VALUE is per-language, a
 * structural input dimension handled by the lang container). `t()` resolves a
 * LocalizedText to a single string for the active language.
 */

/** Supported content language codes. */
export type Language = 'ko' | 'en' | 'ja' | 'zh';

/** Author-translated content: a string or a per-language map. */
export type LocalizedText = string | Record<string, string>;

/**
 * Resolve a `LocalizedText` for `language`: plain string passes through; a
 * LangMap resolves `language`, then `en`, then `ko`, then the first key, then
 * the fallback. Matches the React/Svelte reference translator order.
 */
export function makeTranslate(language: Language) {
  return function t(text: LocalizedText | undefined | null, fallback = ''): string {
    if (text == null) return fallback;
    if (typeof text === 'string') return text;
    if (typeof text !== 'object') return fallback;
    const map = text as Record<string, string>;
    if (map[language]) return map[language]!;
    if (map.en) return map.en;
    if (map.ko) return map.ko;
    const first = Object.keys(map)[0];
    if (first && map[first]) return map[first]!;
    return fallback;
  };
}

/** Resolve content for the selected language. */
export type Translate = ReturnType<typeof makeTranslate>;
