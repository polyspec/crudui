package validate

// v2 validation entry point (SPEC-V2 §2 pipeline). Wires the three passes in
// order: G5 compose first → §3 traversal → §2 G1 value evaluation. JS index.ts
// (validateV2) parity.
//
//	(1) compose — ComposeProperties / ComposeSpec expands $ref / $patch into a
//	    single spec. An unresolved composition returns a *compose.ComposeLoadError
//	    HERE (a LOAD failure, NOT valid:false) — the spec never comes into
//	    existence, so there is no validation result. This closes the v1
//	    valid:true-on-unresolved-$ref gap (ProductNft.yml:873).
//	(2/3) validate — ValidatorV2 traverses the composed spec and runs the validate
//	    slot (conditional rule values via the v2 expression engine).

import (
	"encoding/json"
	"fmt"

	v2 "github.com/polyspec/polyspec/packages/validator-go/validator/v2"
	"github.com/polyspec/polyspec/packages/validator-go/validator/v2/compose"
)

// FileSet is a virtual file set $ref resolves against ({ key: doc }).
type FileSet map[string]*compose.OMap

// Options configures a v2 validation run.
type Options struct {
	// Files is the virtual file set for $ref resolution (default: empty).
	Files FileSet
	// Basepath is the basepath for relative $ref resolution.
	Basepath string
}

// Validate validates data against a v2 spec given as the engine value model
// (*compose.OMap, decoded with compose.DecodeOrdered). The spec may carry
// $ref / $patch; they are expanded first. An unresolved composition returns a
// *compose.ComposeLoadError (the caller distinguishes a LOAD failure from
// valid:false). G5 → §3 → §2 G1.
func Validate(spec *compose.OMap, data map[string]any, opts Options) (ValidationResult, error) {
	if spec == nil {
		spec = compose.NewOMap()
	}
	loader := compose.NewMemoryLoader(map[string]*compose.OMap(opts.Files))
	composeOpts := compose.ComposeOptions{Basepath: opts.Basepath}

	// Two entry shapes (JS index.ts):
	//   (a) a full root group spec { type:'group', properties:{…} } — compose the
	//       whole spec, then read its composed properties.
	//   (b) a properties-layer composition entry { $ref, $patch } with no own
	//       properties — compose it AS a properties map directly.
	hasOwnProperties := false
	if v, ok := spec.Get("properties"); ok {
		if _, ok := v.(*compose.OMap); ok {
			hasOwnProperties = true
		}
	}
	isCompositionEntry := spec.Has("$ref") || spec.Has("$patch")

	var properties *compose.OMap
	if isCompositionEntry && !hasOwnProperties {
		composed, err := compose.ComposeProperties(spec, loader, composeOpts)
		if err != nil {
			return ValidationResult{}, err
		}
		properties = composed
	} else {
		composed, err := compose.ComposeSpec(spec, loader, composeOpts)
		if err != nil {
			return ValidationResult{}, err
		}
		if v, ok := composed.Get("properties"); ok {
			if m, ok := v.(*compose.OMap); ok {
				properties = m
			}
		}
		if properties == nil {
			properties = compose.NewOMap()
		}
	}

	// Load-path forbidden-scan (SPEC-V2 §6): walk the composed single spec to
	// arbitrary depth and reject any forbidden meta key BEFORE validation entry.
	// A hit is a *compose.ComposeLoadError (a LOAD failure), never valid:false.
	// This closes the deep-nesting leak the typed model alone could not (R1).
	// JS index.ts parity: scanForbiddenKeys(properties, ['properties']).
	if scanErr := v2.ScanForbiddenKeys(properties, []string{"properties"}); scanErr != nil {
		return ValidationResult{}, scanErr
	}

	return NewValidator(properties).Validate(data), nil
}

// ValidateJSON is a convenience wrapper that decodes a raw JSON spec and raw JSON
// data, then runs Validate. The spec is decoded with compose.DecodeOrdered so
// declaration order survives; data is decoded with encoding/json (objects →
// map[string]any, arrays → []any, numbers → float64). Files is a { key: rawJSON }
// map.
func ValidateJSON(specJSON []byte, dataJSON []byte, filesJSON map[string][]byte, basepath string) (ValidationResult, error) {
	specAny, err := compose.DecodeOrdered(specJSON)
	if err != nil {
		return ValidationResult{}, fmt.Errorf("validate: spec decode: %w", err)
	}
	spec, ok := specAny.(*compose.OMap)
	if !ok {
		return ValidationResult{}, fmt.Errorf("validate: spec is not an object")
	}

	var data map[string]any
	if len(dataJSON) > 0 {
		if err := json.Unmarshal(dataJSON, &data); err != nil {
			return ValidationResult{}, fmt.Errorf("validate: data decode: %w", err)
		}
	}

	files := FileSet{}
	for k, raw := range filesJSON {
		docAny, err := compose.DecodeOrdered(raw)
		if err != nil {
			return ValidationResult{}, fmt.Errorf("validate: file %q decode: %w", k, err)
		}
		doc, ok := docAny.(*compose.OMap)
		if !ok {
			return ValidationResult{}, fmt.Errorf("validate: file %q is not an object", k)
		}
		files[k] = doc
	}

	return Validate(spec, data, Options{Files: files, Basepath: basepath})
}
