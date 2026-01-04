package validator

import (
	"strconv"
	"strings"
)

// Validator is the main validator struct
type Validator struct {
	spec            Spec
	rules           map[string]RuleFunc
	conditionParser *ConditionParser
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

	// Validate all fields defined in spec
	// Pass data twice: once as current scope data, once as root form data
	v.validateFields(v.spec.Fields, data, data, []string{}, result)

	return result
}

// ValidateField validates a single field
func (v *Validator) ValidateField(path string, value interface{}, allData map[string]interface{}) *string {
	pathParts := StringToPath(path)

	// Find the field definition
	field := v.findFieldByPath(pathParts)
	if field == nil {
		return nil // No field definition found, skip validation
	}

	ctx := &ValidationContext{
		CurrentPath: pathParts,
		FormData:    allData,
		FieldDef:    field,
	}

	// Check required
	if isRequired, condition := v.isFieldRequired(field, allData, pathParts); isRequired {
		if isEmpty(value) {
			msg := v.getErrorMessage(field, "required", "This field is required")
			return &msg
		}
	} else if condition != "" {
		// Conditional required that evaluated to false - skip if empty
		if isEmpty(value) {
			return nil
		}
	}

	// Skip other validations if empty and not required
	if isEmpty(value) {
		return nil
	}

	// For number type fields, implicitly run number validation first
	// if there's no explicit number rule (to catch invalid numbers before min/max)
	if field.Type == "number" {
		hasExplicitNumberRule := false
		if field.Rules != nil {
			_, hasExplicitNumberRule = field.Rules["number"]
		}
		if !hasExplicitNumberRule {
			numberRule := v.rules["number"]
			if numberRule != nil {
				errMsg := numberRule(value, nil, allData, ctx)
				if errMsg != nil {
					customMsg := v.getErrorMessage(field, "number", *errMsg)
					return &customMsg
				}
			}
		}
	}

	// Run all field rules
	if field.Rules != nil {
		for ruleName, ruleValue := range field.Rules {
			if ruleName == "required" {
				continue // Already handled above
			}

			errMsg := v.applyRule(ruleName, ruleValue, value, allData, ctx)
			if errMsg != nil {
				customMsg := v.getErrorMessage(field, ruleName, *errMsg)
				return &customMsg
			}
		}
	}

	return nil
}

// AddRule adds a custom validation rule
func (v *Validator) AddRule(name string, fn RuleFunc) {
	v.rules[name] = fn
}

// validateFields recursively validates fields
// data: current scope data for value access
// rootData: full form data for condition evaluation
func (v *Validator) validateFields(fields []Field, data map[string]interface{}, rootData map[string]interface{}, currentPath []string, result *ValidationResult) {
	for _, field := range fields {
		fieldPath := AppendToPath(currentPath, field.Name)
		value := v.getValueFromData(data, field.Name)

		// Handle repeatable/multiple groups
		if field.Multiple && field.Fields != nil {
			if arr, ok := value.([]interface{}); ok {
				for i, item := range arr {
					if itemMap, ok := item.(map[string]interface{}); ok {
						itemPath := AppendToPath(fieldPath, strconv.Itoa(i))
						v.validateFields(field.Fields, itemMap, rootData, itemPath, result)
					}
				}
			}
			continue
		}

		// Handle multiple: "only" mode (single object, but wildcards treat it like an array)
		if field.MultipleOnly && field.Fields != nil {
			if objData, ok := value.(map[string]interface{}); ok {
				// Validate as a regular nested group (no array index in path)
				v.validateFields(field.Fields, objData, rootData, fieldPath, result)
			}
			continue
		}

		// Handle nested groups
		if field.Fields != nil && len(field.Fields) > 0 {
			if nestedData, ok := value.(map[string]interface{}); ok {
				v.validateFields(field.Fields, nestedData, rootData, fieldPath, result)
			}
			continue
		}

		// Validate the field - use rootData for condition evaluation
		v.validateSingleField(&field, value, rootData, fieldPath, result)
	}
}

