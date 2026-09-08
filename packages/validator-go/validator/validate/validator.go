package validate

// model validator traversal + conditional rule-value resolution (SPEC §3 + §2 G1).
//
// Operates on a COMPOSED properties tree (*compose.OMap, declaration order
// preserved — composition keys already eliminated) and the decoded form data
// (map[string]any / []any / scalars from encoding/json). The traversal mirrors the
// JS Validator (validator-ts/src/model/validate/validator.ts) field for field; the
// rule-value resolution mirrors its resolveRuleValue / resolveConditionMap /
// tryEvaluateTernary (G1 — the condition is the value's expression, never a
// separate if/when key).
//
// No display_switch / display_target visibility gate (G1 — those meta keys do not
// exist in model; visibility-conditioned requiredness is required:'<expr>'). design
// .show does NOT skip validation (SPEC R1 show/validate separation).

import (
	"strconv"
	"strings"

	"github.com/crudui/crudui/packages/validator-go/validator/compose"
	"github.com/crudui/crudui/packages/validator-go/validator/expr"
)

// arrayLevelRules apply to the whole array of a multiple field; the rest apply to
// each element (VALIDATION-RULES §array-level).
var arrayLevelRules = map[string]bool{
	"required": true, "unique": true, "mincount": true, "maxcount": true,
}

// pathReferenceRules carry a field-reference param preserved verbatim — never
// evaluated as a condition expression (PATH-REFERENCE-RULES).
var pathReferenceRules = map[string]bool{
	"equalTo": true, "notEqual": true, "unique": true, "enddate": true,
}

// literalParamRules carry a literal param (.jpg must not be read as a relative
// reference) — never evaluated (LITERAL-PARAM-RULES).
var literalParamRules = map[string]bool{"accept": true}

// regexParamRules carry a regex string preserved verbatim (SPEC §10).
var regexParamRules = map[string]bool{"match": true, "pattern": true}

// membershipParamRules carry the allowed-value SET (array, comma string, or a
// static value→label map, SPEC §2 G3). The param is data, NOT a condition
// map — an object param is the value→label map (key = option value, value =
// display label), kept verbatim and never evaluated key-by-key as expressions.
var membershipParamRules = map[string]bool{"in": true}

// Validator validates data against a composed model spec. Construct via NewValidator
// from a composed properties OMap.
type Validator struct {
	properties *compose.OMap
}

// NewValidator builds a validator from a COMPOSED properties OMap (composition
// keys already eliminated by the compose pass).
func NewValidator(properties *compose.OMap) *Validator {
	if properties == nil {
		properties = compose.NewOMap()
	}
	return &Validator{properties: properties}
}

// Validate validates data against the composed model spec.
func (v *Validator) Validate(data map[string]any) ValidationResult {
	if data == nil {
		data = map[string]any{}
	}
	var errors []ValidationError
	v.validateProperties(v.properties, data, nil, data, &errors)
	return ValidationResult{Valid: len(errors) == 0, Errors: errors}
}

// validateProperties recurses a properties map (SPEC §3; JS validateProperties).
func (v *Validator) validateProperties(properties *compose.OMap, data map[string]any, currentPath []string, allData map[string]any, errors *[]ValidationError) {
	for _, propertyKey := range properties.Keys() {
		raw, _ := properties.Get(propertyKey)
		field, ok := raw.(*compose.OMap)
		if !ok || field == nil {
			continue
		}

		fieldName := propertyKey
		isMultiple := fieldIsMultiple(field)
		fieldPath := appendPath(currentPath, fieldName)
		fieldValue := data[fieldName]

		childProps := childProperties(field)

		if fieldType(field) == "group" && childProps != nil {
			isArrayMultiple := isMultiple && isArray(fieldValue)
			isObjectMultiple := isMultiple && isObject(fieldValue)

			switch {
			case isArrayMultiple:
				arr := fieldValue.([]any)
				for i := range arr {
					itemData := asMap(arr[i])
					v.validateProperties(childProps, itemData, appendPath(fieldPath, strconv.Itoa(i)), allData, errors)
				}
				v.validateFieldRules(field, fieldValue, fieldPath, allData, errors)
			case isObjectMultiple:
				obj := fieldValue.(map[string]any)
				for _, key := range sortedKeys(obj) {
					itemData := asMap(obj[key])
					v.validateProperties(childProps, itemData, appendPath(fieldPath, key), allData, errors)
				}
				v.validateFieldRules(field, fieldValue, fieldPath, allData, errors)
			case !isMultiple:
				v.validateProperties(childProps, asMap(fieldValue), fieldPath, allData, errors)
				v.validateFieldRules(field, fieldValue, fieldPath, allData, errors)
			}
			// multiple set but data shape mismatched: skip (JS parity).
			continue
		}

		if isMultiple && (isArray(fieldValue) || isObject(fieldValue)) {
			v.validateMultipleFieldRules(field, fieldValue, fieldPath, allData, errors)
		} else {
			v.validateFieldRules(field, fieldValue, fieldPath, allData, errors)
		}
	}
}

