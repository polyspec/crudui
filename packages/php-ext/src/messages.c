#include "engine_internal.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Runtime interface text shared by every renderer and implementation. */
static const struct {
    const char *language;
    ps_form_messages messages;
} tables[] = {
    {"ko", {
        "위로", "아래로", "추가", "복사", "제거",
        "펼치기/접기", "모두 펼치기", "모두 접기", "되돌리기",
        "행 컨트롤", "컬렉션 컨트롤", "폼 컨트롤",
        "폼 작업", "저장", "초기화",
        "구조 맵", "현재 데이터", "(이름 없음)", "접힘",
        "{count}개", "하위 {count}개",
    }},
    {"en", {
        "Move up", "Move down", "Add", "Copy", "Remove",
        "Expand or collapse", "Expand all", "Collapse all", "Undo",
        "Row controls", "Collection controls", "Form controls",
        "Form actions", "Save", "Reset",
        "Structure map", "Current data", "(untitled)", "Collapsed",
        "Rows: {count}", "Nested rows: {count}",
    }},
    {"ja", {
        "上へ", "下へ", "追加", "複製", "削除",
        "展開/折りたたみ", "すべて展開", "すべて折りたたむ", "元に戻す",
        "行の操作", "コレクションの操作", "フォームの操作",
        "フォームのアクション", "保存", "リセット",
        "構造マップ", "現在のデータ", "(名前なし)", "折りたたみ中",
        "{count}件", "下位 {count}件",
    }},
    {"zh", {
        "上移", "下移", "添加", "复制", "删除",
        "展开/折叠", "全部展开", "全部折叠", "撤销",
        "行操作", "集合操作", "表单操作",
        "表单动作", "保存", "重置",
        "结构图", "当前数据", "(未命名)", "已折叠",
        "{count} 项", "子项 {count} 项",
    }},
};

const ps_form_messages *ps_form_messages_for(const char *language)
{
    for (size_t i = 0; i < sizeof(tables) / sizeof(tables[0]); ++i)
        if (!strcmp(tables[i].language, language)) return &tables[i].messages;
    return NULL;
}

char *ps_format_count(const char *template, size_t count)
{
    char number[32];
    snprintf(number, sizeof(number), "%zu", count);
    const char *marker = strstr(template, "{count}");
    size_t head = marker ? (size_t)(marker - template) : strlen(template);
    const char *tail = marker ? marker + strlen("{count}") : "";
    size_t length = head + (marker ? strlen(number) : 0) + strlen(tail);
    char *out = malloc(length + 1);
    if (!out) return NULL;
    memcpy(out, template, head);
    size_t cursor = head;
    if (marker) {
        memcpy(out + cursor, number, strlen(number));
        cursor += strlen(number);
    }
    memcpy(out + cursor, tail, strlen(tail) + 1);
    return out;
}

ps_value *ps_form_messages_value(const ps_form_messages *messages)
{
    const struct { const char *key; const char *text; } entries[] = {
        {"moveUp", messages->move_up}, {"moveDown", messages->move_down},
        {"addRow", messages->add_row}, {"copyRow", messages->copy_row},
        {"removeRow", messages->remove_row}, {"toggleRow", messages->toggle_row},
        {"expandAll", messages->expand_all}, {"collapseAll", messages->collapse_all},
        {"undo", messages->undo}, {"rowControls", messages->row_controls},
        {"collectionControls", messages->collection_controls},
        {"formControls", messages->form_controls}, {"formActions", messages->form_actions},
        {"submit", messages->submit}, {"reset", messages->reset},
        {"outline", messages->outline}, {"data", messages->data},
        {"untitled", messages->untitled}, {"collapsed", messages->collapsed},
        {"count", messages->count}, {"children", messages->children},
    };
    ps_value *value = ps_object_value();
    for (size_t i = 0; value && i < sizeof(entries) / sizeof(entries[0]); ++i)
        if (!ps_set(value, entries[i].key, ps_string_value(entries[i].text))) {
            ps_value_free(value); return NULL;
        }
    return value;
}
