package validate

// Rule parameter checks (docs/spec/validation-rules.md, Parameter errors).
//
// A parameter outside its rule's definition is a load failure located at the
// field's declaration path (property names without row keys). Parameters are
// checked when the specification loads, after composition and the forbidden-key
// scan, fields in declaration order (a group before its children) and each
// field's rules in declaration order, including every literal a condition map or
// a ternary can select. A value a condition takes from the data is checked when
// it is selected, before the empty-value skip.

import (
	"strconv"

	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
	"github.com/polyspec/crudui/packages/validator-go/validator/expr"
)

// parameterError is a rule parameter outside its definition.
type parameterError struct {
	code    compose.ComposeErrorCode
	message string
}

// ruleParameterError returns an INVALID_RULE_PARAMETER error.
func ruleParameterError(message string) *parameterError {
	return &parameterError{code: compose.InvalidRuleParameter, message: message}
}

// loadError returns the load failure of a parameter error at a declaration path.
func (e *parameterError) loadError(declaration []string) *compose.ComposeLoadError {
	return &compose.ComposeLoadError{Code: e.code, Message: e.message, Trace: append([]string{}, declaration...)}
}

// disablesRule reports a resolved parameter that disables its rule.
func disablesRule(param any) bool {
	b, isBool := param.(bool)
	return param == nil || (isBool && !b)
}

// checkParameter checks a resolved parameter of a rule and returns its
// parameter error. Pattern parameters are compiled once into v.patterns.
func (v *Validator) checkParameter(rule string, param any) *parameterError {
	if disablesRule(param) {
		return nil
	}
	switch rule {
	case "minlength", "maxlength":
		return checkLengthLimit(rule, param)
	case "rangelength":
		return checkLengthRange(param)
	case "number", "digits", "min", "max", "range", "step", "mincount", "maxcount":
		return checkNumericParameter(rule, param)
	case "in":
		return checkIn(param)
	case "match", "pattern":
		source, ok := param.(string)
		if !ok {
			return ruleParameterError("Invalid " + rule + " parameter: expected a pattern string")
		}
		if _, done := v.patterns[source]; done {
			return nil
		}
		matcher, perr := compilePattern(source)
		if perr != nil {
			return &parameterError{
				code:    compose.InvalidRulePattern,
				message: "Invalid " + rule + " pattern: " + perr.reason + " at " + strconv.Itoa(perr.offset),
			}
		}
		v.patterns[source] = matcher
	}
	return nil
}

// checkDeclarations checks the declared parameters of a properties map in
// declaration order: each literal parameter, and each literal a condition can
// select. Values a condition takes from the data are left for runRule.
func (v *Validator) checkDeclarations(properties *compose.OMap, declaration []string) error {
	for _, name := range properties.Keys() {
		raw, _ := properties.Get(name)
		field, ok := raw.(*compose.OMap)
		if !ok || field == nil {
			continue
		}
		path := appendPath(declaration, name)
		if rules := normalizeValidateSlot(field); rules != nil {
			for _, rule := range rules.Keys() {
				param, _ := rules.Get(rule)
				for _, literal := range selectableLiterals(rule, param) {
					if perr := v.checkParameter(rule, literal); perr != nil {
						return perr.loadError(path)
					}
				}
			}
		}
		if children := childProperties(field); fieldType(field) == "group" && children != nil {
			if err := v.checkDeclarations(children, path); err != nil {
				return err
			}
		}
	}
	return nil
}

// selectableLiterals returns the literal parameters a rule value can resolve to:
// the value itself when it is not conditional, every value of a condition map,
// and every literal branch of a ternary, through nested ternaries. Branches that
// take their value from the data, and plain condition expressions, contribute
// nothing.
func selectableLiterals(rule string, param any) []any {
	if !isConditionalRuleValue(rule, param) {
		return []any{param}
	}
	switch value := param.(type) {
	case *compose.OMap:
		literals := make([]any, 0, value.Len())
		for _, key := range value.Keys() {
			selected, _ := value.Get(key)
			literals = append(literals, selected)
		}
		return literals
	case string:
		if node, ok := parseTernary(value); ok {
			return ternaryLiterals(node, nil)
		}
	}
	return nil
}

// ternaryLiterals appends the literal branch values of a ternary node.
func ternaryLiterals(node expr.Node, literals []any) []any {
	switch n := node.(type) {
	case *expr.TernaryNode:
		literals = ternaryLiterals(n.TrueValue, literals)
		return ternaryLiterals(n.FalseValue, literals)
	case *expr.GroupNode:
		return ternaryLiterals(n.Expression, literals)
	case *expr.LiteralNode:
		return append(literals, n.Value)
	}
	return literals
}

// patternFor returns the matcher of a checked pattern parameter.
func (v *Validator) patternFor(source string) *patternMatcher {
	return v.patterns[source]
}
