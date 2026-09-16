/** Runtime interface text shared by every renderer and implementation. */

import { FormInputError } from '@crudui/validator';
import type { Language } from './content';

/** Supported interface languages, in declaration order. */
export const LANGUAGES: readonly Language[] = ['ko', 'en', 'ja', 'zh'];

/** Interface labels for row, collection and form controls. `{count}` is replaced by a number. */
export interface FormMessages {
  /** Move a row up. */
  moveUp: string;
  /** Move a row down. */
  moveDown: string;
  /** Add a row. */
  addRow: string;
  /** Copy a row. */
  copyRow: string;
  /** Remove a row. */
  removeRow: string;
  /** Expand or collapse a row. */
  toggleRow: string;
  /** Expand every row. */
  expandAll: string;
  /** Collapse every row. */
  collapseAll: string;
  /** Undo the last change. */
  undo: string;
  /** Redo the last undone change. */
  redo: string;
  /** Accessible name of a row's controls. */
  rowControls: string;
  /** Accessible name of an empty collection's controls. */
  collectionControls: string;
  /** Accessible name of the form controls. */
  formControls: string;
  /** Accessible name of the form buttons in the form footer. */
  formActions: string;
  /** Default text of a submit button. */
  submit: string;
  /** Default text of a reset button. */
  reset: string;
  /** Structure map heading. */
  outline: string;
  /** Current data heading. */
  data: string;
  /** Row title when the title field is empty. */
  untitled: string;
  /** Collapsed row summary without nested collections. */
  collapsed: string;
  /** Collection row count. */
  count: string;
  /** Collapsed row summary with nested rows. */
  children: string;
}

const MESSAGES: Readonly<Record<Language, FormMessages>> = {
  ko: {
    moveUp: '위로', moveDown: '아래로', addRow: '추가', copyRow: '복사', removeRow: '제거',
    toggleRow: '펼치기/접기', expandAll: '모두 펼치기', collapseAll: '모두 접기', undo: '실행취소', redo: '실행복귀',
    rowControls: '행 컨트롤', collectionControls: '컬렉션 컨트롤', formControls: '폼 컨트롤',
    formActions: '폼 작업', submit: '저장', reset: '초기화',
    outline: '구조 맵', data: '현재 데이터', untitled: '(이름 없음)', collapsed: '접힘',
    count: '{count}개', children: '하위 {count}개',
  },
  en: {
    moveUp: 'Move up', moveDown: 'Move down', addRow: 'Add', copyRow: 'Copy', removeRow: 'Remove',
    toggleRow: 'Expand or collapse', expandAll: 'Expand all', collapseAll: 'Collapse all', undo: 'Undo', redo: 'Redo',
    rowControls: 'Row controls', collectionControls: 'Collection controls', formControls: 'Form controls',
    formActions: 'Form actions', submit: 'Save', reset: 'Reset',
    outline: 'Structure map', data: 'Current data', untitled: '(untitled)', collapsed: 'Collapsed',
    count: 'Rows: {count}', children: 'Nested rows: {count}',
  },
  ja: {
    moveUp: '上へ', moveDown: '下へ', addRow: '追加', copyRow: '複製', removeRow: '削除',
    toggleRow: '展開/折りたたみ', expandAll: 'すべて展開', collapseAll: 'すべて折りたたむ', undo: '元に戻す', redo: 'やり直す',
    rowControls: '行の操作', collectionControls: 'コレクションの操作', formControls: 'フォームの操作',
    formActions: 'フォームのアクション', submit: '保存', reset: 'リセット',
    outline: '構造マップ', data: '現在のデータ', untitled: '(名前なし)', collapsed: '折りたたみ中',
    count: '{count}件', children: '下位 {count}件',
  },
  zh: {
    moveUp: '上移', moveDown: '下移', addRow: '添加', copyRow: '复制', removeRow: '删除',
    toggleRow: '展开/折叠', expandAll: '全部展开', collapseAll: '全部折叠', undo: '撤销', redo: '重做',
    rowControls: '行操作', collectionControls: '集合操作', formControls: '表单操作',
    formActions: '表单动作', submit: '保存', reset: '重置',
    outline: '结构图', data: '当前数据', untitled: '(未命名)', collapsed: '已折叠',
    count: '{count} 项', children: '子项 {count} 项',
  },
};

/** Return the interface text for a supported language. */
export function formMessages(language: string): FormMessages {
  // Callers can pass decoded JSON; a non-string is rejected before any text conversion.
  if (typeof language !== 'string') throw new FormInputError('Language must be a string');
  if (!(LANGUAGES as readonly string[]).includes(language)) {
    throw new FormInputError(`Unsupported language: ${language}`);
  }
  return MESSAGES[language as Language];
}

/** Replace `{count}` in a counted message. */
export function formatCount(template: string, count: number): string {
  return template.replace('{count}', String(count));
}
