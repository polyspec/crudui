//! Runtime interface text shared by every renderer and implementation.

use crate::{FormError, FormResult};

/// Interface labels for row, collection and form controls. `{count}` is replaced by a number.
#[allow(dead_code)]
pub(crate) struct Messages {
    /// Move a row up.
    pub move_up: &'static str,
    /// Move a row down.
    pub move_down: &'static str,
    /// Add a row.
    pub add_row: &'static str,
    /// Copy a row.
    pub copy_row: &'static str,
    /// Remove a row.
    pub remove_row: &'static str,
    /// Expand or collapse a row.
    pub toggle_row: &'static str,
    /// Expand every row.
    pub expand_all: &'static str,
    /// Collapse every row.
    pub collapse_all: &'static str,
    /// Undo the last change.
    pub undo: &'static str,
    /// Accessible name of a row's controls.
    pub row_controls: &'static str,
    /// Accessible name of an empty collection's controls.
    pub collection_controls: &'static str,
    /// Accessible name of the form controls.
    pub form_controls: &'static str,
    /// Structure map heading.
    pub outline: &'static str,
    /// Current data heading.
    pub data: &'static str,
    /// Row title when the title field is empty.
    pub untitled: &'static str,
    /// Collapsed row summary without nested collections.
    pub collapsed: &'static str,
    /// Collection row count.
    pub count: &'static str,
    /// Collapsed row summary with nested rows.
    pub children: &'static str,
}

const KO: Messages = Messages {
    move_up: "위로", move_down: "아래로", add_row: "추가", copy_row: "복사", remove_row: "제거",
    toggle_row: "펼치기/접기", expand_all: "모두 펼치기", collapse_all: "모두 접기", undo: "되돌리기",
    row_controls: "행 컨트롤", collection_controls: "컬렉션 컨트롤", form_controls: "폼 컨트롤",
    outline: "구조 맵", data: "현재 데이터", untitled: "(이름 없음)", collapsed: "접힘",
    count: "{count}개", children: "하위 {count}개",
};

const EN: Messages = Messages {
    move_up: "Move up", move_down: "Move down", add_row: "Add", copy_row: "Copy", remove_row: "Remove",
    toggle_row: "Expand or collapse", expand_all: "Expand all", collapse_all: "Collapse all", undo: "Undo",
    row_controls: "Row controls", collection_controls: "Collection controls", form_controls: "Form controls",
    outline: "Structure map", data: "Current data", untitled: "(untitled)", collapsed: "Collapsed",
    count: "Rows: {count}", children: "Nested rows: {count}",
};

const JA: Messages = Messages {
    move_up: "上へ", move_down: "下へ", add_row: "追加", copy_row: "複製", remove_row: "削除",
    toggle_row: "展開/折りたたみ", expand_all: "すべて展開", collapse_all: "すべて折りたたむ", undo: "元に戻す",
    row_controls: "行の操作", collection_controls: "コレクションの操作", form_controls: "フォームの操作",
    outline: "構造マップ", data: "現在のデータ", untitled: "(名前なし)", collapsed: "折りたたみ中",
    count: "{count}件", children: "下位 {count}件",
};

const ZH: Messages = Messages {
    move_up: "上移", move_down: "下移", add_row: "添加", copy_row: "复制", remove_row: "删除",
    toggle_row: "展开/折叠", expand_all: "全部展开", collapse_all: "全部折叠", undo: "撤销",
    row_controls: "行操作", collection_controls: "集合操作", form_controls: "表单操作",
    outline: "结构图", data: "当前数据", untitled: "(未命名)", collapsed: "已折叠",
    count: "{count} 项", children: "子项 {count} 项",
};

/// Return the interface text for a supported language.
pub(crate) fn form_messages(language: &str) -> FormResult<&'static Messages> {
    match language {
        "ko" => Ok(&KO),
        "en" => Ok(&EN),
        "ja" => Ok(&JA),
        "zh" => Ok(&ZH),
        _ => Err(FormError::input(format!("Unsupported language: {language}"))),
    }
}

/// Replace `{count}` in a counted message.
pub(crate) fn format_count(template: &str, count: usize) -> String {
    template.replacen("{count}", &count.to_string(), 1)
}