// validateMultipleFieldRules runs array-level rules on the whole array, then
// element-level rules per index (JS validateMultipleFieldRules).
func (v *Validator) validateMultipleFieldRules(field *compose.OMap, values any, fieldPath []string, allData map[string]any, errors *[]ValidationError) {
	rules := normalizeValidateSlot(field)
	messages := fieldMessages(field)

	if rules != nil {
		for _, ruleName := range rules.Keys() {
			if !arrayLevelRules[ruleName] {
				continue
			}
			ruleValue, _ := rules.Get(ruleName)
			msg, failed := v.runRule(ruleName, ruleValue, values, fieldPath, messages, allData)
			if failed {
				*errors = append(*errors, ValidationError{
					Path: pathToString(fieldPath), Field: getFieldName(fieldPath),
					Rule: ruleName, Message: msg, Value: values,
				})
				return
			}
		}
	}

	switch rows := values.(type) {
	case []any:
		for i, value := range rows {
			v.validateElementRules(field, value, appendPath(fieldPath, strconv.Itoa(i)), allData, errors)
		}
	case map[string]any:
		for _, key := range sortedKeys(rows) {
			v.validateElementRules(field, rows[key], appendPath(fieldPath, key), allData, errors)
		}
	}
}

// validateElementRules runs element-level rules for one element of a multiple
// field (no array-level rules). JS validateElementRules.
func (v *Validator) validateElementRules(field *compose.OMap, value any, itemPath []string, allData map[string]any, errors *[]ValidationError) {
	messages := fieldMessages(field)
	rules := normalizeValidateSlot(field)

	if v.runImplicitNumber(field, rules, value, itemPath, messages, allData, errors) {
		return
	}
	if rules == nil {
		return
	}
	for _, ruleName := range rules.Keys() {
		if arrayLevelRules[ruleName] {
			continue
		}
		ruleValue, _ := rules.Get(ruleName)
		msg, failed := v.runRule(ruleName, ruleValue, value, itemPath, messages, allData)
		if failed {
			*errors = append(*errors, ValidationError{
				Path: pathToString(itemPath), Field: getFieldName(itemPath),
				Rule: ruleName, Message: msg, Value: value,
			})
			break
		}
	}
}

// validateFieldRules runs all rules for a single (scalar or whole-group) field
// (JS validateFieldRules). First error per field stops the field.
func (v *Validator) validateFieldRules(field *compose.OMap, value any, fieldPath []string, allData map[string]any, errors *[]ValidationError) {
	messages := fieldMessages(field)
	rules := normalizeValidateSlot(field)

	if v.runImplicitNumber(field, rules, value, fieldPath, messages, allData, errors) {
		return
	}
	if rules == nil {
		return
	}
	for _, ruleName := range rules.Keys() {
		ruleValue, _ := rules.Get(ruleName)
		msg, failed := v.runRule(ruleName, ruleValue, value, fieldPath, messages, allData)
		if failed {
			*errors = append(*errors, ValidationError{
				Path: pathToString(fieldPath), Field: getFieldName(fieldPath),
				Rule: ruleName, Message: msg, Value: value,
			})
			break
		}
	}
}

// runImplicitNumber runs an implicit number rule before everything else for a
// type:number field with no explicit number rule (VALIDATION-RULES §2 — reported
// as rule "number"). Returns true when it pushed an error.
func (v *Validator) runImplicitNumber(field *compose.OMap, rules *compose.OMap, value any, path []string, messages map[string]string, allData map[string]any, errors *[]ValidationError) bool {
	if fieldType(field) != "number" {
		return false
	}
	if rules != nil && rules.Has("number") {
		return false
	}
	msg, failed := v.runRule("number", true, value, path, messages, allData)
	if failed {
		*errors = append(*errors, ValidationError{
			Path: pathToString(path), Field: getFieldName(path),
			Rule: "number", Message: msg, Value: value,
		})
		return true
	}
	return false
}

