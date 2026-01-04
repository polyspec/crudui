package validator

import (
	"math"
	"net/url"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// DefaultRules returns the built-in validation rules
func DefaultRules() map[string]RuleFunc {
	return map[string]RuleFunc{
		"required":    ruleRequired,
		"email":       ruleEmail,
		"minlength":   ruleMinLength,
		"maxlength":   ruleMaxLength,
		"min":         ruleMin,
		"max":         ruleMax,
		"match":       ruleMatch,
		"unique":      ruleUnique,
		"in":          ruleIn,
		"range":       ruleRange,
		"rangelength": ruleRangeLength,
		"number":      ruleNumber,
		"digits":      ruleDigits,
		"equalTo":     ruleEqualTo,
		"notEqual":    ruleNotEqual,
		"date":        ruleDate,
		"dateISO":     ruleDateISO,
		"enddate":     ruleEndDate,
		"url":         ruleURL,
		"accept":      ruleAccept,
		"mincount":    ruleMinCount,
		"maxcount":    ruleMaxCount,
		"step":        ruleStep,
	}
}

// ruleRequired validates that a value is not empty
func ruleRequired(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		msg := "This field is required"
		return &msg
	}
	return nil
}

// ruleEmail validates email format
func ruleEmail(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil // Skip validation for empty values (use required for mandatory)
	}

	str := toString(value)
	// RFC 5322 compliant email regex (simplified)
	pattern := `^[a-zA-Z0-9.!#$%&'*+/=?^_` + "`" + `{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$`
	matched, _ := regexp.MatchString(pattern, str)
	if !matched {
		msg := "Please enter a valid email address"
		return &msg
	}

	// Additional checks for the local part (before @)
	atIndex := strings.Index(str, "@")
	if atIndex > 0 {
		localPart := str[:atIndex]

		// Reject if local part starts with a dot
		if strings.HasPrefix(localPart, ".") {
			msg := "Please enter a valid email address"
			return &msg
		}

		// Reject if local part ends with a dot
		if strings.HasSuffix(localPart, ".") {
			msg := "Please enter a valid email address"
			return &msg
		}

		// Reject if local part has consecutive dots
		if strings.Contains(localPart, "..") {
			msg := "Please enter a valid email address"
			return &msg
		}
	}

	return nil
}

// ruleMinLength validates minimum string length
func ruleMinLength(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	if len(params) == 0 {
		return nil
	}

	minLen, err := strconv.Atoi(params[0])
	if err != nil {
		return nil
	}

	str := toString(value)
	length := utf8.RuneCountInString(str) // Count Unicode characters

	if length < minLen {
		msg := "Please enter at least " + params[0] + " characters"
		return &msg
	}
	return nil
}

// ruleMaxLength validates maximum string length
func ruleMaxLength(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	if len(params) == 0 {
		return nil
	}

	maxLen, err := strconv.Atoi(params[0])
	if err != nil {
		return nil
	}

	str := toString(value)
	length := utf8.RuneCountInString(str)

	if length > maxLen {
		msg := "Please enter no more than " + params[0] + " characters"
		return &msg
	}
	return nil
}

// ruleMin validates minimum numeric value
func ruleMin(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	if len(params) == 0 {
		return nil
	}

	minVal, err := strconv.ParseFloat(params[0], 64)
	if err != nil {
		return nil
	}

	numVal, ok := toNumber(value)
	if !ok {
		// Skip if value can't be converted to number - let number rule handle it
		return nil
	}

	if numVal < minVal {
		msg := "Please enter a value greater than or equal to " + params[0]
		return &msg
	}
	return nil
}

// ruleMax validates maximum numeric value
func ruleMax(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	if len(params) == 0 {
		return nil
	}

	maxVal, err := strconv.ParseFloat(params[0], 64)
	if err != nil {
		return nil
	}

	numVal, ok := toNumber(value)
	if !ok {
		// Skip if value can't be converted to number - let number rule handle it
		return nil
	}

	if numVal > maxVal {
		msg := "Please enter a value less than or equal to " + params[0]
		return &msg
	}
	return nil
}

// ruleMatch validates against a regex pattern
func ruleMatch(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	if len(params) == 0 {
		return nil
	}

	pattern := params[0]
	str := toString(value)

	matched, err := regexp.MatchString(pattern, str)
	if err != nil {
		msg := "Invalid pattern"
		return &msg
	}

	if !matched {
		msg := "Please enter a value matching the required format"
		return &msg
	}
	return nil
}

