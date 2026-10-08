"""Interface message tables of every supported language.

Generated from contracts/interface-messages.json by
`python3 packages/generator-python/scripts/generate_interface_messages.py`.
Do not edit; test_interface_messages fails when this data differs from the
contract.

`FORM` holds the interface text of form controls, counts and summaries, where
`{count}` is replaced with a number. `LIST` holds the labels of the list
pagination buttons, where `{page}` is replaced with a page number, and the
text of the empty list.
"""

FORM = {
    "ko": {"moveUp": "위로", "moveDown": "아래로", "addRow": "추가", "copyRow": "복사", "removeRow": "제거", "toggleRow": "펼치기/접기", "expandAll": "모두 펼치기", "collapseAll": "모두 접기", "undo": "실행취소", "redo": "실행복귀", "rowControls": "행 컨트롤", "collectionControls": "컬렉션 컨트롤", "formControls": "폼 컨트롤", "formActions": "폼 작업", "submit": "저장", "reset": "초기화", "outline": "구조 맵", "data": "현재 데이터", "untitled": "(이름 없음)", "collapsed": "접힘", "count": "{count}개", "children": "하위 {count}개"},
    "en": {"moveUp": "Move up", "moveDown": "Move down", "addRow": "Add", "copyRow": "Copy", "removeRow": "Remove", "toggleRow": "Expand or collapse", "expandAll": "Expand all", "collapseAll": "Collapse all", "undo": "Undo", "redo": "Redo", "rowControls": "Row controls", "collectionControls": "Collection controls", "formControls": "Form controls", "formActions": "Form actions", "submit": "Save", "reset": "Reset", "outline": "Structure map", "data": "Current data", "untitled": "(untitled)", "collapsed": "Collapsed", "count": "Rows: {count}", "children": "Nested rows: {count}"},
    "ja": {"moveUp": "上へ", "moveDown": "下へ", "addRow": "追加", "copyRow": "複製", "removeRow": "削除", "toggleRow": "展開/折りたたみ", "expandAll": "すべて展開", "collapseAll": "すべて折りたたむ", "undo": "元に戻す", "redo": "やり直す", "rowControls": "行の操作", "collectionControls": "コレクションの操作", "formControls": "フォームの操作", "formActions": "フォームのアクション", "submit": "保存", "reset": "リセット", "outline": "構造マップ", "data": "現在のデータ", "untitled": "(名前なし)", "collapsed": "折りたたみ中", "count": "{count}件", "children": "下位 {count}件"},
    "zh": {"moveUp": "上移", "moveDown": "下移", "addRow": "添加", "copyRow": "复制", "removeRow": "删除", "toggleRow": "展开/折叠", "expandAll": "全部展开", "collapseAll": "全部折叠", "undo": "撤销", "redo": "重做", "rowControls": "行操作", "collectionControls": "集合操作", "formControls": "表单操作", "formActions": "表单动作", "submit": "保存", "reset": "重置", "outline": "结构图", "data": "当前数据", "untitled": "(未命名)", "collapsed": "已折叠", "count": "{count} 项", "children": "子项 {count} 项"},
}

LIST = {
    "ko": {"previousPage": "이전 페이지", "nextPage": "다음 페이지", "page": "{page}페이지", "emptyList": "데이터가 없습니다"},
    "en": {"previousPage": "Previous page", "nextPage": "Next page", "page": "Page {page}", "emptyList": "No data"},
    "ja": {"previousPage": "前のページ", "nextPage": "次のページ", "page": "{page}ページ", "emptyList": "データがありません"},
    "zh": {"previousPage": "上一页", "nextPage": "下一页", "page": "第 {page} 页", "emptyList": "暂无数据"},
}
