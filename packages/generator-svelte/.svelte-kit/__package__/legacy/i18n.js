/**
 * Translation helper — port of generator-react I18nContext `t`. The reference
 * fixtures render with language "ko"; default validation-message keys are
 * resolved exactly like the React I18n provider (only the message keys the
 * fixtures could reference are kept).
 */
const defaultMessages = {
    ko: { submit: '저장', cancel: '취소', add: '추가', remove: '삭제', on: 'On', off: 'Off' },
    en: { submit: 'Save', cancel: 'Cancel', add: 'Add', remove: 'Remove', on: 'On', off: 'Off' },
    ja: { submit: '保存', cancel: 'キャンセル', add: '追加', remove: '削除', on: 'On', off: 'Off' },
    zh: { submit: '保存', cancel: '取消', add: '添加', remove: '删除', on: 'On', off: 'Off' },
};
/**
 * Create a translator bound to a language (matches React I18nContext.t):
 *   - string that is a known message key -> the localized message
 *   - other string -> itself
 *   - multi-language object -> language key, then en > ko > first > fallback
 */
export function makeTranslate(language) {
    return function t(text, fallback) {
        if (text == null)
            return fallback ?? '';
        if (typeof text === 'string') {
            const msg = defaultMessages[language]?.[text];
            if (msg)
                return msg;
            return text;
        }
        if (typeof text !== 'object')
            return fallback ?? String(text);
        if (text[language])
            return text[language];
        if (text.en)
            return text.en;
        if (text.ko)
            return text.ko;
        const firstLang = Object.keys(text)[0];
        if (firstLang && text[firstLang])
            return text[firstLang];
        return fallback ?? '';
    };
}
