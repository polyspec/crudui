package validator

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// TestCase represents a single test case from the JSON files
type testCase struct {
	Input    interface{} `json:"input"`
	Expected struct {
		Valid   bool    `json:"valid"`
		Error   *string `json:"error,omitempty"`
		Field   *string `json:"field,omitempty"`
		Message *string `json:"message,omitempty"`
	} `json:"expected"`
}

// TestDefinition represents a test with multiple cases
type testDefinition struct {
	ID          string                 `json:"id"`
	Description string                 `json:"description"`
	Spec        map[string]interface{} `json:"spec"`
	Cases       []testCase             `json:"cases"`
}

// TestSuite represents a complete test suite
type testSuiteData struct {
	TestSuite   string           `json:"testSuite"`
	Version     string           `json:"version"`
	Description string           `json:"description"`
	Tests       []testDefinition `json:"tests"`
}

// findTestCasesDir locates the test cases directory
func findTestCasesDir() (string, error) {
	// Try different paths relative to where tests might be run from
	candidatePaths := []string{
		"../../../tests/cases",                                   // From validator/go/validator
		"../../tests/cases",                                      // From validator/go
		"tests/cases",                                            // From project root
		"/Users/max/Work/form-generator/tests/cases",             // Absolute path
	}

	for _, path := range candidatePaths {
		absPath, err := filepath.Abs(path)
		if err != nil {
			continue
		}
		if info, err := os.Stat(absPath); err == nil && info.IsDir() {
			return absPath, nil
		}
	}

	return "", fmt.Errorf("could not find test cases directory")
}

// convertSpecToValidator converts spec from test format to Validator format
func convertSpecToValidator(spec map[string]interface{}) Spec {
	specType, _ := spec["type"].(string)
	_, hasProps := spec["properties"].(map[string]interface{})

	if specType == "group" && hasProps {
		return convertGroupSpecToValidator(spec)
	}

	// Wrap simple field spec in a group with a 'value' property
	return Spec{
		Fields: []Field{
			convertFieldSpecToValidator("value", spec),
		},
	}
}

// convertGroupSpecToValidator converts a group spec to Validator Spec
func convertGroupSpecToValidator(spec map[string]interface{}) Spec {
	properties, _ := spec["properties"].(map[string]interface{})

	var fields []Field
	for name, fieldSpec := range properties {
		if fs, ok := fieldSpec.(map[string]interface{}); ok {
			fields = append(fields, convertFieldSpecToValidator(name, fs))
		}
	}

	return Spec{
		Fields: fields,
	}
}

// convertFieldSpecToValidator converts a field spec map to a Field struct
func convertFieldSpecToValidator(name string, spec map[string]interface{}) Field {
	field := Field{
		Name: name,
	}

	if t, ok := spec["type"].(string); ok {
		field.Type = t
	}

	if label, ok := spec["label"].(string); ok {
		field.Label = label
	}

	if rules, ok := spec["rules"].(map[string]interface{}); ok {
		field.Rules = rules
	}

	// For number type fields, automatically add 'number' validation if min/max rules exist
	if field.Type == "number" && field.Rules != nil {
		if _, hasMin := field.Rules["min"]; hasMin {
			if _, hasNumber := field.Rules["number"]; !hasNumber {
				field.Rules["number"] = true
			}
		}
		if _, hasMax := field.Rules["max"]; hasMax {
			if _, hasNumber := field.Rules["number"]; !hasNumber {
				field.Rules["number"] = true
			}
		}
	}

	if messages, ok := spec["messages"].(map[string]interface{}); ok {
		field.Messages = make(map[string]string)
		for k, v := range messages {
			if s, ok := v.(string); ok {
				field.Messages[k] = s
			}
		}
	}

	// Handle nested properties (group type)
	if props, ok := spec["properties"].(map[string]interface{}); ok {
		for propName, propSpec := range props {
			if ps, ok := propSpec.(map[string]interface{}); ok {
				field.Fields = append(field.Fields, convertFieldSpecToValidator(propName, ps))
			}
		}
	}

	// Handle multiple flag
	if multiple, ok := spec["multiple"].(bool); ok {
		field.Multiple = multiple
	}
	// Handle "only" string value for multiple (single object treated like array for wildcards)
	if multiple, ok := spec["multiple"].(string); ok && multiple == "only" {
		field.MultipleOnly = true
	}

	return field
}

