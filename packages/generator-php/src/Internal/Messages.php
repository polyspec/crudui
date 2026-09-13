<?php

declare(strict_types=1);

namespace CRUDUI\Generator;

use CRUDUI\FormError;

/** Runtime interface text shared by every renderer and implementation. */
final class Messages
{
    private const MESSAGES = [
        'ko' => [
            'moveUp' => '위로', 'moveDown' => '아래로', 'addRow' => '추가', 'copyRow' => '복사', 'removeRow' => '제거',
            'toggleRow' => '펼치기/접기', 'expandAll' => '모두 펼치기', 'collapseAll' => '모두 접기', 'undo' => '되돌리기',
            'rowControls' => '행 컨트롤', 'collectionControls' => '컬렉션 컨트롤', 'formControls' => '폼 컨트롤',
            'outline' => '구조 맵', 'data' => '현재 데이터', 'untitled' => '(이름 없음)', 'collapsed' => '접힘',
            'count' => '{count}개', 'children' => '하위 {count}개',
        ],
        'en' => [
            'moveUp' => 'Move up', 'moveDown' => 'Move down', 'addRow' => 'Add', 'copyRow' => 'Copy', 'removeRow' => 'Remove',
            'toggleRow' => 'Expand or collapse', 'expandAll' => 'Expand all', 'collapseAll' => 'Collapse all', 'undo' => 'Undo',
            'rowControls' => 'Row controls', 'collectionControls' => 'Collection controls', 'formControls' => 'Form controls',
            'outline' => 'Structure map', 'data' => 'Current data', 'untitled' => '(untitled)', 'collapsed' => 'Collapsed',
            'count' => 'Rows: {count}', 'children' => 'Nested rows: {count}',
        ],
        'ja' => [
            'moveUp' => '上へ', 'moveDown' => '下へ', 'addRow' => '追加', 'copyRow' => '複製', 'removeRow' => '削除',
            'toggleRow' => '展開/折りたたみ', 'expandAll' => 'すべて展開', 'collapseAll' => 'すべて折りたたむ', 'undo' => '元に戻す',
            'rowControls' => '行の操作', 'collectionControls' => 'コレクションの操作', 'formControls' => 'フォームの操作',
            'outline' => '構造マップ', 'data' => '現在のデータ', 'untitled' => '(名前なし)', 'collapsed' => '折りたたみ中',
            'count' => '{count}件', 'children' => '下位 {count}件',
        ],
        'zh' => [
            'moveUp' => '上移', 'moveDown' => '下移', 'addRow' => '添加', 'copyRow' => '复制', 'removeRow' => '删除',
            'toggleRow' => '展开/折叠', 'expandAll' => '全部展开', 'collapseAll' => '全部折叠', 'undo' => '撤销',
            'rowControls' => '行操作', 'collectionControls' => '集合操作', 'formControls' => '表单操作',
            'outline' => '结构图', 'data' => '当前数据', 'untitled' => '(未命名)', 'collapsed' => '已折叠',
            'count' => '{count} 项', 'children' => '子项 {count} 项',
        ],
    ];

    /** Return the interface text for a supported language (ko, en, ja or zh). */
    public static function forLanguage(mixed $language): array
    {
        // Decoded JSON can supply any value; a non-string is rejected before any text conversion.
        if (!is_string($language)) {
            throw new FormError('INVALID_FORM_INPUT', 'Language must be a string');
        }
        if (!isset(self::MESSAGES[$language])) {
            throw new FormError('INVALID_FORM_INPUT', 'Unsupported language: ' . $language);
        }
        return self::MESSAGES[$language];
    }

    /** Replace the first `{count}` in a counted message. */
    public static function count(string $template, int $count): string
    {
        $at = strpos($template, '{count}');
        return $at === false ? $template : substr_replace($template, (string) $count, $at, strlen('{count}'));
    }
}