// runRule resolves a (possibly conditional) rule value to an effective param,
// skips when the result disables the rule (false/null), else calls the rule fn
// (JS runRule). Returns (message, failed).
func (v *Validator) runRule(ruleName string, ruleValue any, value any, path []string, messages map[string]string, allData map[string]any) (string, bool) {
	effective := v.resolveRuleValue(ruleName, ruleValue, path, allData)

	// A false/null effective param disables the rule (VALIDATION-RULES common §3).
	if effective == nil {
		return "", false
	}
	if b, ok := effective.(bool); ok && !b {
		return "", false
	}

	fn, ok := getRule(ruleName)
	if !ok {
		// Unregistered rule: no error (VALIDATION-RULES common §4).
		return "", false
	}

	ctx := ruleContext{
		pathSegments: path,
		formData:     allData,
		messages:     messages,
		ruleName:     ruleName,
	}
	return fn(value, effective, ctx)
}

// resolveRuleValue resolves a rule value to the effective param (G1).
//
//   - path-reference / literal-param / regex rules keep their param verbatim.
//   - a condition map (a plain object of expression→value, declaration-ordered):
//     first truthy key's value; else the "true" key; else nil (disabled).
//   - a string: a value-returning ternary, or a plain condition expression.
//   - anything else: a literal param.
func (v *Validator) resolveRuleValue(ruleName string, ruleValue any, path []string, allData map[string]any) any {
	if pathReferenceRules[ruleName] || literalParamRules[ruleName] || regexParamRules[ruleName] || membershipParamRules[ruleName] {
		return ruleValue
	}

	// Condition map: a plain object (OMap) of expression→value.
	if m, ok := ruleValue.(*compose.OMap); ok && m != nil {
		return v.resolveConditionMap(m, path, allData)
	}

	if s, ok := ruleValue.(string); ok {
		if handled, branch := v.tryEvaluateTernary(s, path, allData); handled {
			return branch
		}
		if isConditionExpression(s) && !ternaryRE.MatchString(s) {
			return v.evaluateExpressionValue(s, path, allData)
		}
	}

	return ruleValue
}

// resolveConditionMap evaluates a condition map (EXPRESSION-GRAMMAR §8): keys in
// declaration order, first truthy key's value wins; else the "true" key; else nil
// (rule disabled). JS resolveConditionMap.
func (v *Validator) resolveConditionMap(m *compose.OMap, path []string, allData map[string]any) any {
	for _, key := range m.Keys() {
		if key == expr.DefaultKey {
			continue // default evaluated last
		}
		if v.evaluateCondition(key, path, allData) {
			val, _ := m.Get(key)
			return val
		}
	}
	if m.Has(expr.DefaultKey) {
		val, _ := m.Get(expr.DefaultKey)
		return val
	}
	return nil
}

// tryEvaluateTernary reads a string param as a value-returning ternary
// (cond ? a : b). Returns (false, nil) when the string is not a ternary or its
// condition is not parseable (so a regex containing "?...:" is not mistaken for a
// ternary). JS tryEvaluateTernary.
func (v *Validator) tryEvaluateTernary(expression string, path []string, allData map[string]any) (bool, any) {
	questionPos := findTernaryOperator(expression, '?', 0)
	if questionPos == -1 {
		return false, nil
	}
	colonPos := findTernaryOperator(expression, ':', questionPos+1)
	if colonPos == -1 {
		return false, nil
	}
	condition := strings.TrimSpace(expression[:questionPos])
	if !isConditionExpression(condition) {
		return false, nil
	}
	if _, err := expr.Parse(condition); err != nil {
		return false, nil
	}
	var branch string
	if v.evaluateCondition(condition, path, allData) {
		branch = strings.TrimSpace(expression[questionPos+1 : colonPos])
	} else {
		branch = strings.TrimSpace(expression[colonPos+1:])
	}
	if ternaryRE.MatchString(branch) {
		if handled, nested := v.tryEvaluateTernary(branch, path, allData); handled {
			return true, nested
		}
	}
	return true, parseTernaryBranchValue(branch)
}

// evaluateCondition evaluates a condition string to a boolean (JS
// evaluateCondition wrapper — a parse/eval error is false).
func (v *Validator) evaluateCondition(expression string, path []string, allData map[string]any) bool {
	ok, err := expr.Evaluate(expression, allData, path)
	if err != nil {
		return false
	}
	return ok
}

