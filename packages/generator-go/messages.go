package generator

//go:generate go run interface_messages_generate.go

import (
	"fmt"
	"strconv"
	"strings"
)

// formMessages holds the interface text of row, collection and form controls. `{count}` is replaced by a number.
type formMessages struct {
	moveUp, moveDown, addRow, copyRow, removeRow, toggleRow string
	expandAll, collapseAll, undo, redo                      string
	rowControls, collectionControls, formControls           string
	formActions, submit, reset                              string
	outline, data, untitled, collapsed, count, children     string
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
