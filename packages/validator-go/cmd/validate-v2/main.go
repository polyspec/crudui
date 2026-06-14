// Package main is the Go v2 validate CLI — a thin stdin/stdout wrapper over the
// v2 pipeline (validator/v2/validate.ValidateJSON: compose → forbidden-scan →
// validate). It exists so the cross-check gateway can drive the Go v2 validator
// as a subprocess, identical in protocol to the JS/PHP/Rust v2 wrappers.
//
// It does NOT touch the v1 CLI (cmd/validate) or the v1 validator (R7 parallel
// run, v1 inviolable). It adds NO logic — every decision lives in the reused v2
// engine. Go ≥ 1.18: any, not interface{}.
//
// Protocol (gateway subprocess contract):
//
//	stdin   {"spec": <object>, "data": <object>, "files"?: {key: <object>}, "basepath"?: <string>, "mode"?: "form"|"list"}
//	stdout  {"valid": <bool>, "errors": [ {path, field, rule, message, value}, … ]}
//
// mode selects the validation entry (default "form"):
//   - "form" — ValidateJSON (compose → forbidden-scan → DATA validate). data is read.
//   - "list" — ValidateListJSON (compose → forbidden-scan ONLY; SPEC-V2 §9). A
//     list carries no rows, so there is no DATA pass and `data` is ignored. The
//     SAME load wire applies (an unresolved $ref / forbidden meta key is a fatal
//     load envelope). The form path is untouched — list is an additive branch.
//
// A compose LOAD failure (unresolved $ref / $patch / forbidden meta key) is NOT
// valid:false — it is reported as a fatal {"error": …} envelope on stdout. The
// gateway distinguishes a load failure from a validation result. valid:false
// carries field errors; a load failure carries no validation result at all.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/polyspec/polyspec/packages/validator-go/validator/v2/compose"
	"github.com/polyspec/polyspec/packages/validator-go/validator/v2/validate"
)

// request is the stdin envelope. spec and data stay raw so the v2 entry point
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
	// DATA pass, SPEC-V2 §9): a list carries no rows. The form path is unchanged.
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
		// A compose LOAD failure (ComposeLoadError) or a decode failure is NOT a
		// validation result. Report it as a fatal {error} envelope — never
		// valid:false. The gateway keys off the absence of "valid".
		var loadErr *compose.ComposeLoadError
		if asLoadError(err, &loadErr) {
			fatalLoad(loadErr)
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

// fatalLoad emits a structured compose-load-failure envelope (code + message +
// trace) so the gateway can surface WHY the spec failed to come into existence,
// distinct from a plain validation failure.
func fatalLoad(le *compose.ComposeLoadError) {
	out, _ := json.Marshal(map[string]any{
		"error": le.Message,
		"code":  string(le.Code),
		"trace": le.Trace,
	})
	fmt.Println(string(out))
	os.Exit(1)
}
