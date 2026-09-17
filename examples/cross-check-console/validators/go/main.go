// Package main is the Go validator process of the cross-check console. It reads
// one JSON request on standard input, calls the public API of the validator
// module (validate.ValidateJSON, ValidateListJSON and ValidateDetailJSON) and
// writes one JSON response on standard output with the exit status. The
// contract, shared with the JavaScript, PHP and Rust programs, is in
// ../README.md. It adds no validation logic.
//
// Request rules, checked in this order; each failure exits 1 with stdout
// exactly {"error": <message>}:
//  1. stdin is not valid JSON → "Request must be valid JSON"
//  2. the request is not a JSON object → "Request must be an object"
//  3. spec absent or not an object → "Request spec must be an object"
//  4. mode present and not exactly "form", "list" or "detail" (null and
//     non-strings included) → "Unsupported validation mode"
//  5. files present, not null and not an object → "Request files must be an object"
//  6. any files member not an object → "Request files must contain objects"
//  7. basepath present, not null and not a string → "Request basepath must be a string"
//
// Absent or null files/basepath mean none. An absent mode selects form; list
// and detail ignore data. A composition load failure or a form input failure
// exits 2 with stdout {"error": <message>, "code": <code>, "at": <trace joined
// with "." or "">}. In form mode an omitted "data" member validates {}.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
	"github.com/polyspec/crudui/packages/validator-go/validator/validate"
)

// request is the checked stdin envelope. spec and data stay raw so the model
// entry point decodes them itself — spec via compose.DecodeOrdered (declaration
// order survives), data via encoding/json. files/basepath drive $ref resolution.
type request struct {
	Spec     json.RawMessage
	Data     json.RawMessage
	Files    map[string][]byte
	Basepath string
	Mode     string
}

func main() {
	inputBytes, err := io.ReadAll(os.Stdin)
	if err != nil {
		fatal("Request must be valid JSON")
		return
	}

	req, msg := parseRequest(inputBytes)
	if msg != "" {
		fatal(msg)
		return
	}

	// Mode dispatch. list and detail run compose → forbidden-scan only (no DATA
	// pass): they carry no input data.
	var result validate.ValidationResult
	switch req.Mode {
	case "form":
		result, err = validate.ValidateJSON(req.Spec, req.Data, req.Files, req.Basepath)
	case "list":
		result, err = validate.ValidateListJSON(req.Spec, req.Files, req.Basepath)
	case "detail":
		result, err = validate.ValidateDetailJSON(req.Spec, req.Files, req.Basepath)
	}
	if err != nil {
		var loadErr *compose.ComposeLoadError
		if errors.As(err, &loadErr) {
			failure(loadErr.Message, string(loadErr.Code), strings.Join(loadErr.Trace, "."))
			return
		}
		var inputErr *validate.FormInputError
		if errors.As(err, &inputErr) {
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

// Request error messages shared by every validator process.
const (
	msgInvalidJSON = "Request must be valid JSON"
	msgNotObject   = "Request must be an object"
	msgSpec        = "Request spec must be an object"
	msgMode        = "Unsupported validation mode"
	msgFiles       = "Request files must be an object"
	msgFileMembers = "Request files must contain objects"
	msgBasepath    = "Request basepath must be a string"
)

// jsonKind returns the first byte of a raw JSON value ('{', '[', '"', 'n', ...),
// or 0 for an empty value.
func jsonKind(raw []byte) byte {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return 0
	}
	return trimmed[0]
}

// parseRequest checks the request rules in their shared order and returns the
// first failing message, or "" with the checked request.
func parseRequest(input []byte) (request, string) {
	var req request
	if !json.Valid(input) {
		return req, msgInvalidJSON
	}
	if jsonKind(input) != '{' {
		return req, msgNotObject
	}
	var members map[string]json.RawMessage
	if err := json.Unmarshal(input, &members); err != nil {
		return req, msgNotObject
	}

	spec, ok := members["spec"]
	if !ok || jsonKind(spec) != '{' {
		return req, msgSpec
	}
	req.Spec = spec

	req.Mode = "form"
	if raw, present := members["mode"]; present {
		var mode string
		if jsonKind(raw) != '"' || json.Unmarshal(raw, &mode) != nil {
			return req, msgMode
		}
		switch mode {
		case "form", "list", "detail":
			req.Mode = mode
		default:
			return req, msgMode
		}
	}

	req.Files = map[string][]byte{}
	if raw, present := members["files"]; present && jsonKind(raw) != 'n' {
		if jsonKind(raw) != '{' {
			return req, msgFiles
		}
		var files map[string]json.RawMessage
		if err := json.Unmarshal(raw, &files); err != nil {
			return req, msgFiles
		}
		for k, doc := range files {
			if jsonKind(doc) != '{' {
				return req, msgFileMembers
			}
			req.Files[k] = []byte(doc)
		}
	}

	if raw, present := members["basepath"]; present && jsonKind(raw) != 'n' {
		if jsonKind(raw) != '"' || json.Unmarshal(raw, &req.Basepath) != nil {
			return req, msgBasepath
		}
	}

	req.Data = members["data"]
	return req, ""
}

// fatal emits a malformed-request response {"error": msg} and exits 1.
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
