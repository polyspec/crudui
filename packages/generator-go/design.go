package generator

import (
	"github.com/polyspec/crudui/packages/validator-go/validator/expr"
	"regexp"
)

func evalCondition(s string, data map[string]any, path []string, rowKeys []int) bool {
	v, e := expr.Evaluate(s, data, path, rowKeys)
	return e == nil && v
}
func conditionMap(o *Object, data map[string]any, path []string, rowKeys []int) any {
	for _, k := range o.Keys() {
		if k != "true" && evalCondition(k, data, path, rowKeys) {
			return read(o, k)
		}
	}
	if o.Has("true") {
		return read(o, "true")
	}
	return nil
}

// evalShow resolves design.show like the validators resolve a conditional
// parameter in the row context: a condition map selects its value, a ternary its
// branch and a condition expression that parses completely its result; any
// other string is a literal.
// Only a resolved false hides; a missing show, a map that selects nothing and a
// literal string are visible.
func evalShow(v any, data map[string]any, path []string, rowKeys []int) bool {
	if v == nil || isAbsent(v) {
		return true
	}
	return resolveParameter(v, data, path, rowKeys) != false
}

// resolveParameter resolves a conditional parameter value.
func resolveParameter(v any, data map[string]any, path []string, rowKeys []int) any {
	if o := object(v); o != nil {
		return conditionMap(o, data, path, rowKeys)
	}
	s, ok := v.(string)
	if !ok {
		return v
	}
	if ast, e := expr.Parse(s); e == nil {
		if _, ok := ast.(*expr.TernaryNode); ok {
			x, _ := expr.EvaluateValue(s, data, path, rowKeys)
			return x
		}
	}
	if _, e := expr.Parse(s); e == nil && expr.IsConditionExpression(s) && !ternaryTextRE.MatchString(s) {
		x, _ := expr.EvaluateValue(s, data, path, rowKeys)
		return x
	}
	return s
}

// evalFlag resolves a boolean flag such as a list column's sortable: a
// condition map that selects nothing, and a failed condition, are false.
func evalFlag(v any, data map[string]any, path []string, rowKeys []int) bool {
	if o := object(v); o != nil {
		return truthy(conditionMap(o, data, path, rowKeys))
	}
	if s, ok := v.(string); ok {
		return evalCondition(s, data, path, rowKeys)
	}
	return truthy(v)
}

var ternaryTextRE = regexp.MustCompile(`\?[^:]*:`)

// evalAppearance resolves an appearance setting such as design.class: a
// condition map selects its value, a ternary its branch and a condition
// expression that parses completely its result; any other string is literal text.
func evalAppearance(v any, data map[string]any, path []string, rowKeys []int) string {
	if v == nil || isAbsent(v) {
		return ""
	}
	if o := object(v); o != nil {
		x := conditionMap(o, data, path, rowKeys)
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
			x, _ := expr.EvaluateValue(s, data, path, rowKeys)
			if x == nil {
				return ""
			}
			return jsString(x)
		}
	}
	if _, e := expr.Parse(s); e == nil && expr.IsConditionExpression(s) && !ternaryTextRE.MatchString(s) {
		x, e := expr.EvaluateValue(s, data, path, rowKeys)
		if e != nil || x == nil || x == false {
			return ""
		}
		return jsString(x)
	}
	return s
}
func resolveNode(v any, data map[string]any, path []string, rowKeys []int) *Object {
	return NewObject("class", evalAppearance(read(v, "class"), data, path, rowKeys), "style", evalAppearance(read(v, "style"), data, path, rowKeys))
}
func resolveDesign(v any, data map[string]any, path []string, rowKeys []int) *Object {
	d := NewObject("show", true, "main", NewObject("class", "", "style", ""))
	for _, k := range []string{"label", "wrapper", "group", "prepend"} {
		d.Set(k, NewObject("class", "", "style", ""))
	}
	if object(v) == nil {
		return d
	}
	d.Set("show", evalShow(read(v, "show"), data, path, rowKeys))
	d.Set("main", resolveNode(v, data, path, rowKeys))
	for _, k := range []string{"label", "wrapper", "group", "prepend"} {
		d.Set(k, resolveNode(read(v, k), data, path, rowKeys))
	}
	return d
}
func nodeClass(design *Object, node string) string { return stringAt(read(design, node), "class") }
func nodeStyle(design *Object, node string) string { return stringAt(read(design, node), "style") }
