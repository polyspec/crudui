/**
 * I18n Context Provider
 *
 * Provides multi-language support for form labels and messages
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import type { I18nContextValue, Language, MultiLangText } from '../types';

/**
 * Default messages for each language
 */
const defaultMessages: Record<Language, Record<string, string>> = {
  ko: {
    required: '필수 입력 항목입니다.',
    email: '올바른 이메일 형식이 아닙니다.',
    minlength: '최소 {0}자 이상 입력해주세요.',
    maxlength: '최대 {0}자까지 입력 가능합니다.',
    min: '{0} 이상의 값을 입력해주세요.',
    max: '{0} 이하의 값을 입력해주세요.',
    number: '숫자를 입력해주세요.',
    url: '올바른 URL 형식이 아닙니다.',
    match: '올바른 형식이 아닙니다.',
    equalTo: '값이 일치하지 않습니다.',
    date: '올바른 날짜 형식이 아닙니다.',
    mincount: '최소 {0}개 이상 선택해주세요.',
    maxcount: '최대 {0}개까지 선택 가능합니다.',
    unique: '중복된 값이 있습니다.',
    accept: '허용되지 않는 파일 형식입니다.',
    submit: '저장',
    cancel: '취소',
    add: '추가',
    remove: '삭제',
    moveUp: '위로',
    moveDown: '아래로',
  },
  en: {
    required: 'This field is required.',
    email: 'Please enter a valid email address.',
    minlength: 'Please enter at least {0} characters.',
    maxlength: 'Please enter no more than {0} characters.',
    min: 'Please enter a value greater than or equal to {0}.',
    max: 'Please enter a value less than or equal to {0}.',
    number: 'Please enter a valid number.',
    url: 'Please enter a valid URL.',
    match: 'Please enter a valid format.',
    equalTo: 'Values do not match.',
    date: 'Please enter a valid date.',
    mincount: 'Please select at least {0} items.',
    maxcount: 'Please select no more than {0} items.',
    unique: 'Duplicate values are not allowed.',
    accept: 'File type not allowed.',
    submit: 'Save',
    cancel: 'Cancel',
    add: 'Add',
    remove: 'Remove',
    moveUp: 'Move Up',
    moveDown: 'Move Down',
  },
  ja: {
    required: '必須入力項目です。',
    email: '有効なメールアドレスを入力してください。',
    minlength: '{0}文字以上で入力してください。',
    maxlength: '{0}文字以内で入力してください。',
    min: '{0}以上の値を入力してください。',
    max: '{0}以下の値を入力してください。',
    number: '数字を入力してください。',
    url: '有効なURLを入力してください。',
    match: '正しい形式で入力してください。',
    equalTo: '値が一致しません。',
    date: '有効な日付を入力してください。',
    mincount: '{0}個以上選択してください。',
    maxcount: '{0}個まで選択できます。',
    unique: '重複した値があります。',
    accept: '許可されていないファイル形式です。',
    submit: '保存',
    cancel: 'キャンセル',
    add: '追加',
    remove: '削除',
    moveUp: '上へ',
    moveDown: '下へ',
  },
  zh: {
    required: '此字段为必填项。',
    email: '请输入有效的电子邮件地址。',
    minlength: '请输入至少{0}个字符。',
    maxlength: '请输入不超过{0}个字符。',
    min: '请输入大于或等于{0}的值。',
    max: '请输入小于或等于{0}的值。',
    number: '请输入数字。',
    url: '请输入有效的URL。',
    match: '请输入正确的格式。',
    equalTo: '值不匹配。',
    date: '请输入有效的日期。',
    mincount: '请至少选择{0}项。',
    maxcount: '最多可选择{0}项。',
    unique: '存在重复的值。',
    accept: '不允许的文件类型。',
    submit: '保存',
    cancel: '取消',
    add: '添加',
    remove: '删除',
    moveUp: '上移',
    moveDown: '下移',
  },
};

/**
 * I18n context
 */
const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * I18n context provider props
 */
interface I18nContextProviderProps {
  children: ReactNode;
  language?: Language;
  customMessages?: Partial<Record<Language, Record<string, string>>>;
}

/**
 * I18n context provider component
 */
export function I18nContextProvider({
  children,
  language: initialLanguage = 'ko',
  customMessages = {},
}: I18nContextProviderProps) {
  const [language, setLanguage] = useState<Language>(initialLanguage);

  /**
   * Sync language state with prop changes
   */
  useEffect(() => {
    setLanguage(initialLanguage);
  }, [initialLanguage]);

  /**
   * Merge default and custom messages
   */
  const messages = useMemo(() => {
    const merged: Record<Language, Record<string, string>> = {
      ko: { ...defaultMessages.ko, ...customMessages.ko },
      en: { ...defaultMessages.en, ...customMessages.en },
      ja: { ...defaultMessages.ja, ...customMessages.ja },
      zh: { ...defaultMessages.zh, ...customMessages.zh },
    };
    return merged;
  }, [customMessages]);

  /**
   * Translate text based on current language
   */
  const t = useCallback(
    (text: MultiLangText, fallback?: string): string => {
      // Handle null/undefined
      if (text == null) {
        return fallback ?? '';
      }

      if (typeof text === 'string') {
        // Check if it's a message key
        if (messages[language]?.[text]) {
          return messages[language][text];
        }
        return text;
      }

      // Ensure text is a valid object
      if (typeof text !== 'object') {
        return fallback ?? String(text);
      }

      // Multi-language object
      if (text[language]) {
        return text[language];
      }

      // Fallback order: en > ko > first available > fallback
      if (text.en) return text.en;
      if (text.ko) return text.ko;

      const firstLang = Object.keys(text)[0] as Language | undefined;
      if (firstLang && text[firstLang]) {
        return text[firstLang];
      }

      return fallback ?? '';
    },
    [language, messages]
  );

  const contextValue = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t,
    }),
    [language, t]
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

/**
 * Hook to use i18n context
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used within an I18nContextProvider');
  }

  return context;
}

/**
 * Get translated message with parameter substitution
 */
export function formatMessage(message: string, ...params: (string | number)[]): string {
  return message.replace(/\{(\d+)\}/g, (_, index) => {
    const paramIndex = parseInt(index, 10);
    return params[paramIndex]?.toString() ?? `{${index}}`;
  });
}

export { I18nContext, defaultMessages };
