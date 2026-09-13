// Package main is the Go model validate CLI — a thin stdin/stdout wrapper over the
// model pipeline (validator/model/validate.ValidateJSON: compose → forbidden-scan →
// validate). It exists so the cross-check gateway can drive the Go model validator
// as a subprocess, identical in protocol to the JS/PHP/Rust model wrappers.
//
// It does NOT touch the legacy CLI (cmd/validate) or the legacy validator (R7 parallel
// run, legacy inviolable). It adds NO logic — every decision lives in the reused model
// engine. Go ≥ 1.18: any, not interface{}.
//
// Protocol (gateway subprocess contract):
//
//	stdin   {"spec": <object>, "data": <object>, "files"?: {key: <object>}, "basepath"?: <string>, "mode"?: "form"|"list"}
//	stdout  {"valid": <bool>, "errors": [ {path, field, rule, message, value}, … ]}
//
// mode selects the validation entry (default "form"):
//   - "form" — ValidateJSON (compose → forbidden-scan → DATA validate). data is read.
//   - "list" — ValidateListJSON (compose → forbidden-scan ONLY; SPEC §9). A
//     list carries no rows, so there is no DATA pass and `data` is ignored. The
//     SAME load wire applies (an unresolved $ref / forbidden meta key is a fatal
//     load envelope). The form path is untouched — list is an additive branch.
//
// Failures (identical in every language):
//   - A composition load failure (unresolved $ref / $patch / forbidden meta key)
//     or a form input failure (root, group or repeated data with the wrong shape)
//     produces no validation result. It exits 2 with stdout
//     {"error": <message>, "code": <code>, "at": <trace joined with "." or "">}.
//   - A malformed request exits 1 with stdout {"error": <message>}.
//
// An omitted "data" member validates {}. A supplied "data" value is validated as
// decoded.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
	"github.com/polyspec/crudui/packages/validator-go/validator/validate"
)

// request is the stdin envelope. spec and data stay raw so the model entry point
// decodes them itself — spec via compose.DecodeOrdered (declaration order
// survives), data via encoding/json. files/basepath drive $ref resolution.
type request struct {
	Spec     json.RawMessage            `json:"spec"`
	Data     json.RawMessage            `json:"data"`
	Files    map[string]json.RawMessage `json:"files"`
	Basepath string                     `json:"basepath"`
	// Mode selects the validation entry: "form" (default) | "list". An unknown mode
	// is a bad request (fatal {error}), never a silent fallback.
	Mode string `json:"mode"`
}

func main() {
	inputBytes, err := io.ReadAll(os.Stdin)
	if err != nil {
		fatal(fmt.Sprintf("failed to read stdin: %v", err))
		return
	}

	var req request
	if err := json.Unmarshal(inputBytes, &req); err != nil {
		fatal(fmt.Sprintf("failed to parse request JSON: %v", err))
		return
	}

	files := map[string][]byte{}
	for k, raw := range req.Files {
		files[k] = []byte(raw)
	}

	// Mode dispatch (default form). list runs compose → forbidden-scan only (no
	// DATA pass, SPEC §9): a list carries no rows. The form path is unchanged.
	var result validate.ValidationResult
	switch req.Mode {
	case "", "form":
		result, err = validate.ValidateJSON(req.Spec, req.Data, files, req.Basepath)
	case "list":
		result, err = validate.ValidateListJSON(req.Spec, files, req.Basepath)
	default:
		fatal(fmt.Sprintf("unknown mode %q (want \"form\" | \"list\")", req.Mode))
		return
	}
	if err != nil {
		var loadErr *compose.ComposeLoadError
		if asLoadError(err, &loadErr) {
			failure(loadErr.Message, string(loadErr.Code), strings.Join(loadErr.Trace, "."))
			return
		}
		if inputErr, ok := err.(*validate.FormInputError); ok {
			failure(inputErr.Message, inputErr.Code(), "")
			return
		}
		fatal(err.Error())
		return
	}

	// result.Errors is nil when valid; emit [] not null so the stdout shape is
	// stable across languages.
	if result.Errors == nil {
		result.Errors = []validate.ValidationError{}
	}
	out, err := json.Marshal(result)
	if err != nil {
		fatal(fmt.Sprintf("failed to marshal result: %v", err))
		return
	}
	fmt.Println(string(out))
}

// asLoadError unwraps err into a *compose.ComposeLoadError. errors.As is avoided
// here only to keep the import set minimal; ValidateJSON wraps decode failures
// with %w but returns the load error unwrapped, so a direct type assertion plus
// a single Unwrap covers both shapes.
func asLoadError(err error, target **compose.ComposeLoadError) bool {
	for err != nil {
		if le, ok := err.(*compose.ComposeLoadError); ok {
			*target = le
			return true
		}
		u, ok := err.(interface{ Unwrap() error })
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}

// fatal emits a {"error": msg} envelope and exits non-zero. The gateway treats a
// non-zero exit / no "valid" key as a subprocess failure, mirroring the JS/PHP/
// Rust wrappers.
func fatal(msg string) {
	out, _ := json.Marshal(map[string]any{"error": msg})
	fmt.Println(string(out))
	os.Exit(1)
}

// failure emits a load or input failure without a validation result and exits 2.
func failure(message, code, at string) {
	out, _ := json.Marshal(map[string]any{
		"error": message,
		"code":  code,
		"at":    at,
	})
	fmt.Println(string(out))
	os.Exit(2)
}