// evaluateExpressionValue evaluates a plain expression to its value (JS
// evaluateExpressionValue wrapper — a parse/eval error is false).
func (v *Validator) evaluateExpressionValue(expression string, path []string, allData map[string]any) any {
	val, err := expr.EvaluateValue(expression, allData, path)
	if err != nil {
		return false
	}
	return val
}

// ---------------------------------------------------------------------------
// Field-shape readers over a composed OMap.
// ---------------------------------------------------------------------------

// fieldType returns a field's "type" string ("" when absent).
func fieldType(field *compose.OMap) string {
	if v, ok := field.Get("type"); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// fieldIsMultiple reports whether a field repeats (multiple:true or multiple:{}).
func fieldIsMultiple(field *compose.OMap) bool {
	v, ok := field.Get("multiple")
	if !ok {
		return false
	}
	if b, ok := v.(bool); ok {
		return b
	}
	if _, ok := v.(*compose.OMap); ok {
		return true
	}
	return false
}

// childProperties returns a group's child-field map, or nil.
func childProperties(field *compose.OMap) *compose.OMap {
	if v, ok := field.Get("properties"); ok {
		if m, ok := v.(*compose.OMap); ok {
			return m
		}
	}
	return nil
}

// normalizeValidateSlot reads the polymorphic validate slot to a rule map: false /
// true / absent → nil (no rules); an object → the rule map. JS
// normalizeValidateSlot.
func normalizeValidateSlot(field *compose.OMap) *compose.OMap {
	v, ok := field.Get("validate")
	if !ok {
		return nil
	}
	if m, ok := v.(*compose.OMap); ok {
		return m
	}
	return nil // false / true / scalar carry no sub-rules
}

// fieldMessages reads the per-field messages map (rule name → string), or nil.
func fieldMessages(field *compose.OMap) map[string]string {
	v, ok := field.Get("messages")
	if !ok {
		return nil
	}
	m, ok := v.(*compose.OMap)
	if !ok {
		return nil
	}
	out := map[string]string{}
	for _, k := range m.Keys() {
		val, _ := m.Get(k)
		if s, ok := val.(string); ok {
			out[k] = s
		}
	}
	return out
}

// ---------------------------------------------------------------------------
// Small value/path utilities.
// ---------------------------------------------------------------------------

// appendPath returns a fresh slice base+seg (never mutates base).
func appendPath(base []string, seg string) []string {
	out := make([]string, len(base)+1)
	copy(out, base)
	out[len(base)] = seg
	return out
}

// isArray reports whether v is a JSON array.
func isArray(v any) bool {
	_, ok := v.([]any)
	return ok
}

// isObject reports whether v is a JSON object (map), not an array.
func isObject(v any) bool {
	_, ok := v.(map[string]any)
	return ok
}

// asMap coerces v to a map; a non-map (or nil) yields an empty map so traversal of
// a missing nested group still runs required rules on its children.
func asMap(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

// findTernaryOperator finds the position of a top-level '?' or ':' respecting
// quotes, parens/brackets and nested ternaries (JS findTernaryOperator / PHP
// ConditionParser parity).
func findTernaryOperator(expression string, operator byte, startPos int) int {
	depth := 0
	inQuote := false
	var quoteChar byte
	ternaryDepth := 0

	for i := startPos; i < len(expression); i++ {
		ch := expression[i]
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

// parseTernaryBranchValue parses a ternary branch string into a typed value (JS
// parseTernaryBranchValue): a quoted string unquotes; true/false/null literals; a
// numeric string parses to int or float; otherwise the raw string (a regex branch
// survives as a string).
func parseTernaryBranchValue(raw string) any {
	value := strings.TrimSpace(raw)
	if len(value) >= 2 {
		first := value[0]
		last := value[len(value)-1]
		if (first == '"' && last == '"') || (first == '\'' && last == '\'') {
			return value[1 : len(value)-1]
		}
	}
	switch value {
	case "true":
		return true
	case "false":
		return false
	case "null":
		return nil
	}
	if value != "" {
		if strings.Contains(value, ".") {
			if f, err := strconv.ParseFloat(value, 64); err == nil {
				return f
			}
		} else if n, err := strconv.Atoi(value); err == nil {
			return n
		} else if f, err := strconv.ParseFloat(value, 64); err == nil {
			return f
		}
	}
	return value
}
