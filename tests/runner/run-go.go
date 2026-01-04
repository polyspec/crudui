// Package main implements a Go test runner for form-spec validation.
// It loads test cases from tests/cases/*.json and validates using validator/go.
// Outputs colored pass/fail results and exits with error code if any fail.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	validator "github.com/example/form-generator/validator/validator"
)

// ANSI color codes
const (
	ColorReset  = "\033[0m"
	ColorRed    = "\033[31m"
	ColorGreen  = "\033[32m"
	ColorYellow = "\033[33m"
	ColorBlue   = "\033[34m"
	ColorCyan   = "\033[36m"
	ColorGray   = "\033[90m"
	ColorBold   = "\033[1m"
)

// TestCase represents a single test case
type TestCase struct {
	Input    interface{} `json:"input"`
	Expected struct {
		Valid bool    `json:"valid"`
		Error *string `json:"error,omitempty"`
		Field *string `json:"field,omitempty"`
	} `json:"expected"`
}

// TestDefinition represents a test with multiple cases
type TestDefinition struct {
	ID          string                 `json:"id"`
	Description string                 `json:"description"`
	Spec        map[string]interface{} `json:"spec"`
	Cases       []TestCase             `json:"cases"`
}

// TestSuite represents a complete test suite
type TestSuite struct {
	TestSuite   string           `json:"testSuite"`
	Version     string           `json:"version"`
	Description string           `json:"description"`
	Tests       []TestDefinition `json:"tests"`
}

// TestResult represents the result of running a test case
type TestResult struct {
	TestID    string
	CaseIndex int
	Passed    bool
	Expected  struct {
		Valid bool
		Error *string
		Field *string
	}
	Actual struct {
		Valid bool
		Error *string
		Field *string
	}
	Input interface{}
}

// convertSpec converts spec from test format to Validator format
func convertSpec(spec map[string]interface{}) validator.Spec {
	// Check if it's a group with properties
	specType, _ := spec["type"].(string)
	properties, hasProps := spec["properties"].(map[string]interface{})

	if specType == "group" && hasProps {
		return convertGroupSpec(spec)
	}

	// Wrap simple field spec in a group with a 'value' property
	return validator.Spec{
		Fields: []validator.Field{
			convertFieldSpec("value", spec),
		},
	}
}

// convertGroupSpec converts a group spec to Validator Spec
func convertGroupSpec(spec map[string]interface{}) validator.Spec {
	properties, _ := spec["properties"].(map[string]interface{})

	var fields []validator.Field
	for name, fieldSpec := range properties {
		if fs, ok := fieldSpec.(map[string]interface{}); ok {
			fields = append(fields, convertFieldSpec(name, fs))
		}
	}

	return validator.Spec{
		Fields: fields,
	}
}

// convertFieldSpec converts a field spec map to a Field struct
func convertFieldSpec(name string, spec map[string]interface{}) validator.Field {
	field := validator.Field{
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
				field.Fields = append(field.Fields, convertFieldSpec(propName, ps))
			}
		}
	}

	// Handle multiple flag
	if multiple, ok := spec["multiple"].(bool); ok {
		field.Multiple = multiple
	}

	return field
}

// convertInput converts input data to match the spec structure
func convertInput(spec map[string]interface{}, input interface{}) map[string]interface{} {
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

// runTestCase runs a single test case
func runTestCase(testDef TestDefinition, testCase TestCase, caseIndex int) TestResult {
	spec := convertSpec(testDef.Spec)
	input := convertInput(testDef.Spec, testCase.Input)

	v := validator.NewValidator(spec)
	result := v.Validate(input)

	testResult := TestResult{
		TestID:    testDef.ID,
		CaseIndex: caseIndex,
		Input:     testCase.Input,
	}

	testResult.Expected.Valid = testCase.Expected.Valid
	testResult.Expected.Error = testCase.Expected.Error
	testResult.Expected.Field = testCase.Expected.Field

	testResult.Actual.Valid = result.IsValid

	if !result.IsValid && len(result.Errors) > 0 {
		firstError := result.Errors[0]
		testResult.Actual.Error = &firstError.Rule
		testResult.Actual.Field = &firstError.Field
	}

	// Determine if test passed
	testResult.Passed = testResult.Actual.Valid == testResult.Expected.Valid

	if !testResult.Expected.Valid && testResult.Expected.Error != nil {
		actualError := ""
		if testResult.Actual.Error != nil {
			actualError = *testResult.Actual.Error
		}
		testResult.Passed = testResult.Passed && actualError == *testResult.Expected.Error
	}

	if !testResult.Expected.Valid && testResult.Expected.Field != nil {
		actualField := ""
		if testResult.Actual.Field != nil {
			actualField = *testResult.Actual.Field
		}
		testResult.Passed = testResult.Passed && actualField == *testResult.Expected.Field
	}

	return testResult
}

// runTestSuite runs all tests in a suite
func runTestSuite(suite TestSuite) []TestResult {
	var results []TestResult

	for _, testDef := range suite.Tests {
		for i, testCase := range testDef.Cases {
			result := runTestCase(testDef, testCase, i)
			results = append(results, result)
		}
	}

	return results
}

// formatInput formats input for display
func formatInput(input interface{}) string {
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
		if strings.TrimSpace(s) == "" {
			b, _ := json.Marshal(s)
			return string(b)
		}
		return fmt.Sprintf(`"%s"`, s)
	}
	if b, ok := input.(bool); ok {
		if b {
			return "true"
		}
		return "false"
	}
	b, _ := json.Marshal(input)
	return string(b)
}

