package validate

// CRUDUI list-spec validation entry point (schema §9). The READ sister of the form
// Validate entry (index.go). JS reference parity: a list-spec reuses the SAME two
// structural passes the form path runs — compose (G5, §5) and forbidden-scan
// (§6) — and NOTHING ELSE.
//
// Why only two passes (schema §9.1): a list declares the read structure
// (columns / sort / pagination / actions / design / search); the rows are
// INJECTED by the server (DB-agnostic), never carried by the spec. The DATA
// validate pass (§3 + §2 G1, index.go Validator) evaluates field validate-slot
// rules against DATA VALUES — with no rows there is no data to evaluate, so that
// pass does not apply to a list. The 4-language structural gate a list shares with
// a form is therefore exactly:
//
//	(1) compose — ComposeSpec expands a root-level $ref/$patch; ComposeProperties
//	    expands the columns map (each column may carry $ref/$patch, the SAME engine
//	    as form properties) and the search form-spec reference. An unresolved
//	    composition is a *compose.ComposeLoadError (a LOAD failure, never
//	    valid:false) — the spec never comes into existence.
//	(2) forbidden-scan — ScanForbiddenKeys walks the COMPOSED list tree to ANY
//	    depth (columns / each Column / CellFormat options bucket / actions / sort /
//	    pagination / design / search sub-form) and rejects a forbidden meta key
//	    (display_switch / if / when / show_if / _ / x{key} … §6) as a LOAD failure.
//
// The "schema-shape" gates a list does NOT run here — additionalProperties:false
// (1급 closure), required:columns, the sort.dir / pagination.mode enums, and the
// CellFormat anyOf polymorphism — live ONLY in the meta-schema (ajv,
// schema/form-spec-model.schema.json #/definitions/List, exercised by
// validator-js/src/list-metaschema.conformance.test.ts), exactly as for a form.
// This entry invents NO new structural rule; it reuses the form's pass 1 + pass 2.
//
// Go ≥ 1.18: interface{} is spelled any. No eval.

import (
	"fmt"

	model "github.com/polyspec/crudui/packages/validator-go/validator"
	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
)

// ValidateList runs the two structural passes (compose → forbidden-scan) over a
// list-spec given as the engine value model (*compose.OMap). It returns a clean
// ValidationResult (valid:true, no errors) when the list composes and scans clean
// — a list carries no rows, so there is no DATA pass to produce field errors. An
// unresolved composition or a forbidden meta key at any depth returns a
// *compose.ComposeLoadError (the caller distinguishes a LOAD failure from a
// validation result), identical to the form path.
func ValidateList(spec *compose.OMap, opts Options) (ValidationResult, error) {
	if spec == nil {
		spec = compose.NewOMap()
	}
	loader := compose.NewMemoryLoader(map[string]*compose.OMap(opts.Files))
	composeOpts := compose.ComposeOptions{Basepath: opts.Basepath}

	// Pass 1a (G5): compose the list ROOT — expand a root-level $ref/$patch. The
	// list root is itself a composition entry point (SPEC §9.1: a list may be a
	// $ref overlay), the SAME as a form spec root.
	composed, err := compose.ComposeSpec(spec, loader, composeOpts)
	if err != nil {
		return ValidationResult{}, err
	}

	// Pass 1b (G5): compose the columns map. ComposeSpec only recurses into
	// `properties`; the columns map is the list's field map (SPEC §9.1: columns is
	// the read sister of properties), so its $ref/$patch is expanded here with the
	// SAME ComposeProperties the form properties layer uses. Each column entry may
	// carry $ref/$patch (ok-compose-ref-patch-columns).
	if cols, ok := composed.Get("columns"); ok {
		if cm, isMap := cols.(*compose.OMap); isMap {
			expanded, cerr := compose.ComposeProperties(cm, loader, composeOpts)
			if cerr != nil {
				return ValidationResult{}, cerr
			}
			composed.Set("columns", expanded)
		}
	}

	// Pass 1c (G5): compose the search form-spec reference. search is INPUT (SPEC
	// §9.1: search = a form-spec reference); its $ref/$patch resolves to a sub-form
	// through the SAME ComposeSpec, and that sub-form then rides pass 2 below. No
	// new search-specific logic.
	if s, ok := composed.Get("search"); ok {
		if sm, isMap := s.(*compose.OMap); isMap {
			expandedSearch, serr := compose.ComposeSpec(sm, loader, composeOpts)
			if serr != nil {
				return ValidationResult{}, serr
			}
			composed.Set("search", expandedSearch)
		}
	}

	// Pass 2 (§6): forbidden-scan the WHOLE composed list tree to arbitrary depth.
	// The scanner is a generic tree walker (form parity: index.go scans the
	// composed properties), so it applies to the list tree unchanged — a forbidden
	// key anywhere (column key, CellFormat options bucket, search sub-form, …) is a
	// LOAD failure. Root prefix "list" makes the dotted trace point into the list
	// tree.
	if scanErr := model.ScanForbiddenKeys(composed, []string{"list"}); scanErr != nil {
		return ValidationResult{}, scanErr
	}

	// A list has no rows → no DATA pass. A clean list is valid with no errors. The
	// emitted shape matches the form path (Errors is [] not nil at the wire).
	return ValidationResult{Valid: true, Errors: nil}, nil
}

// ValidateListJSON decodes a raw JSON list-spec (compose.DecodeOrdered so
// declaration order survives) and the optional { key: rawJSON } file set, then
// runs ValidateList. Mirrors ValidateJSON (the form entry) for the CLI / gateway
// subprocess wire. A list carries no data, so there is no data argument.
func ValidateListJSON(specJSON []byte, filesJSON map[string][]byte, basepath string) (ValidationResult, error) {
	specAny, err := compose.DecodeOrdered(specJSON)
	if err != nil {
		return ValidationResult{}, fmt.Errorf("validate-list: spec decode: %w", err)
	}
	spec, ok := specAny.(*compose.OMap)
	if !ok {
		return ValidationResult{}, fmt.Errorf("validate-list: spec is not an object")
	}

	files := FileSet{}
	for k, raw := range filesJSON {
		docAny, derr := compose.DecodeOrdered(raw)
		if derr != nil {
			return ValidationResult{}, fmt.Errorf("validate-list: file %q decode: %w", k, derr)
		}
		doc, isMap := docAny.(*compose.OMap)
		if !isMap {
			return ValidationResult{}, fmt.Errorf("validate-list: file %q is not an object", k)
		}
		files[k] = doc
	}

	return ValidateList(spec, Options{Files: files, Basepath: basepath})
}
