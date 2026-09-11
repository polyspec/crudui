// Package runner provides Go test runner for crudui validation.
// It loads test cases from tests/cases/*.json and validates using validator/go.
// Run with: go test ./... from this directory.
package runner

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	validator validator "github.com/polyspec/crudui/packages/validator-go/validator/legacy"
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
	ID          string          `json:"id"`
	Description string          `json:"description"`
	Spec        json.RawMessage `json:"spec"`
	Cases       []testCase      `json:"cases"`
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
		"../cases",    // From tests/runner/go
		"../../cases", // From tests/runner
		"tests/cases", // From project root
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

// convertInputData converts input data to match the spec structure
func convertInputData(isGroup bool, input interface{}) map[string]interface{} {
	if isGroup {
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
	parsed, err := validator.ParseSpec(testDef.Spec)
	if err != nil {
		t.Fatalf("Failed to parse spec: %v", err)
	}
	input := convertInputData(parsed.IsGroup, tc.Input)

	v := validator.NewValidator(parsed.Spec)
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