// convertInputData converts input data to match the spec structure
func convertInputData(spec map[string]interface{}, input interface{}) map[string]interface{} {
	specType, _ := spec["type"].(string)
	_, hasProps := spec["properties"].(map[string]interface{})

	if specType == "group" && hasProps {
		if m, ok := input.(map[string]interface{}); ok {
			return m
		}
		return make(map[string]interface{})
	}

	// Handle special undefined marker
	if s, ok := input.(string); ok && s == "__undefined__" {
		return map[string]interface{}{"value": nil}
	}

	return map[string]interface{}{"value": input}
}

// formatInputValue formats input for error messages
func formatInputValue(input interface{}) string {
	if input == nil {
		return "null"
	}
	if s, ok := input.(string); ok {
		if s == "" {
			return `""`
		}
		if s == "__undefined__" {
			return "undefined"
		}
	}
	b, _ := json.Marshal(input)
	return string(b)
}

// TestAllValidatorCases runs all test cases from the JSON files
func TestAllValidatorCases(t *testing.T) {
	casesDir, err := findTestCasesDir()
	if err != nil {
		t.Fatalf("Failed to find test cases directory: %v", err)
	}

	testFiles, err := filepath.Glob(filepath.Join(casesDir, "*.json"))
	if err != nil || len(testFiles) == 0 {
		t.Fatalf("No test files found in %s", casesDir)
	}

	t.Logf("Found %d test suites in %s", len(testFiles), casesDir)

	for _, testFile := range testFiles {
		content, err := os.ReadFile(testFile)
		if err != nil {
			t.Errorf("Failed to read test file %s: %v", testFile, err)
			continue
		}

		var suite testSuiteData
		if err := json.Unmarshal(content, &suite); err != nil {
			t.Errorf("Failed to parse test file %s: %v", testFile, err)
			continue
		}

		// Run each test suite as a subtest
		t.Run(suite.TestSuite, func(t *testing.T) {
			for _, testDef := range suite.Tests {
				t.Run(testDef.ID, func(t *testing.T) {
					for caseIdx, tc := range testDef.Cases {
						caseName := fmt.Sprintf("case_%d", caseIdx)
						t.Run(caseName, func(t *testing.T) {
							runSingleTestCase(t, testDef, tc, caseIdx)
						})
					}
				})
			}
		})
	}
}

// runSingleTestCase runs a single test case and reports results
func runSingleTestCase(t *testing.T, testDef testDefinition, tc testCase, caseIdx int) {
	spec := convertSpecToValidator(testDef.Spec)
	input := convertInputData(testDef.Spec, tc.Input)

	v := NewValidator(spec)
	result := v.Validate(input)

	// Check valid/invalid match
	if result.IsValid != tc.Expected.Valid {
		t.Errorf("Expected valid=%t, got valid=%t\nInput: %s\nDescription: %s",
			tc.Expected.Valid, result.IsValid,
			formatInputValue(tc.Input), testDef.Description)
		if !result.IsValid && len(result.Errors) > 0 {
			t.Errorf("Validation errors: %+v", result.Errors)
		}
		return
	}

	// If expected to be invalid, check error type
	if !tc.Expected.Valid && tc.Expected.Error != nil {
		if len(result.Errors) == 0 {
			t.Errorf("Expected error '%s', but got no errors\nInput: %s",
				*tc.Expected.Error, formatInputValue(tc.Input))
			return
		}

		actualError := result.Errors[0].Rule
		if actualError != *tc.Expected.Error {
			t.Errorf("Expected error '%s', got '%s'\nInput: %s",
				*tc.Expected.Error, actualError, formatInputValue(tc.Input))
		}
	}

	// Check field path if specified
	if !tc.Expected.Valid && tc.Expected.Field != nil {
		if len(result.Errors) == 0 {
			t.Errorf("Expected field '%s', but got no errors\nInput: %s",
				*tc.Expected.Field, formatInputValue(tc.Input))
			return
		}

		actualField := result.Errors[0].Field
		if actualField != *tc.Expected.Field {
			t.Errorf("Expected field '%s', got '%s'\nInput: %s",
				*tc.Expected.Field, actualField, formatInputValue(tc.Input))
		}
	}
}

