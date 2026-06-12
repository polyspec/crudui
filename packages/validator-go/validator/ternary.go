package validator

import (
	"regexp"
	"strconv"
	"strings"
)

var (
	ternaryRe     = regexp.MustCompile(`\?[^:]*:`)
	conditionOpRe = regexp.MustCompile(`(==|!=|>=|<=|>|<|\s+in\s+|\s+not\s+in\s+)`)
)

// IsTernaryExpression reports whether a string contains a top-level
// "cond ? a : b" ternary form.
func IsTernaryExpression(value string) bool {
	return ternaryRe.MatchString(value)
}

// IsConditionExpression reports whether a string looks like a condition
// expression (leading dot path reference or comparison operators).
// Ternary expressions are excluded; evaluate those with EvaluateTernaryString.
func IsConditionExpression(value string) bool {
	if IsTernaryExpression(value) {
		return false
	}
	return strings.HasPrefix(value, ".") || conditionOpRe.MatchString(value)
}

// EvaluateTernaryString evaluates a "cond ? a : b" expression textually.
// The condition is evaluated with the condition parser; the chosen branch is
// returned as a literal value (number/bool/null/string) without re-parsing,
// so branches may contain arbitrary text such as regex patterns.
func (cp *ConditionParser) EvaluateTernaryString(expression string, formData map[string]interface{}, currentPath []string) interface{} {
	expression = strings.TrimSpace(expression)

	questionPos := findTernaryOperator(expression, '?', 0)
	if questionPos == -1 {
		// Not a ternary: evaluate as a regular condition
		result, err := cp.Evaluate(expression, formData, currentPath)
		if err != nil {
			return nil
		}
		return result
	}

	colonPos := findTernaryOperator(expression, ':', questionPos+1)
	if colonPos == -1 {
		return nil // malformed ternary
	}

	condition := strings.TrimSpace(expression[:questionPos])
	trueValue := strings.TrimSpace(expression[questionPos+1 : colonPos])
	falseValue := strings.TrimSpace(expression[colonPos+1:])

	conditionResult, err := cp.Evaluate(condition, formData, currentPath)
	if err != nil {
		conditionResult = false
	}

	resultExpr := falseValue
	if conditionResult {
		resultExpr = trueValue
	}

	// Nested ternary
	if IsTernaryExpression(resultExpr) {
		return cp.EvaluateTernaryString(resultExpr, formData, currentPath)
	}

	return parseTernaryBranchValue(resultExpr)
}

// findTernaryOperator finds the position of a top-level '?' or ':',
// respecting quotes, parentheses/brackets, and nested ternaries.
func findTernaryOperator(expression string, operator byte, startPos int) int {
	depth := 0
	inQuote := false
	var quoteChar byte
	ternaryDepth := 0

	for i := startPos; i < len(expression); i++ {
		ch := expression[i]

		// Handle quotes
		if (ch == '"' || ch == '\'') && !inQuote {
			inQuote = true
			quoteChar = ch
		} else if inQuote && ch == quoteChar {
			inQuote = false
			quoteChar = 0
		}

		if inQuote {
			continue
		}

		switch ch {
		case '(', '[':
			depth++
		case ')', ']':
			depth--
		case '?':
			if depth == 0 {
				if operator == '?' {
					return i
				}
				ternaryDepth++
			}
		case ':':
			if depth == 0 && operator == ':' {
				if ternaryDepth == 0 {
					return i
				}
				ternaryDepth--
			}
		}
	}

	return -1
}

// parseTernaryBranchValue parses a ternary branch as a literal value.
func parseTernaryBranchValue(value string) interface{} {
	value = strings.TrimSpace(value)

	// Bracket-enclosed list (e.g., [US, CA, UK])
	if len(value) >= 2 && strings.HasPrefix(value, "[") && strings.HasSuffix(value, "]") {
		inner := strings.TrimSpace(value[1 : len(value)-1])
		parts := splitValueList(inner)
		result := make([]interface{}, 0, len(parts))
		for _, p := range parts {
			result = append(result, parseTernaryBranchValue(p))
		}
		return result
	}

	// Quoted strings
	if len(value) >= 2 {
		first := value[0]
		last := value[len(value)-1]
		if (first == '"' && last == '"') || (first == '\'' && last == '\'') {
			return value[1 : len(value)-1]
		}
	}

	// Comma-separated list (without brackets)
	if strings.Contains(value, ",") && !strings.Contains(value, "[") {
		parts := splitValueList(value)
		result := make([]interface{}, 0, len(parts))
		for _, p := range parts {
			result = append(result, parseTernaryBranchValue(p))
		}
		return result
	}

	switch value {
	case "true":
		return true
	case "false":
		return false
	case "null":
		return nil
	}

	if num, err := strconv.ParseFloat(value, 64); err == nil {
		return num
	}

	return value
}

// splitValueList splits a comma-separated value list respecting quotes.
func splitValueList(value string) []string {
	var parts []string
	var sb strings.Builder
	inQuote := false
	var quoteChar byte

	for i := 0; i < len(value); i++ {
		ch := value[i]
		if (ch == '"' || ch == '\'') && !inQuote {
			inQuote = true
			quoteChar = ch
		} else if inQuote && ch == quoteChar {
			inQuote = false
			quoteChar = 0
		}

		if ch == ',' && !inQuote {
			parts = append(parts, strings.TrimSpace(sb.String()))
			sb.Reset()
			continue
		}
		sb.WriteByte(ch)
	}
	parts = append(parts, strings.TrimSpace(sb.String()))
	return parts
}
