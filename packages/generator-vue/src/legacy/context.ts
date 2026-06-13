/**
 * Render context — a plain (non-reactive) object threaded through
 * provide/inject. Golden fixtures are empty-data static renders, so the
 * heavy interactive React state (setValue, validation, multiple edit) is not
 * needed for parity; this context exposes only the read paths each component
 * uses during render (getValue / isFieldVisible / t / keyPrefix / language).
 */

import type { InjectionKey } from 'vue';
import { parseCondition, evaluateCondition } from '@form-spec/validator/legacy';
import type { Spec, PathContext } from '@form-spec/validator/legacy';
import type { FormData, FormValue, MultiLangText, RenderContext } from './types';
import { getValueByPath, parsePathString } from './utils/path';
import { applyDisplaySwitchTransform } from './hooks/legacyDisplay';
import { applyLangAppendTransform } from './hooks/legacyLang';

/** Vue provide/inject key that carries the {@link RenderContext} down the field tree. */
export const RENDER_CONTEXT_KEY: InjectionKey<RenderContext> = Symbol('form-spec-render-ctx');

const defaultMessages: Record<string, Record<string, string>> = {
  ko: {
    submit: '저장', cancel: '취소', add: '추가', remove: '삭제',
    moveUp: '위로', moveDown: '아래로',
  },
  en: { submit: 'Save', cancel: 'Cancel', add: 'Add', remove: 'Remove' },
  ja: { submit: '保存', cancel: 'キャンセル' },
  zh: { submit: '保存', cancel: '取消' },
};

/** I18n resolver — mirrors generator-react I18nContext.t. */
export function createTranslator(language: string) {
  return function t(text: MultiLangText | undefined, fallback?: string): string {
    if (text == null) return fallback ?? '';
    if (typeof text === 'string') {
      const msg = defaultMessages[language]?.[text];
      if (msg) return msg;
      return text;
    }
    if (typeof text !== 'object') return fallback ?? String(text);
    const obj = text as Record<string, string>;
    if (obj[language]) return obj[language];
    if (obj.en) return obj.en;
    if (obj.ko) return obj.ko;
    const firstLang = Object.keys(obj)[0];
    if (firstLang && obj[firstLang]) return obj[firstLang];
    return fallback ?? '';
  };
}

function getFieldSpecByPath(
  properties: Record<string, any>,
  pathSegments: string[]
): any {
  let current: Record<string, any> = properties;
  let fieldSpec: any = null;
  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i]!;
    if (/^\d+$/.test(segment) || /^__[a-z0-9]{13}__$/.test(segment)) continue;
    fieldSpec = current[segment] ?? null;
    if (!fieldSpec) return null;
    if (fieldSpec.properties && i < pathSegments.length - 1) {
      current = fieldSpec.properties;
    }
  }
  return fieldSpec;
}

function hasDisplayTargetConditionMaps(fieldSpec: Record<string, unknown>): boolean {
  return (
    fieldSpec.display_target_condition_style !== undefined ||
    fieldSpec.display_target_condition_class !== undefined
  );
}

/**
 * Build the render context. The render spec is produced by the same legacy
 * parser ports as generator-react (lang: append expansion BEFORE the
 * display_switch transform), and visibility is evaluated against that render
 * spec + the (empty) form data.
 */
export function createRenderContext(opts: {
  spec: Spec;
  data: FormData;
  disabled: boolean;
  readonly: boolean;
  keyPrefix: string;
  language: string;
}): RenderContext {
  const { spec, data, disabled, readonly, keyPrefix, language } = opts;
  const renderSpec = applyDisplaySwitchTransform(
    applyLangAppendTransform(spec, language)
  ) as Spec;
  const t = createTranslator(language);

  const getValue = (path: string): FormValue => getValueByPath(data, path);

  const isFieldVisible = (path: string): boolean => {
    const segments = parsePathString(path);
    const fieldSpec = getFieldSpecByPath(
      (renderSpec.properties ?? {}) as Record<string, any>,
      segments
    );
    if (!fieldSpec) return true;

    if (fieldSpec.display_switch) {
      if (typeof fieldSpec.display_switch !== 'string') return true;
      try {
        const ast = parseCondition(fieldSpec.display_switch);
        const context: PathContext = {
          currentPath: segments,
          formData: data as Record<string, unknown>,
        };
        return evaluateCondition(ast, context, 'CURRENT');
      } catch {
        return true;
      }
    }

    if (
      fieldSpec.display_target &&
      !hasDisplayTargetConditionMaps(fieldSpec as Record<string, unknown>)
    ) {
      const targetValue = getValueByPath(data, fieldSpec.display_target);
      return Boolean(targetValue);
    }

    return true;
  };

  return {
    spec: renderSpec,
    data,
    errors: {},
    getValue,
    isFieldVisible,
    disabled,
    readonly,
    keyPrefix,
    language,
    t,
  };
}