// ruleUnique validates that all values in an array are unique
func ruleUnique(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	arr, ok := value.([]interface{})
	if !ok {
		return nil
	}

	seen := make(map[string]bool)
	for _, item := range arr {
		key := toString(item)
		if seen[key] {
			msg := "Duplicate values are not allowed"
			return &msg
		}
		seen[key] = true
	}
	return nil
}

// ruleIn validates that a value is in a list of allowed values
func ruleIn(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	if len(params) == 0 {
		return nil
	}

	strVal := toString(value)
	for _, allowed := range params {
		if strVal == allowed {
			return nil
		}
	}

	msg := "Please select a valid option"
	return &msg
}

// isEmpty checks if a value is empty
func isEmpty(value interface{}) bool {
	if value == nil {
		return true
	}

	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v) == ""
	case []interface{}:
		return len(v) == 0
	case map[string]interface{}:
		return len(v) == 0
	case int, int8, int16, int32, int64:
		return false // Numbers are not empty (including 0)
	case uint, uint8, uint16, uint32, uint64:
		return false
	case float32, float64:
		return false
	case bool:
		return false
	default:
		// Use reflection to handle any slice type (e.g., []string, []int)
		// This matches JS behavior where empty arrays fail required validation
		val := reflect.ValueOf(value)
		if val.Kind() == reflect.Slice {
			return val.Len() == 0
		}
		return false
	}
}

// toString converts a value to string
func toString(value interface{}) string {
	if value == nil {
		return ""
	}

	switch v := value.(type) {
	case string:
		return v
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(v)
	default:
		return ""
	}
}

// toFloat64 converts a value to float64 (lenient - for comparison operators)
func toFloat64(value interface{}) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case int32:
		return float64(v), true
	case string:
		f, err := strconv.ParseFloat(v, 64)
		if err != nil {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}