// printResults prints test results
func printResults(suiteName string, results []TestResult) {
	passed := 0
	failed := 0

	for _, r := range results {
		if r.Passed {
			passed++
		} else {
			failed++
		}
	}
	total := len(results)

	fmt.Println()
	fmt.Printf("%s%s=== %s ===%s\n", ColorBold, ColorBlue, suiteName, ColorReset)
	fmt.Println()

	// Group results by test ID
	groupedResults := make(map[string][]TestResult)
	var testOrder []string

	for _, result := range results {
		if _, exists := groupedResults[result.TestID]; !exists {
			testOrder = append(testOrder, result.TestID)
		}
		groupedResults[result.TestID] = append(groupedResults[result.TestID], result)
	}

	for _, testID := range testOrder {
		testResults := groupedResults[testID]
		allPassed := true
		for _, r := range testResults {
			if !r.Passed {
				allPassed = false
				break
			}
		}

		var icon string
		if allPassed {
			icon = fmt.Sprintf("%s[PASS]%s", ColorGreen, ColorReset)
		} else {
			icon = fmt.Sprintf("%s[FAIL]%s", ColorRed, ColorReset)
		}

		fmt.Printf("  %s %s\n", icon, testID)

		// Show failed cases
		for _, result := range testResults {
			if !result.Passed {
				fmt.Printf("    %sCase %d:%s\n", ColorGray, result.CaseIndex+1, ColorReset)
				fmt.Printf("      %sInput:%s %s\n", ColorGray, ColorReset, formatInput(result.Input))

				expectedStr := fmt.Sprintf("valid=%t", result.Expected.Valid)
				if result.Expected.Error != nil {
					expectedStr += fmt.Sprintf(", error=%s", *result.Expected.Error)
				}
				if result.Expected.Field != nil {
					expectedStr += fmt.Sprintf(", field=%s", *result.Expected.Field)
				}
				fmt.Printf("      %sExpected:%s %s\n", ColorGray, ColorReset, expectedStr)

				actualStr := fmt.Sprintf("valid=%t", result.Actual.Valid)
				if result.Actual.Error != nil {
					actualStr += fmt.Sprintf(", error=%s", *result.Actual.Error)
				}
				if result.Actual.Field != nil {
					actualStr += fmt.Sprintf(", field=%s", *result.Actual.Field)
				}
				fmt.Printf("      %sActual:%s %s\n", ColorGray, ColorReset, actualStr)
			}
		}
	}

	fmt.Println()
	fmt.Printf("%sSummary:%s %s%d passed%s, %s%d failed%s, %d total\n",
		ColorBold, ColorReset,
		ColorGreen, passed, ColorReset,
		ColorRed, failed, ColorReset,
		total)
}

func main() {
	// Get the directory of the current executable or use relative path
	casesDir := filepath.Join("..", "cases")

	// Try to find cases directory relative to the source file
	if _, err := os.Stat(casesDir); os.IsNotExist(err) {
		// Try from GOPATH or current working directory
		cwd, _ := os.Getwd()
		casesDir = filepath.Join(cwd, "tests", "cases")
	}

	// Check if directory exists
	if _, err := os.Stat(casesDir); os.IsNotExist(err) {
		fmt.Printf("%sError: Test cases directory not found: %s%s\n", ColorRed, casesDir, ColorReset)
		os.Exit(1)
	}

	// Find all JSON test files
	testFiles, err := filepath.Glob(filepath.Join(casesDir, "*.json"))
	if err != nil || len(testFiles) == 0 {
		fmt.Printf("%sError: No test files found in %s%s\n", ColorRed, casesDir, ColorReset)
		os.Exit(1)
	}

	fmt.Printf("%sForm Validator - Go Test Runner%s\n", ColorCyan, ColorReset)
	fmt.Printf("%sRunning %d test suites...%s\n", ColorGray, len(testFiles), ColorReset)

	totalPassed := 0
	totalFailed := 0
	totalTests := 0

	for _, testFile := range testFiles {
		content, err := os.ReadFile(testFile)
		if err != nil {
			fmt.Printf("%sError loading test file %s: %s%s\n",
				ColorRed, filepath.Base(testFile), err.Error(), ColorReset)
			totalFailed++
			continue
		}

		var suite TestSuite
		if err := json.Unmarshal(content, &suite); err != nil {
			fmt.Printf("%sError parsing test file %s: %s%s\n",
				ColorRed, filepath.Base(testFile), err.Error(), ColorReset)
			totalFailed++
			continue
		}

		results := runTestSuite(suite)
		printResults(suite.TestSuite, results)

		for _, r := range results {
			if r.Passed {
				totalPassed++
			} else {
				totalFailed++
			}
		}
		totalTests += len(results)
	}

	fmt.Println()
	fmt.Printf("%s%s=== Overall Results ===%s\n", ColorBold, ColorCyan, ColorReset)
	fmt.Printf("%s%d passed%s, %s%d failed%s, %d total\n",
		ColorGreen, totalPassed, ColorReset,
		ColorRed, totalFailed, ColorReset,
		totalTests)

	// Exit with error code if any tests failed
	if totalFailed > 0 {
		os.Exit(1)
	}

	fmt.Printf("%sAll tests passed!%s\n", ColorGreen, ColorReset)
}
