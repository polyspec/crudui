package generator

import (
	"fmt"
	"strings"
)

// DetailOptions supplies composition, display language and caller-owned data options.
// Layout is ignored; detail output is always a read-only definition list.
type DetailOptions = ListOptions

// BuildDetail creates a read-only detail model from one supplied record.
// Field composition, design evaluation and cell formatting are delegated to BuildList.
func BuildDetail(spec *Object, record *Object, options DetailOptions) (*Object, error) {
	if spec == nil {
		return nil, fmt.Errorf("Detail specification must be an object")
	}
	if record == nil {
		record = NewObject()
	}
	if !has(spec, "fields") {
		return nil, fmt.Errorf("Detail specification must declare fields")
	}
	listSpec := NewObject("columns", read(spec, "fields"))
	if has(spec, "design") {
		listSpec.Set("design", read(spec, "design"))
	}
	list, err := BuildList(listSpec, []*Object{record}, options)
	if err != nil {
		return nil, err
	}
	columns := objectList(read(list, "columns"))
	rows := objectList(read(list, "rows"))
	var cells []*Object
	if len(rows) > 0 {
		cells = objectList(read(rows[0], "cells"))
	}
	fields := []*Object{}
	for i, column := range columns {
		if i >= len(cells) {
			break
		}
		cell := cells[i]
		fields = append(fields, NewObject(
			"key", stringAt(column, "key"),
			"label", stringAt(column, "label"),
			"format", read(cell, "format"),
			"value", read(cell, "value"),
			"display", read(cell, "display"),
			"design", read(cell, "design"),
		))
	}
	return NewObject("fields", fields, "design", read(list, "design")), nil
}

// RenderDetail renders one read-only detail as a definition list.
func RenderDetail(spec *Object, record *Object, options DetailOptions) (string, error) {
	vm, err := BuildDetail(spec, record, options)
	if err != nil {
		return "", err
	}
	design := object(read(vm, "design"))
	attrs := NewObject("class", joinClass("detail-view", nodeClass(design, "wrapper")))
	if style := nodeStyle(design, "wrapper"); style != "" {
		attrs.Set("style", style)
	}
	body := ""
	for _, field := range objectList(read(vm, "fields")) {
		cell := NewObject("display", read(field, "display"), "design", read(field, "design"), "format", read(field, "format"))
		body += element("div", NewObject("class", "detail-field"),
			element("dt", NewObject("class", "detail-label"), escapeText(stringAt(field, "label")))+
				cellHTML(cell, "dd", joinClass("detail-value detail-value-"+stringAt(object(read(field, "format")), "type"), "")))
	}
	return detailImagePreloads(vm) + element("dl", attrs, body), nil
}

func detailImagePreloads(vm *Object) string {
	seen := map[string]bool{}
	var out strings.Builder
	for _, field := range objectList(read(vm, "fields")) {
		display := object(read(field, "display"))
		if display == nil || stringAt(display, "kind") != "image" {
			continue
		}
		src := stringAt(display, "src")
		if src == "" || strings.HasPrefix(strings.ToLower(src), "data:") || seen[src] {
			continue
		}
		seen[src] = true
		out.WriteString("<link" + attrs(NewObject("rel", "preload", "as", "image", "href", src), false, false) + "/>")
	}
	return out.String()
}