// toNumber converts a value to float64 with strict validation
// Returns (0, false) for strings that aren't valid complete numbers (e.g., "12abc")
// Used for min/max validation
func toNumber(value interface{}) (float64, bool) {
	switch v := value.(type) {
	case float64:
		if math.IsNaN(v) {
			return 0, false
		}
		return v, true
	case float32:
		if math.IsNaN(float64(v)) {
			return 0, false
		}
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case int32:
		return float64(v), true
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return 0, false
		}
		// Allow Infinity/-Infinity strings
		if trimmed == "Infinity" || trimmed == "-Infinity" {
			f, err := strconv.ParseFloat(trimmed, 64)
			return f, err == nil
		}
		// Validate string is a proper number format (not partial like "12abc")
		// Pattern: optional sign, followed by digits with optional decimal point
		matched, _ := regexp.MatchString(`^[-+]?(\d+\.?\d*|\d*\.?\d+)$`, trimmed)
		if !matched {
			return 0, false
		}
		f, err := strconv.ParseFloat(trimmed, 64)
		if err != nil || math.IsNaN(f) {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}

// ruleRange validates that a numeric value is within a range [min, max]
func ruleRange(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	if len(params) < 2 {
		return nil
	}

	minVal, err1 := strconv.ParseFloat(params[0], 64)
	maxVal, err2 := strconv.ParseFloat(params[1], 64)
	if err1 != nil || err2 != nil {
		return nil
	}

	numVal, ok := toFloat64(value)
	if !ok {
		msg := "Please enter a valid number"
		return &msg
	}

	if numVal < minVal || numVal > maxVal {
		msg := "Please enter a value between " + params[0] + " and " + params[1]
		return &msg
	}
	return nil
}

// ruleRangeLength validates that a string length is within a range [min, max]
func ruleRangeLength(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	if len(params) < 2 {
		return nil
	}

	minLen, err1 := strconv.Atoi(params[0])
	maxLen, err2 := strconv.Atoi(params[1])
	if err1 != nil || err2 != nil {
		return nil
	}

	str := toString(value)
	length := utf8.RuneCountInString(str)

	if length < minLen || length > maxLen {
		msg := "Please enter a value between " + params[0] + " and " + params[1] + " characters"
		return &msg
	}
	return nil
}

// ruleNumber validates that a value is a valid number
func ruleNumber(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	_, ok := toNumber(value)
	if !ok {
		msg := "Please enter a valid number"
		return &msg
	}
	return nil
}

// ruleDigits validates that a value contains only digits
func ruleDigits(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	str := toString(value)
	matched, _ := regexp.MatchString(`^\d+$`, str)
	if !matched {
		msg := "Please enter only digits"
		return &msg
	}
	return nil
}

// ruleEqualTo validates that a value matches another field's value
func ruleEqualTo(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	if len(params) == 0 {
		return nil
	}

	targetPath := params[0]
	targetValue := getValueByPath(allData, targetPath, ctx.CurrentPath)

	if toString(value) != toString(targetValue) {
		msg := "Please enter the same value again"
		return &msg
	}
	return nil
}

// ruleNotEqual validates that a value is different from a specified value or another field
func ruleNotEqual(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	if len(params) == 0 {
		return nil
	}

	compareValue := params[0]

	// Check if param is a field path (starts with .)
	if strings.HasPrefix(compareValue, ".") {
		targetValue := getValueByPath(allData, compareValue, ctx.CurrentPath)
		if toString(value) == toString(targetValue) {
			msg := "Please enter a different value"
			return &msg
		}
	} else {
		if toString(value) == compareValue {
			msg := "Please enter a different value"
			return &msg
		}
	}
	return nil
}

// ruleDate validates that a value is a valid date
func ruleDate(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	str := toString(value)

	// Try common date formats
	formats := []string{
		"2006-01-02",
		"01/02/2006",
		"02/01/2006",
		"2006/01/02",
		"Jan 2, 2006",
		"January 2, 2006",
		time.RFC3339,
	}

	for _, format := range formats {
		if _, err := time.Parse(format, str); err == nil {
			return nil
		}
	}

	msg := "Please enter a valid date"
	return &msg
}

// ruleDateISO validates that a value is a valid ISO date (YYYY-MM-DD)
func ruleDateISO(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	str := toString(value)

	// Check format YYYY-MM-DD
	matched, _ := regexp.MatchString(`^\d{4}-\d{2}-\d{2}$`, str)
	if !matched {
		msg := "Please enter a valid date in ISO format (YYYY-MM-DD)"
		return &msg
	}

	// Validate the date components
	_, err := time.Parse("2006-01-02", str)
	if err != nil {
		msg := "Please enter a valid date in ISO format (YYYY-MM-DD)"
		return &msg
	}

	return nil
}

// ruleEndDate validates that an end date is after or equal to a start date
func ruleEndDate(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	if len(params) == 0 {
		return nil
	}

	endDate := parseDate(toString(value))
	if endDate == nil {
		return nil // Invalid date format, let date rule handle it
	}

	startDatePath := params[0]
	startDateValue := getValueByPath(allData, startDatePath, ctx.CurrentPath)

	if isEmpty(startDateValue) {
		return nil
	}

	startDate := parseDate(toString(startDateValue))
	if startDate == nil {
		return nil
	}

	if endDate.Before(*startDate) {
		msg := "End date must be after the start date"
		return &msg
	}
	return nil
}

// parseDate tries to parse a date string in common formats
func parseDate(str string) *time.Time {
	formats := []string{
		"2006-01-02",
		"01/02/2006",
		"02/01/2006",
		"2006/01/02",
		time.RFC3339,
	}

	for _, format := range formats {
		if t, err := time.Parse(format, str); err == nil {
			return &t
		}
	}
	return nil
}

// ruleURL validates that a value is a valid URL
func ruleURL(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	str := toString(value)
	parsed, err := url.Parse(str)
	if err != nil {
		msg := "Please enter a valid URL"
		return &msg
	}

	// Check for valid scheme
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" && scheme != "ftp" {
		msg := "Please enter a valid URL"
		return &msg
	}

	// Check for host
	if parsed.Host == "" {
		msg := "Please enter a valid URL"
		return &msg
	}

	return nil
}

// ruleAccept validates that a file has an acceptable MIME type or extension
func ruleAccept(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	if len(params) == 0 {
		return nil
	}

	acceptList := params

	// Handle string value (filename or MIME type)
	str := toString(value)

	if strings.Contains(str, "/") {
		// MIME type
		if !matchesMimeType(str, acceptList) {
			msg := "Please upload a file with a valid format"
			return &msg
		}
	} else {
		// Filename
		if !matchesExtension(str, acceptList) {
			msg := "Please upload a file with a valid format"
			return &msg
		}
	}

	return nil
}

