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
	Spec  map[string]interface{} `json:"spec"`
	Input interface{}            `json:"input"`
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

	// Convert spec
	validatorSpec, validatorInput := convertRequest(req.Spec, req.Input)

	// Run validation
	v := validator.NewValidator(validatorSpec)
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

func convertRequest(spec map[string]interface{}, input interface{}) (validator.Spec, map[string]interface{}) {
	specType, _ := spec["type"].(string)
	_, hasProps := spec["properties"].(map[string]interface{})

	var validatorSpec validator.Spec
	var validatorInput map[string]interface{}

	if specType == "group" && hasProps {
		validatorSpec = convertGroupSpec(spec)
		if m, ok := input.(map[string]interface{}); ok {
			validatorInput = m
		} else {
			validatorInput = make(map[string]interface{})
		}
	} else {
		validatorSpec = validator.Spec{
			Fields: []validator.Field{{
				Name:  "value",
				Type:  specType,
				Rules: getRules(spec),
			}},
		}
		if s, ok := input.(string); ok && s == "__undefined__" {
			validatorInput = map[string]interface{}{"value": nil}
		} else {
			validatorInput = map[string]interface{}{"value": input}
		}
	}

	return validatorSpec, validatorInput
}

func convertGroupSpec(spec map[string]interface{}) validator.Spec {
	props, _ := spec["properties"].(map[string]interface{})
	var fields []validator.Field
	for name, fs := range props {
		if fieldSpec, ok := fs.(map[string]interface{}); ok {
			fields = append(fields, convertField(name, fieldSpec))
		}
	}
	return validator.Spec{Fields: fields}
}

func convertField(name string, spec map[string]interface{}) validator.Field {
	field := validator.Field{Name: name}
	if t, ok := spec["type"].(string); ok {
		field.Type = t
	}
	field.Rules = getRules(spec)

	if props, ok := spec["properties"].(map[string]interface{}); ok {
		for pname, ps := range props {
			if pspec, ok := ps.(map[string]interface{}); ok {
				field.Fields = append(field.Fields, convertField(pname, pspec))
			}
		}
	}

	if multiple, ok := spec["multiple"].(bool); ok {
		field.Multiple = multiple
	}

	return field
}

func getRules(spec map[string]interface{}) map[string]interface{} {
	if rules, ok := spec["rules"].(map[string]interface{}); ok {
		return rules
	}
	return nil
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