// TestRequired tests required validation rule
func TestRequired(t *testing.T) {
	cases := []struct {
		name     string
		input    interface{}
		required bool
		wantErr  bool
	}{
		{"empty string fails", "", true, true},
		{"non-empty passes", "hello", true, false},
		{"nil fails", nil, true, true},
		{"zero is valid", 0, true, false},
		{"false is valid", false, true, false},
		{"whitespace only fails", "   ", true, true},
		{"not required empty passes", "", false, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			spec := Spec{
				Fields: []Field{
					{Name: "value", Type: "text", Rules: map[string]interface{}{"required": tc.required}},
				},
			}
			v := NewValidator(spec)
			result := v.Validate(map[string]interface{}{"value": tc.input})

			if tc.wantErr && result.IsValid {
				t.Errorf("Expected validation to fail for input: %v", tc.input)
			}
			if !tc.wantErr && !result.IsValid {
				t.Errorf("Expected validation to pass for input: %v, errors: %v", tc.input, result.Errors)
			}
		})
	}
}

// TestEmail tests email validation rule
func TestEmail(t *testing.T) {
	cases := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"valid email", "user@example.com", false},
		{"valid with subdomain", "user@mail.example.com", false},
		{"valid with plus", "user+tag@example.com", false},
		{"missing @", "userexample.com", true},
		{"multiple @", "user@@example.com", true},
		{"no domain", "user@", true},
		{"empty string skips", "", false},
		{"with space", "user @example.com", true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			spec := Spec{
				Fields: []Field{
					{Name: "email", Type: "text", Rules: map[string]interface{}{"email": true}},
				},
			}
			v := NewValidator(spec)
			result := v.Validate(map[string]interface{}{"email": tc.input})

			if tc.wantErr && result.IsValid {
				t.Errorf("Expected validation to fail for input: %s", tc.input)
			}
			if !tc.wantErr && !result.IsValid {
				t.Errorf("Expected validation to pass for input: %s, errors: %v", tc.input, result.Errors)
			}
		})
	}
}

// TestMinLength tests minlength validation rule
func TestMinLength(t *testing.T) {
	cases := []struct {
		name      string
		input     string
		minLength int
		wantErr   bool
	}{
		{"below min", "ab", 3, true},
		{"at min", "abc", 3, false},
		{"above min", "abcd", 3, false},
		{"empty skips", "", 3, false},
		{"korean chars", "가나다", 3, false},
		{"korean below", "가나", 3, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			spec := Spec{
				Fields: []Field{
					{Name: "text", Type: "text", Rules: map[string]interface{}{"minlength": tc.minLength}},
				},
			}
			v := NewValidator(spec)
			result := v.Validate(map[string]interface{}{"text": tc.input})

			if tc.wantErr && result.IsValid {
				t.Errorf("Expected validation to fail for input: %s (len=%d, min=%d)", tc.input, len([]rune(tc.input)), tc.minLength)
			}
			if !tc.wantErr && !result.IsValid {
				t.Errorf("Expected validation to pass for input: %s, errors: %v", tc.input, result.Errors)
			}
		})
	}
}

// TestMaxLength tests maxlength validation rule
func TestMaxLength(t *testing.T) {
	cases := []struct {
		name      string
		input     string
		maxLength int
		wantErr   bool
	}{
		{"below max", "abcd", 5, false},
		{"at max", "abcde", 5, false},
		{"above max", "abcdef", 5, true},
		{"empty passes", "", 5, false},
		{"korean chars", "가나다라마", 5, false},
		{"korean above", "가나다라마바", 5, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			spec := Spec{
				Fields: []Field{
					{Name: "text", Type: "text", Rules: map[string]interface{}{"maxlength": tc.maxLength}},
				},
			}
			v := NewValidator(spec)
			result := v.Validate(map[string]interface{}{"text": tc.input})

			if tc.wantErr && result.IsValid {
				t.Errorf("Expected validation to fail for input: %s", tc.input)
			}
			if !tc.wantErr && !result.IsValid {
				t.Errorf("Expected validation to pass for input: %s, errors: %v", tc.input, result.Errors)
			}
		})
	}
}

