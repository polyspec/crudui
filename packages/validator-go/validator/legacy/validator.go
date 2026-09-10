package legacy

import (
	"sort"
	"strconv"
	"strings"
)

// Validator is the main validator struct
type Validator struct {
	spec            Spec
	rules           map[string]RuleFunc
	conditionParser *ConditionParser
}

// ruleMode controls which rules apply in a validation pass.
type ruleMode int

const (
	// ruleModeAll applies every rule (scalar fields, group-level rules).
	ruleModeAll ruleMode = iota
	// ruleModeArray applies only array-level rules to a multiple field's array.
	ruleModeArray
	// ruleModeItem applies only item-level rules to each array element.
	ruleModeItem
)

// arrayLevelRules operate on the whole array of a multiple field,
// never on its individual items.
var arrayLevelRules = map[string]bool{
	"required": true,
	"mincount": true,
	"maxcount": true,
	"unique":   true,
}

// pathReferenceRules receive raw path strings as parameters; their string
// params are never evaluated as condition expressions.
var pathReferenceRules = map[string]bool{
	"equalTo":  true,
	"notEqual": true,
	"enddate":  true,
}

// literalParamRules receive literal strings (regex patterns, accept lists) as
// parameters; their string params are never treated as condition expressions
// (ternary expressions are still evaluated). An accept param such as ".jpg"
// starts with a dot and would otherwise be misread as a relative field
// reference and the rule skipped.
var literalParamRules = map[string]bool{
	"match":   true,
	"pattern": true,
	"accept":  true,
}

// ruleEntry is a rule name/param pair in declaration order.
type ruleEntry struct {
	name  string
	param interface{}
}

// NewValidator creates a new validator instance
func NewValidator(spec Spec) *Validator {
	return &Validator{
		spec:            spec,
		rules:           DefaultRules(),
		conditionParser: NewConditionParser(),
	}
}

// Validate validates all data against the spec
func (v *Validator) Validate(data map[string]interface{}) *ValidationResult {
	result := &ValidationResult{
		IsValid: true,
		Errors:  []ValidationError{},
	}

	v.validateFields(v.spec.Fields, data, data, []string{}, result)

	return result
}

// ValidateField validates a single field
func (v *Validator) ValidateField(path string, value interface{}, allData map[string]interface{}) *string {
	pathParts := StringToPath(path)

	field := v.findFieldByPath(pathParts)
	if field == nil {
		return nil // No field definition found, skip validation
	}

	result := &ValidationResult{IsValid: true, Errors: []ValidationError{}}
	v.validateFieldRules(field, value, pathParts, allData, result, ruleModeAll)
	if len(result.Errors) > 0 {
		msg := result.Errors[0].Message
		return &msg
	}
	return nil
}

// AddRule adds a custom validation rule
func (v *Validator) AddRule(name string, fn RuleFunc) {
	v.rules[name] = fn
}

// validateFields recursively validates fields in spec declaration order.
// data: current scope data for value access
// rootData: full form data for condition evaluation
func (v *Validator) validateFields(fields []Field, data map[string]interface{}, rootData map[string]interface{}, currentPath []string, result *ValidationResult) {
	for i := range fields {
		field := &fields[i]
		fieldPath := AppendToPath(currentPath, field.Name)

		var value interface{}
		if data != nil {
			value = data[field.Name]
		}

		// Skip hidden fields (display_switch / display_target)
		if !v.shouldDisplay(field, rootData, fieldPath) {
			continue
		}

		// Group fields (have nested properties)
		if len(field.Fields) > 0 {
			v.validateGroupField(field, value, fieldPath, rootData, result)
			continue
		}

		// Multiple leaf field with array data: array-level rules first,
		// then item-level rules per element.
		if field.Multiple {
			if arr, ok := value.([]interface{}); ok {
				if !v.validateFieldRules(field, arr, fieldPath, rootData, result, ruleModeArray) {
					for idx, item := range arr {
						itemPath := AppendToPath(fieldPath, strconv.Itoa(idx))
						v.validateFieldRules(field, item, itemPath, rootData, result, ruleModeItem)
					}
				}
				continue
			}
			// Non-array data on a multiple field falls through to normal validation
		}

		v.validateFieldRules(field, value, fieldPath, rootData, result, ruleModeAll)
	}
}