// matchesMimeType checks if a MIME type matches the accept list
func matchesMimeType(mimeType string, acceptList []string) bool {
	normalizedMime := strings.ToLower(mimeType)

	for _, accept := range acceptList {
		accept = strings.ToLower(strings.TrimSpace(accept))

		if accept == "*/*" {
			return true
		}

		if strings.HasSuffix(accept, "/*") {
			// Wildcard type (e.g., image/*)
			typePrefix := strings.TrimSuffix(accept, "*")
			if strings.HasPrefix(normalizedMime, typePrefix) {
				return true
			}
		} else if !strings.HasPrefix(accept, ".") && normalizedMime == accept {
			return true
		}
	}

	return false
}

// matchesExtension checks if a file extension matches the accept list
func matchesExtension(filename string, acceptList []string) bool {
	parts := strings.Split(filename, ".")
	if len(parts) < 2 {
		return false
	}
	ext := strings.ToLower(parts[len(parts)-1])

	for _, accept := range acceptList {
		accept = strings.ToLower(strings.TrimSpace(accept))
		if strings.HasPrefix(accept, ".") {
			if accept[1:] == ext {
				return true
			}
		}
	}

	return false
}

// ruleMinCount validates that an array has at least the minimum number of items
func ruleMinCount(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	if len(params) == 0 {
		return nil
	}

	minCount, err := strconv.Atoi(params[0])
	if err != nil {
		return nil
	}

	arr, ok := value.([]interface{})
	if !ok {
		msg := "Please select at least " + params[0] + " items"
		return &msg
	}

	if len(arr) < minCount {
		msg := "Please select at least " + params[0] + " items"
		return &msg
	}
	return nil
}

// ruleMaxCount validates that an array has at most the maximum number of items
func ruleMaxCount(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	if len(params) == 0 {
		return nil
	}

	maxCount, err := strconv.Atoi(params[0])
	if err != nil {
		return nil
	}

	arr, ok := value.([]interface{})
	if !ok {
		// Non-array values have count of 1
		if 1 > maxCount {
			msg := "Please select no more than " + params[0] + " items"
			return &msg
		}
		return nil
	}

	if len(arr) > maxCount {
		msg := "Please select no more than " + params[0] + " items"
		return &msg
	}
	return nil
}

// ruleStep validates that a numeric value is a multiple of the step
func ruleStep(value interface{}, params []string, allData map[string]interface{}, ctx *ValidationContext) *string {
	if isEmpty(value) {
		return nil
	}

	if len(params) == 0 {
		return nil
	}

	step, err := strconv.ParseFloat(params[0], 64)
	if err != nil || step <= 0 {
		return nil
	}

	numVal, ok := toFloat64(value)
	if !ok {
		return nil
	}

	// Handle floating point precision
	decimalPlaces := getDecimalPlaces(numVal)
	stepDecimalPlaces := getDecimalPlaces(step)
	if stepDecimalPlaces > decimalPlaces {
		decimalPlaces = stepDecimalPlaces
	}

	multiplier := math.Pow(10, float64(decimalPlaces))
	intValue := int64(math.Round(numVal * multiplier))
	intStep := int64(math.Round(step * multiplier))

	if intValue%intStep != 0 {
		msg := "Please enter a value that is a multiple of " + params[0]
		return &msg
	}
	return nil
}

// getDecimalPlaces returns the number of decimal places in a number
func getDecimalPlaces(num float64) int {
	str := strconv.FormatFloat(num, 'f', -1, 64)
	idx := strings.Index(str, ".")
	if idx == -1 {
		return 0
	}
	return len(str) - idx - 1
}

// getValueByPath gets a value from form data by path
func getValueByPath(data map[string]interface{}, targetPath string, currentPath []string) interface{} {
	// Handle relative paths
	if strings.HasPrefix(targetPath, ".") {
		parentPath := make([]string, len(currentPath))
		copy(parentPath, currentPath)
		if len(parentPath) > 0 {
			parentPath = parentPath[:len(parentPath)-1] // Remove current field name
		}

		parts := strings.Split(targetPath, ".")

		for _, part := range parts {
			if part == "" {
				// Each leading dot means go up one level
				if len(parentPath) > 0 {
					parentPath = parentPath[:len(parentPath)-1]
				}
			} else {
				parentPath = append(parentPath, part)
			}
		}

		targetPath = strings.Join(parentPath, ".")
	}

	// Navigate to the target value
	segments := strings.Split(targetPath, ".")
	var current interface{} = data

	for _, segment := range segments {
		if segment == "" {
			continue
		}

		currentMap, ok := current.(map[string]interface{})
		if !ok {
			return nil
		}

		current, ok = currentMap[segment]
		if !ok {
			return nil
		}
	}

	return current
}