// TestMinMax tests min/max numeric validation rules
func TestMinMax(t *testing.T) {
	cases := []struct {
		name    string
		input   interface{}
		min     *float64
		max     *float64
		wantErr bool
		errType string
	}{
		{"below min", -1, floatPtr(0), nil, true, "min"},
		{"at min", 0, floatPtr(0), nil, false, ""},
		{"above min", 1, floatPtr(0), nil, false, ""},
		{"above max", 101, nil, floatPtr(100), true, "max"},
		{"at max", 100, nil, floatPtr(100), false, ""},
		{"below max", 99, nil, floatPtr(100), false, ""},
		{"in range", 50, floatPtr(0), floatPtr(100), false, ""},
		{"string number", "50", floatPtr(0), floatPtr(100), false, ""},
		{"empty skips", "", floatPtr(0), floatPtr(100), false, ""},
		{"nil skips", nil, floatPtr(0), floatPtr(100), false, ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rules := make(map[string]interface{})
			if tc.min != nil {
				rules["min"] = *tc.min
			}
			if tc.max != nil {
				rules["max"] = *tc.max
			}

			spec := Spec{
				Fields: []Field{
					{Name: "num", Type: "number", Rules: rules},
				},
			}
			v := NewValidator(spec)
			result := v.Validate(map[string]interface{}{"num": tc.input})

			if tc.wantErr && result.IsValid {
				t.Errorf("Expected validation to fail for input: %v", tc.input)
			}
			if !tc.wantErr && !result.IsValid {
				t.Errorf("Expected validation to pass for input: %v, errors: %v", tc.input, result.Errors)
			}
			if tc.wantErr && len(result.Errors) > 0 && result.Errors[0].Rule != tc.errType {
				t.Errorf("Expected error type '%s', got '%s'", tc.errType, result.Errors[0].Rule)
			}
		})
	}
}

// TestConditionalRequired tests conditional required rules
func TestConditionalRequired(t *testing.T) {
	cases := []struct {
		name      string
		condition string
		data      map[string]interface{}
		wantErr   bool
	}{
		{
			"condition true, value empty",
			".type == 1",
			map[string]interface{}{"type": 1, "value": ""},
			true,
		},
		{
			"condition false, value empty",
			".type == 1",
			map[string]interface{}{"type": 0, "value": ""},
			false,
		},
		{
			"condition true, value filled",
			".type == 1",
			map[string]interface{}{"type": 1, "value": "filled"},
			false,
		},
		{
			"greater than condition",
			".quantity > 0",
			map[string]interface{}{"quantity": 1, "warehouse": ""},
			true,
		},
		{
			"AND condition both true",
			".is_option == 0 && .is_quantity > 0",
			map[string]interface{}{"is_option": 0, "is_quantity": 1, "value": ""},
			true,
		},
		{
			"AND condition one false",
			".is_option == 0 && .is_quantity > 0",
			map[string]interface{}{"is_option": 1, "is_quantity": 1, "value": ""},
			false,
		},
		{
			"OR condition first true",
			".type == 2 || .type == 3",
			map[string]interface{}{"type": 2, "value": ""},
			true,
		},
		{
			"OR condition second true",
			".type == 2 || .type == 3",
			map[string]interface{}{"type": 3, "value": ""},
			true,
		},
		{
			"OR condition neither true",
			".type == 2 || .type == 3",
			map[string]interface{}{"type": 1, "value": ""},
			false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var fields []Field
			for k := range tc.data {
				if k == "value" {
					fields = append(fields, Field{
						Name:  k,
						Type:  "text",
						Rules: map[string]interface{}{"required": tc.condition},
					})
				} else if k == "warehouse" {
					fields = append(fields, Field{
						Name:  k,
						Type:  "text",
						Rules: map[string]interface{}{"required": tc.condition},
					})
				} else {
					fields = append(fields, Field{Name: k, Type: "number"})
				}
			}

			spec := Spec{Fields: fields}
			v := NewValidator(spec)
			result := v.Validate(tc.data)

			if tc.wantErr && result.IsValid {
				t.Errorf("Expected validation to fail with condition '%s'", tc.condition)
			}
			if !tc.wantErr && !result.IsValid {
				t.Errorf("Expected validation to pass with condition '%s', errors: %v", tc.condition, result.Errors)
			}
		})
	}
}

// TestUnique tests unique validation rule
func TestUnique(t *testing.T) {
	cases := []struct {
		name    string
		input   []interface{}
		wantErr bool
	}{
		{"unique values", []interface{}{"a", "b", "c"}, false},
		{"duplicate values", []interface{}{"a", "b", "a"}, true},
		{"empty array", []interface{}{}, false},
		{"single item", []interface{}{"a"}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			spec := Spec{
				Fields: []Field{
					{Name: "items", Type: "text", Rules: map[string]interface{}{"unique": true}},
				},
			}
			v := NewValidator(spec)
			result := v.Validate(map[string]interface{}{"items": tc.input})

			if tc.wantErr && result.IsValid {
				t.Errorf("Expected validation to fail for input: %v", tc.input)
			}
			if !tc.wantErr && !result.IsValid {
				t.Errorf("Expected validation to pass for input: %v, errors: %v", tc.input, result.Errors)
			}
		})
	}
}

// Helper function
func floatPtr(f float64) *float64 {
	return &f
}