// validateSingleField validates a single field and adds errors to result
func (v *Validator) validateSingleField(field *Field, value interface{}, allData map[string]interface{}, fieldPath []string, result *ValidationResult) {
	ctx := &ValidationContext{
		CurrentPath: fieldPath,
		FormData:    allData,
		FieldDef:    field,
	}

	pathStr := PathToString(fieldPath)

	// Check required
	if isRequired, _ := v.isFieldRequired(field, allData, fieldPath); isRequired {
		if isEmpty(value) {
			result.IsValid = false
			result.Errors = append(result.Errors, ValidationError{
				Field:   pathStr,
				Rule:    "required",
				Message: v.getErrorMessage(field, "required", "This field is required"),
				Value:   value,
			})
			return // Don't check other rules if required fails
		}
	}

	// Skip other validations if empty
	if isEmpty(value) {
		return
	}

	// For number type fields, implicitly run number validation first
	// if there's no explicit number rule (to catch invalid numbers before min/max)
	if field.Type == "number" {
		hasExplicitNumberRule := false
		if field.Rules != nil {
			_, hasExplicitNumberRule = field.Rules["number"]
		}
		if !hasExplicitNumberRule {
			numberRule := v.rules["number"]
			if numberRule != nil {
				errMsg := numberRule(value, nil, allData, ctx)
				if errMsg != nil {
					result.IsValid = false
					result.Errors = append(result.Errors, ValidationError{
						Field:   pathStr,
						Rule:    "number",
						Message: v.getErrorMessage(field, "number", *errMsg),
						Value:   value,
					})
					return // Stop at first error
				}
			}
		}
	}

	// Run all field rules
	if field.Rules != nil {
		for ruleName, ruleValue := range field.Rules {
			if ruleName == "required" {
				continue // Already handled above
			}

			errMsg := v.applyRule(ruleName, ruleValue, value, allData, ctx)
			if errMsg != nil {
				result.IsValid = false
				result.Errors = append(result.Errors, ValidationError{
					Field:   pathStr,
					Rule:    ruleName,
					Message: v.getErrorMessage(field, ruleName, *errMsg),
					Value:   value,
				})
			}
		}
	}
}

// isFieldRequired checks if a field is required (handles conditional required)
func (v *Validator) isFieldRequired(field *Field, allData map[string]interface{}, currentPath []string) (bool, string) {
	if field.Required == nil {
		// Check in rules
		if field.Rules != nil {
			if reqVal, ok := field.Rules["required"]; ok {
				return v.evaluateRequired(reqVal, allData, currentPath)
			}
		}
		return false, ""
	}

	return v.evaluateRequired(field.Required, allData, currentPath)
}

// evaluateRequired evaluates a required rule value
func (v *Validator) evaluateRequired(reqValue interface{}, allData map[string]interface{}, currentPath []string) (bool, string) {
	switch req := reqValue.(type) {
	case bool:
		return req, ""
	case string:
		// Conditional required expression
		if req == "" || req == "false" {
			return false, req
		}
		if req == "true" {
			return true, ""
		}
		// Parse and evaluate condition
		result, err := v.conditionParser.Evaluate(req, allData, currentPath)
		if err != nil {
			return false, req
		}
		return result, req
	default:
		return false, ""
	}
}

// applyRule applies a validation rule
func (v *Validator) applyRule(ruleName string, ruleValue interface{}, value interface{}, allData map[string]interface{}, ctx *ValidationContext) *string {
	// Get the rule function
	ruleFn, ok := v.rules[ruleName]
	if !ok {
		// Check if it's a custom rule in spec
		if customRule, ok := v.spec.Rules[ruleName]; ok {
			return v.applyCustomRule(&customRule, value, allData, ctx)
		}
		return nil // Unknown rule, skip
	}

	// Handle conditional rule values (ternary expressions)
	// For numeric rules like min/max, evaluate ternary expressions
	resolvedValue := v.resolveRuleValue(ruleValue, allData, ctx.CurrentPath)

	// Parse parameters from resolved rule value
	params := v.parseRuleParams(resolvedValue)

	return ruleFn(value, params, allData, ctx)
}

// resolveRuleValue evaluates conditional expressions in rule values
func (v *Validator) resolveRuleValue(ruleValue interface{}, allData map[string]interface{}, currentPath []string) interface{} {
	strVal, ok := ruleValue.(string)
	if !ok {
		return ruleValue
	}

	// Check if string contains ternary operator (? and :)
	if !strings.Contains(strVal, "?") || !strings.Contains(strVal, ":") {
		return ruleValue
	}

	// Try to evaluate as a ternary expression
	result, err := v.conditionParser.EvaluateValue(strVal, allData, currentPath)
	if err != nil {
		return ruleValue // Return original if evaluation fails
	}

	return result
}

// applyCustomRule applies a custom rule from spec
func (v *Validator) applyCustomRule(rule *Rule, value interface{}, allData map[string]interface{}, ctx *ValidationContext) *string {
	// Pattern matching
	if rule.Pattern != "" {
		matchRule := v.rules["match"]
		if matchRule != nil {
			return matchRule(value, []string{rule.Pattern}, allData, ctx)
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

// parseRuleParams parses parameters from a rule value
func (v *Validator) parseRuleParams(ruleValue interface{}) []string {
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
		// Check if it's a rule with params (e.g., "min:8")
		if strings.Contains(val, ":") {
			parts := strings.SplitN(val, ":", 2)
			if len(parts) == 2 {
				// Handle comma-separated params
				return strings.Split(parts[1], ",")
			}
		}
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

// getErrorMessage gets the error message for a rule
func (v *Validator) getErrorMessage(field *Field, ruleName string, defaultMsg string) string {
	if field.Messages != nil {
		if msg, ok := field.Messages[ruleName]; ok {
			return msg
		}
	}
	return defaultMsg
}

// getValueFromData retrieves a value from data by field name
func (v *Validator) getValueFromData(data map[string]interface{}, fieldName string) interface{} {
	if data == nil {
		return nil
	}
	return data[fieldName]
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

// Helper function to get nested value from data
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
