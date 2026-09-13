package generator

import (
	"fmt"
	"strconv"
	"strings"
)

// formMessages holds the interface text of row, collection and form controls. `{count}` is replaced by a number.
type formMessages struct {
	moveUp, moveDown, addRow, copyRow, removeRow, toggleRow string
	expandAll, collapseAll, undo                            string
	rowControls, collectionControls, formControls           string
	formActions, submit, reset                              string
	outline, data, untitled, collapsed, count, children     string
}

var messageTables = map[string]formMessages{
	"ko": {
		moveUp:             "위로",
		moveDown:           "아래로",
		addRow:             "추가",
		copyRow:            "복사",
		removeRow:          "제거",
		toggleRow:          "펼치기/접기",
		expandAll:          "모두 펼치기",
		collapseAll:        "모두 접기",
		undo:               "되돌리기",
		rowControls:        "행 컨트롤",
		collectionControls: "컬렉션 컨트롤",
		formControls:       "폼 컨트롤",
		formActions:        "폼 작업",
		submit:             "저장",
		reset:              "초기화",
		outline:            "구조 맵",
		data:               "현재 데이터",
		untitled:           "(이름 없음)",
		collapsed:          "접힘",
		count:              "{count}개",
		children:           "하위 {count}개",
	},
	"en": {
		moveUp:             "Move up",
		moveDown:           "Move down",
		addRow:             "Add",
		copyRow:            "Copy",
		removeRow:          "Remove",
		toggleRow:          "Expand or collapse",
		expandAll:          "Expand all",
		collapseAll:        "Collapse all",
		undo:               "Undo",
		rowControls:        "Row controls",
		collectionControls: "Collection controls",
		formControls:       "Form controls",
		formActions:        "Form actions",
		submit:             "Save",
		reset:              "Reset",
		outline:            "Structure map",
		data:               "Current data",
		untitled:           "(untitled)",
		collapsed:          "Collapsed",
		count:              "Rows: {count}",
		children:           "Nested rows: {count}",
	},
	"ja": {
		moveUp:             "上へ",
		moveDown:           "下へ",
		addRow:             "追加",
		copyRow:            "複製",
		removeRow:          "削除",
		toggleRow:          "展開/折りたたみ",
		expandAll:          "すべて展開",
		collapseAll:        "すべて折りたたむ",
		undo:               "元に戻す",
		rowControls:        "行の操作",
		collectionControls: "コレクションの操作",
		formControls:       "フォームの操作",
		formActions:        "フォームのアクション",
		submit:             "保存",
		reset:              "リセット",
		outline:            "構造マップ",
		data:               "現在のデータ",
		untitled:           "(名前なし)",
		collapsed:          "折りたたみ中",
		count:              "{count}件",
		children:           "下位 {count}件",
	},
	"zh": {
		moveUp:             "上移",
		moveDown:           "下移",
		addRow:             "添加",
		copyRow:            "复制",
		removeRow:          "删除",
		toggleRow:          "展开/折叠",
		expandAll:          "全部展开",
		collapseAll:        "全部折叠",
		undo:               "撤销",
		rowControls:        "行操作",
		collectionControls: "集合操作",
		formControls:       "表单操作",
		formActions:        "表单动作",
		submit:             "保存",
		reset:              "重置",
		outline:            "结构图",
		data:               "当前数据",
		untitled:           "(未命名)",
		collapsed:          "已折叠",
		count:              "{count} 项",
		children:           "子项 {count} 项",
	},
}

// messagesFor returns the interface text of a supported language: ko, en, ja or zh.
func messagesFor(language string) (formMessages, error) {
	m, ok := messageTables[language]
	if !ok {
		return formMessages{}, fmt.Errorf("Unsupported language: %s", language)
	}
	return m, nil
}

// formatCount replaces `{count}` in a counted message.
func formatCount(template string, count int) string {
	return strings.Replace(template, "{count}", strconv.Itoa(count), 1)
}
