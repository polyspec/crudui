package validate

// Membership rule in (docs/spec/validation-rules.md, Values).
//
// Members come from a list (each element as is), a comma-separated string (split
// at U+002C, each item trimmed) or a map (its keys); list elements and map keys
// are read as written. A value matches a member when
// their canonical texts are the same code points, or when both are numeric with
// equal values.

import (
	"strings"

	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
)

// member is one membership value: its canonical text and, when it is numeric,
// its value.
type member struct {
	text    string
	number  float64
	numeric bool
}

// newMember builds the member of a scalar value as written (a string is numeric
// only when it is numeric text without surrounding whitespace); false when the
// value is not a string, a finite number or a boolean.
func newMember(value any) (member, bool) {
	text, ok := canonicalText(value)
	if !ok {
		return member{}, false
	}
	m := member{text: text}
	if s, ok := value.(string); ok {
		m.number, m.numeric = numericText(s)
	} else {
		m.number, m.numeric = finiteNumber(value)
	}
	return m, true
}

// inMembers returns the members of an in parameter, or its parameter error.
func inMembers(param any) ([]member, *parameterError) {
	var raw []any
	switch p := param.(type) {
	case []any:
		raw = p
	case string:
		for _, item := range strings.Split(p, ",") {
			raw = append(raw, trimText(item))
		}
	case *compose.OMap:
		for _, key := range p.Keys() {
			raw = append(raw, key)
		}
	case map[string]any:
		for _, key := range sortedKeys(p) {
			raw = append(raw, key)
		}
	default:
		return nil, ruleParameterError("Invalid in parameter: expected a list, a comma-separated string or a map")
	}
	if len(raw) == 0 {
		return nil, ruleParameterError("Invalid in parameter: members must not be empty")
	}
	members := make([]member, 0, len(raw))
	for _, value := range raw {
		m, ok := newMember(value)
		if !ok {
			return nil, ruleParameterError("Invalid in parameter: members must be strings, numbers or booleans")
		}
		if trimText(m.text) == "" {
			return nil, ruleParameterError("Invalid in parameter: members must not be empty")
		}
		members = append(members, m)
	}
	return members, nil
}

// checkIn returns the parameter error of an in parameter.
func checkIn(param any) *parameterError {
	_, err := inMembers(param)
	return err
}

// inMatches reports whether a value is a member. A string value is trimmed; an
// array value matches when every element matches, where an empty element
// (including an empty array or object) passes as an empty value does and any
// other array or object element fails, having no canonical text.
func inMatches(value any, members []member) bool {
	if elements, ok := value.([]any); ok {
		for _, element := range elements {
			if !isEmpty(element) && !scalarMatches(element, members) {
				return false
			}
		}
		return true
	}
	return scalarMatches(value, members)
}

// scalarMatches reports whether a scalar value is a member; a value without
// canonical text is not.
func scalarMatches(value any, members []member) bool {
	if s, ok := value.(string); ok {
		value = trimText(s)
	}
	candidate, ok := newMember(value)
	if !ok {
		return false
	}
	for _, m := range members {
		if candidate.text == m.text || (candidate.numeric && m.numeric && candidate.number == m.number) {
			return true
		}
	}
	return false
}

// ruleIn fails a value that is not a member. Empty values pass.
func ruleIn(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if isEmpty(value) {
		return "", false
	}
	members, _ := inMembers(ruleParam)
	if inMatches(value, members) {
		return "", false
	}
	return ctx.msg("in", "Please select a valid option."), true
}
