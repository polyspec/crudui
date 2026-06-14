// Package validate is the Go CRUDUI form validator (schema §2 G5 → §3 → §2 G1) —
// the THIRD pass of the CRUDUI pipeline.
//
// It consumes a CRUDUI field model (the validate / design / behavior / options role
// slots) AFTER the compose pass (validator-go/validator/compose) has expanded
// $ref / $patch into a single spec. It does NOT touch the legacy validator (R7
// parallel run) and it does NOT re-implement the expression engine — it CALLS the
// existing engine (validator-go/validator/expr) for conditional rule values.
// The rule semantics mirror the JS reference (validator-js/src/rules) byte for
// byte; the shared 4-language fixture tests/fixtures/validate/cases.json is the
// single truth, generated from the JS engine.
//
// Pipeline (schema):
//
//	(1) compose  — ComposeProperties / ComposeSpec (compose/) runs BEFORE this
//	    engine (Validate in index.go). An unresolved $ref is a *ComposeLoadError
//	    there (never valid:true) — the legacy ProductNft.yml:873 gap closed.
//	(2) field traversal — recurse properties; group nesting, multiple arrays
//	    (items.i), object-key multiple (sorted keys, items.__uid__).
//	(3) validate-slot evaluation — per field, walk the validate slot in
//	    declaration order; for each rule evaluate its (possibly conditional) value
//	    to an effective param (expression / condition map); skip when false/null;
//	    else run the rule. type:number runs an implicit number rule first when no
//	    explicit number rule is present.
//	(4) error collection — first error per field stops that field; collect into a
//	    flat []ValidationError; valid = len(errors) == 0.
//
// Go ≥ 1.18: interface{} is spelled any. No eval.
package validate

import "strings"

// ValidationError is one validation failure. Field shape is identical to the legacy
// validator (path / field / rule / message / value) so the 4-language idempotence
// comparison (schema G-B) holds with the same (path, rule, message).
type ValidationError struct {
	// Path is the dot-joined full path to the field (items.0.name, rows.__uid__.v).
	Path string `json:"path"`
	// Field is the last path segment (the field name).
	Field string `json:"field"`
	// Rule is the failed rule name, the invoked key verbatim (pattern vs match).
	// An implicit type:number failure reports "number".
	Rule string `json:"rule"`
	// Message is the display message: field messages[rule] override → rule default
	// (with {0}/{1} substituted) → "Validation failed." fallback.
	Message string `json:"message"`
	// Value is the failed value (the whole array for array-level rules).
	Value any `json:"value"`
}

// ValidationResult is the outcome: valid plus the collected errors.
type ValidationResult struct {
	// Valid reports whether Errors is empty.
	Valid bool `json:"valid"`
	// Errors is the flat list of failures in traversal order.
	Errors []ValidationError `json:"errors"`
}

// pathToString joins path segments with dots (JS pathToString). Numeric indices
// and unique keys are dotted too (items.0.code), matching the fixtures.
func pathToString(path []string) string {
	return strings.Join(path, ".")
}

// getFieldName returns the last path segment (JS getFieldName); "" for an empty
// path.
func getFieldName(path []string) string {
	if len(path) == 0 {
		return ""
	}
	return path[len(path)-1]
}
