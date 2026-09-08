/**
 * Translation helper — port of generator-react I18nContext `t`. The reference
 * fixtures render with language "ko"; default validation-message keys are
 * resolved exactly like the React I18n provider (only the message keys the
 * fixtures could reference are kept).
 */
/** Supported UI language codes. */
export type Language = 'ko' | 'en' | 'ja' | 'zh';
/** A plain string, or a per-language map of strings (e.g. `{ ko, en }`). */
export type MultiLangText = string | Record<string, string>;
/**
 * Create a translator bound to a language (matches React I18nContext.t):
 *   - string that is a known message key -> the localized message
 *   - other string -> itself
 *   - multi-language object -> language key, then en > ko > first > fallback
 */
export declare function makeTranslate(language: Language): (text: MultiLangText | undefined | null, fallback?: string) => string;
//# sourceMappingURL=i18n.d.ts.map