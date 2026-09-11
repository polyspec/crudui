package generator

import (
	"github.com/polyspec/crudui/packages/validator-go/validator/expr"
	"regexp"
	"strings"
)

func evalCondition(s string, data map[string]any, path []string) bool {
	v, e := expr.Evaluate(s, data, path)
	return e == nil && v
}
func conditionMap(o *Object, data map[string]any, path []string) any {
	for _, k := range o.Keys() {
		if k != "true" && evalCondition(k, data, path) {
			return read(o, k)
		}
	}
	if o.Has("true") {
		return read(o, "true")
	}
	return nil
}
func evalShow(v any, data map[string]any, path []string) bool {
	if v == nil || isAbsent(v) {
		return true
	}
	if o := object(v); o != nil {
		return truthy(conditionMap(o, data, path))
	}
	if s, ok := v.(string); ok {
		return evalCondition(s, data, path)
	}
	return truthy(v)
}

var ternaryTextRE = regexp.MustCompile(`\?[^:]*:`)

func evalAppearance(v any, data map[string]any, path []string) string {
	if v == nil || isAbsent(v) {
		return ""
	}
	if o := object(v); o != nil {
		x := conditionMap(o, data, path)
		if x == nil || isAbsent(x) {
			return ""
		}
		return jsString(x)
	}
	s, ok := v.(string)
	if !ok {
		return jsString(v)
	}
	if ast, e := expr.Parse(s); e == nil {
		if _, ok := ast.(*expr.TernaryNode); ok {
			x, _ := expr.EvaluateValue(s, data, path)
			if x == nil {
				return ""
			}
			return jsString(x)
		}
	}
	if expr.IsConditionExpression(s) && !ternaryTextRE.MatchString(s) {
		x, e := expr.EvaluateValue(s, data, path)
		if e != nil || x == nil || x == false {
			return ""
		}
		return jsString(x)
	}
	return s
}
func resolveNode(v any, data map[string]any, path []string) *Object {
	return NewObject("class", evalAppearance(read(v, "class"), data, path), "style", evalAppearance(read(v, "style"), data, path))
}
func resolveDesign(v any, data map[string]any, path []string) *Object {
	d := NewObject("show", true, "main", NewObject("class", "", "style", ""))
	for _, k := range []string{"label", "wrapper", "group", "prepend"} {
		d.Set(k, NewObject("class", "", "style", ""))
	}
	if object(v) == nil {
		return d
	}
	d.Set("show", evalShow(read(v, "show"), data, path))
	d.Set("main", resolveNode(v, data, path))
	for _, k := range []string{"label", "wrapper", "group", "prepend"} {
		d.Set(k, resolveNode(read(v, k), data, path))
	}
	return d
}
func nodeClass(design *Object, node string) string { return stringAt(read(design, node), "class") }
func nodeStyle(design *Object, node string) string { return stringAt(read(design, node), "style") }
func wrapperStyle(design *Object) string {
	s := ""
	if !truthy(read(design, "show")) {
		s = "display: none"
	}
	if extra := strings.TrimSpace(nodeStyle(design, "wrapper")); extra != "" {
		if s != "" {
			s += "; "
		}
		s += extra
	}
	return s
}