// validateGroupField validates a group field (nested, repeatable, or "only").
func (v *Validator) validateGroupField(field *Field, value interface{}, fieldPath []string, rootData map[string]interface{}, result *ValidationResult) {
	switch {
	case field.MultipleOnly:
		// "only" mode: single object treated like an array for wildcards
		if m, ok := value.(map[string]interface{}); ok {
			v.validateFields(field.Fields, m, rootData, fieldPath, result)
		}
		v.validateFieldRules(field, value, fieldPath, rootData, result, ruleModeAll)

	case field.Multiple:
		if arr, ok := value.([]interface{}); ok {
			// Repeatable group (array of objects)
			for idx, item := range arr {
				itemMap, _ := item.(map[string]interface{})
				if itemMap == nil {
					itemMap = map[string]interface{}{}
				}
				itemPath := AppendToPath(fieldPath, strconv.Itoa(idx))
				v.validateFields(field.Fields, itemMap, rootData, itemPath, result)
			}
			v.validateFieldRules(field, value, fieldPath, rootData, result, ruleModeAll)
		} else if m, ok := value.(map[string]interface{}); ok {
			// Repeatable group stored as object with unique keys
			keys := make([]string, 0, len(m))
			for k := range m {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, k := range keys {
				itemMap, _ := m[k].(map[string]interface{})
				if itemMap == nil {
					itemMap = map[string]interface{}{}
				}
				v.validateFields(field.Fields, itemMap, rootData, AppendToPath(fieldPath, k), result)
			}
			v.validateFieldRules(field, value, fieldPath, rootData, result, ruleModeAll)
		}
		// Mismatched data shape: skip validation

	default:
		// Single nested group: validate children even when the group data
		// is missing, so required rules inside still apply.
		m, _ := value.(map[string]interface{})
		if m == nil {
			m = map[string]interface{}{}
		}
		v.validateFields(field.Fields, m, rootData, fieldPath, result)
		v.validateFieldRules(field, value, fieldPath, rootData, result, ruleModeAll)
	}
}

// validateFieldRules applies a field's rules in declaration order,
// stopping at the first error. Reports whether an error was recorded.
func (v *Validator) validateFieldRules(field *Field, value interface{}, fieldPath []string, rootData map[string]interface{}, result *ValidationResult, mode ruleMode) bool {
	pathStr := PathToString(fieldPath)

	// For number type fields, implicitly run number validation first
	// if there's no explicit number rule (to catch invalid numbers before min/max)
	if mode != ruleModeArray && field.Type == "number" && !v.hasRule(field, "number") && !isEmpty(value) {
		_, isArr := value.([]interface{})
		_, isMap := value.(map[string]interface{})
		if !isArr && !isMap {
			if numberRule := v.rules["number"]; numberRule != nil {
				ctx := &ValidationContext{CurrentPath: fieldPath, FormData: rootData, FieldDef: field}
				if errMsg := numberRule(value, nil, rootData, ctx); errMsg != nil {
					result.IsValid = false
					result.Errors = append(result.Errors, ValidationError{
						Field:   pathStr,
						Rule:    "number",
						Message: v.getErrorMessage(field, "number", *errMsg, nil),
						Value:   value,
					})
					return true
				}
			}
		}
	}

	for _, entry := range v.orderedRules(field) {
		if mode == ruleModeArray && !arrayLevelRules[entry.name] {
			continue
		}
		if mode == ruleModeItem && arrayLevelRules[entry.name] {
			continue
		}

		errMsg, params := v.applyRule(entry.name, entry.param, value, fieldPath, rootData, field)
		if errMsg != nil {
			result.IsValid = false
			result.Errors = append(result.Errors, ValidationError{
				Field:   pathStr,
				Rule:    entry.name,
				Message: v.getErrorMessage(field, entry.name, *errMsg, params),
				Value:   value,
			})
			return true // Stop at first error for this field
		}
	}

	return false
}

// applyRule applies a single validation rule.
// String parameters are evaluated first: ternary expressions yield their
// branch value, and a false condition expression skips the rule.
func (v *Validator) applyRule(ruleName string, ruleParam interface{}, value interface{}, fieldPath []string, rootData map[string]interface{}, field *Field) (*string, []string) {
	if s, ok := ruleParam.(string); ok && !pathReferenceRules[ruleName] {
		// Regex-param rules (match/pattern) may contain "?:" sequences;
		// only space-delimited ternaries count as expressions for them.
		isTernary := IsTernaryExpression(s)
		if literalParamRules[ruleName] {
			isTernary = isTernary && strings.Contains(s, " ? ") && strings.Contains(s, " : ")
		}
		if isTernary {
			resolved := v.conditionParser.EvaluateTernaryString(s, rootData, fieldPath)
			if resolved == nil {
				return nil, nil
			}
			if b, ok := resolved.(bool); ok && !b {
				return nil, nil
			}
			ruleParam = resolved
		} else if !literalParamRules[ruleName] && IsConditionExpression(s) {
			conditionMet, err := v.conditionParser.Evaluate(s, rootData, fieldPath)
			if err != nil || !conditionMet {
				return nil, nil // Condition not met (or invalid), skip this rule
			}
			ruleParam = true
		}
	}

	// Skip if rule param is explicitly false
	if b, ok := ruleParam.(bool); ok && !b {
		return nil, nil
	}

	// For non-required fields, skip validation if value is empty.
	// mincount still applies to empty arrays (count 0).
	if ruleName != "required" && ruleName != "mincount" && isEmpty(value) {
		return nil, nil
	}

	ruleFn, ok := v.rules[ruleName]
	if !ok {
		// Check if it's a custom rule defined in the spec
		if customRule, ok := v.spec.Rules[ruleName]; ok {
			ctx := &ValidationContext{CurrentPath: fieldPath, FormData: rootData, FieldDef: field}
			return v.applyCustomRule(&customRule, value, rootData, ctx), nil
		}
		return nil, nil // Unknown rule, skip
	}

	ctx := &ValidationContext{CurrentPath: fieldPath, FormData: rootData, FieldDef: field}
	params := parseRuleParams(ruleParam)
	return ruleFn(value, params, rootData, ctx), params
}

// orderedRules returns a field's rules in declaration order.
// Without declaration order info, required comes first and the remaining
// rules follow alphabetically (deterministic fallback).
func (v *Validator) orderedRules(field *Field) []ruleEntry {
	var entries []ruleEntry
	seen := map[string]bool{}

	appendRule := func(name string) {
		if seen[name] {
			return
		}
		if param, ok := field.Rules[name]; ok {
			entries = append(entries, ruleEntry{name: name, param: param})
			seen[name] = true
		}
	}

	if field.Rules != nil {
		for _, name := range field.RuleOrder {
			appendRule(name)
		}

		if len(seen) < len(field.Rules) {
			appendRule("required")
			rest := make([]string, 0, len(field.Rules))
			for name := range field.Rules {
				if !seen[name] {
					rest = append(rest, name)
				}
			}
			sort.Strings(rest)
			for _, name := range rest {
				appendRule(name)
			}
		}
	}

	// Legacy top-level required attribute
	if field.Required != nil && !seen["required"] {
		entries = append([]ruleEntry{{name: "required", param: field.Required}}, entries...)
	}

	return entries
}

// hasRule reports whether the field declares a rule.
func (v *Validator) hasRule(field *Field, name string) bool {
	if field.Rules == nil {
		return false
	}
	_, ok := field.Rules[name]
	return ok
}

// shouldDisplay evaluates display_switch / display_target.
// display_switch semantics: condition string evaluated against form data;
// boolean false means always hidden (validation skipped), true always shown.
func (v *Validator) shouldDisplay(field *Field, rootData map[string]interface{}, fieldPath []string) bool {
	switch ds := field.DisplaySwitch.(type) {
	case nil:
		// Not set: visible
	case bool:
		if !ds {
			return false
		}
	case string:
		if ds != "" {
			visible, err := v.conditionParser.Evaluate(ds, rootData, fieldPath)
			if err != nil || !visible {
				return false
			}
		}
	default:
		if !isTruthy(field.DisplaySwitch) {
			return false
		}
	}

	if field.DisplayTarget != "" {
		target := v.resolveFieldReference(field.DisplayTarget, fieldPath, rootData)
		switch tv := target.(type) {
		case nil:
			return false
		case string:
			if tv == "" {
				return false
			}
		case bool:
			if !tv {
				return false
			}
		case []interface{}:
			if len(tv) == 0 {
				return false
			}
		case map[string]interface{}:
			if len(tv) == 0 {
				return false
			}
		}
	}

	return true
}

// resolveFieldReference resolves a field reference for display_target.
// Dot-prefixed references resolve relative to the current path; bare names
// resolve as siblings first, then from the root.
func (v *Validator) resolveFieldReference(ref string, fieldPath []string, rootData map[string]interface{}) interface{} {
	if strings.HasPrefix(ref, ".") {
		value, err := v.conditionParser.EvaluateValue(ref, rootData, fieldPath)
		if err != nil {
			return nil
		}
		return value
	}

	segments := StringToPath(ref)
	if len(fieldPath) > 0 {
		sibling := append(append([]string{}, fieldPath[:len(fieldPath)-1]...), segments...)
		if value := getNestedValue(rootData, sibling); value != nil {
			return value
		}
	}
	return getNestedValue(rootData, segments)
}

// applyCustomRule applies a custom rule from spec
func (v *Validator) applyCustomRule(rule *Rule, value interface{}, allData map[string]interface{}, ctx *ValidationContext) *string {
	// Pattern matching
	if rule.Pattern != "" {
		matchRule := v.rules["match"]
		if matchRule != nil {
			errMsg := matchRule(value, []string{rule.Pattern}, allData, ctx)
			if errMsg != nil {
				if rule.Message != "" {
					return &rule.Message
				}
				return errMsg
			}
		}
	}

	// Min value
	if rule.Min != nil {
		minRule := v.rules["min"]
		if minRule != nil {
			errMsg := minRule(value, []string{strconv.Itoa(*rule.Min)}, allData, ctx)
			if errMsg != nil {
				if rule.Message != "" {
					return &rule.Message
				}
				return errMsg
			}
		}
	}

	// Max value
	if rule.Max != nil {
		maxRule := v.rules["max"]
		if maxRule != nil {
			errMsg := maxRule(value, []string{strconv.Itoa(*rule.Max)}, allData, ctx)
			if errMsg != nil {
				if rule.Message != "" {
					return &rule.Message
				}
				return errMsg
			}
		}
	}

	return nil
}

// parseRuleParams parses parameters from a rule value.
// String values stay intact (regex patterns may contain ':' or ',').
func parseRuleParams(ruleValue interface{}) []string {
	switch val := ruleValue.(type) {
	case bool:
		return nil
	case int:
		return []string{strconv.Itoa(val)}
	case int64:
		return []string{strconv.FormatInt(val, 10)}
	case float64:
		return []string{strconv.FormatFloat(val, 'f', -1, 64)}
	case string:
		return []string{val}
	case []interface{}:
		var params []string
		for _, item := range val {
			params = append(params, toString(item))
		}
		return params
	case []string:
		return val
	default:
		return nil
	}
}

// getErrorMessage resolves the final error message for a rule failure.
// Custom field messages override defaults; {0}, {1}, ... placeholders are
// substituted with rule parameters.
func (v *Validator) getErrorMessage(field *Field, ruleName string, defaultMsg string, params []string) string {
	msg := defaultMsg
	if field.Messages != nil {
		if custom, ok := field.Messages[ruleName]; ok {
			msg = custom
		}
	}
	for i, p := range params {
		msg = strings.ReplaceAll(msg, "{"+strconv.Itoa(i)+"}", p)
	}
	return msg
}

// findFieldByPath finds a field definition by path
func (v *Validator) findFieldByPath(path []string) *Field {
	if len(path) == 0 {
		return nil
	}

	return v.findFieldInList(v.spec.Fields, path, 0)
}

// findFieldInList recursively finds a field in a list
func (v *Validator) findFieldInList(fields []Field, path []string, depth int) *Field {
	if depth >= len(path) {
		return nil
	}

	targetName := path[depth]

	// Skip numeric indices (array elements)
	if _, err := strconv.Atoi(targetName); err == nil {
		if depth+1 < len(path) {
			// Continue searching in the same fields (for repeatable groups)
			return v.findFieldInList(fields, path, depth+1)
		}
		return nil
	}

	for i := range fields {
		field := &fields[i]
		if field.Name == targetName {
			if depth == len(path)-1 {
				return field
			}
			if field.Fields != nil {
				return v.findFieldInList(field.Fields, path, depth+1)
			}
		}
	}

	return nil
}

// getNestedValue retrieves a nested value from data by path.
func getNestedValue(data map[string]interface{}, path []string) interface{} {
	if len(path) == 0 {
		return data
	}

	var current interface{} = data
	for _, segment := range path {
		if current == nil {
			return nil
		}

		switch v := current.(type) {
		case map[string]interface{}:
			current = v[segment]
		case []interface{}:
			idx, err := strconv.Atoi(segment)
			if err != nil || idx < 0 || idx >= len(v) {
				return nil
			}
			current = v[idx]
		default:
			return nil
		}
	}

	return current
}

// GetSpec returns the spec
func (v *Validator) GetSpec() Spec {
	return v.spec
}

// GetRules returns the registered rules
func (v *Validator) GetRules() map[string]RuleFunc {
	return v.rules
}
