// Package main provides a CLI tool for running validations via stdin/stdout.
// Used by the cross-language test runner.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/example/form-generator/validator/validator"
)

// Request represents the validation request from stdin
type Request struct {
	Spec  json.RawMessage `json:"spec"`
	Input interface{}     `json:"input"`
}

// Response represents the validation response to stdout
type Response struct {
	Valid bool        `json:"valid"`
	Error interface{} `json:"error"`
	Field interface{} `json:"field"`
}

func main() {
	// Read JSON from stdin
	inputBytes, err := io.ReadAll(os.Stdin)
	if err != nil {
		outputError(fmt.Sprintf("Failed to read stdin: %v", err))
		return
	}

	var req Request
	if err := json.Unmarshal(inputBytes, &req); err != nil {
		outputError(fmt.Sprintf("Failed to parse JSON: %v", err))
		return
	}

	// Parse spec preserving property/rule declaration order
	parsed, err := validator.ParseSpec(req.Spec)
	if err != nil {
		outputError(fmt.Sprintf("Failed to parse spec: %v", err))
		return
	}

	validatorInput := convertInput(parsed.IsGroup, req.Input)

	// Run validation
	v := validator.NewValidator(parsed.Spec)
	result := v.Validate(validatorInput)

	// Build response
	resp := Response{
		Valid: result.IsValid,
		Error: nil,
		Field: nil,
	}

	if !result.IsValid && len(result.Errors) > 0 {
		resp.Error = result.Errors[0].Rule
		resp.Field = result.Errors[0].Field
	}

	outputJSON(resp)
}

// convertInput converts the request input to match the spec structure.
func convertInput(isGroup bool, input interface{}) map[string]interface{} {
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

func outputJSON(v interface{}) {
	output, _ := json.Marshal(v)
	fmt.Println(string(output))
}

func outputError(msg string) {
	resp := Response{
		Valid: false,
		Error: msg,
		Field: nil,
	}
	outputJSON(resp)
	os.Exit(1)
}
