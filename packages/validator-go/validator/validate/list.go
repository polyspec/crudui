package validate

// List validation processes the read structure defined by SPEC §9. A list
// contains columns, sorting, pagination, actions, design and search settings.
// The server supplies rows separately, so this entry does not validate row data.
// It performs these structure operations:
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
// The meta-schema validates closed objects, required columns, the sort.dir and
// pagination.mode enums, and CellFormat polymorphism. This runtime does not
// repeat those checks. They are defined in the Ajv entry at
// schema/crudui-model.schema.json #/definitions/List, exercised by
// validator-ts/src/model/list-metaschema.conformance.test.ts.
//
// Go ≥ 1.18: interface{} is spelled any. No eval.

import (
	"fmt"

	model "github.com/polyspec/crudui/packages/validator-go/validator"
	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
)

// ValidateList runs composition and forbidden-key scanning over a
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

	// Pass 1a/1b (G5): compose the list ROOT (a list may be a $ref overlay, SPEC
	// §9.1) and the columns map — the read sister of properties — with the SAME
	// ComposeProperties the form properties layer uses.
	composed, err := composeRootAndFieldMap(spec, "columns", loader, composeOpts)
	if err != nil {
		return ValidationResult{}, err
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
	// LOAD failure. The trace starts at the list root key (columns.<name>…), as
	// in every implementation and the shared list-validity fixture.
	if scanErr := model.ScanForbiddenKeys(composed, nil); scanErr != nil {
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

// composeRootAndFieldMap composes a read-structure root with ComposeSpec, then
// expands its field map under mapKey (list columns, detail fields) with
// ComposeProperties when that member is an object. Shared by ValidateList and
// ValidateDetail so both roots compose by one rule.
func composeRootAndFieldMap(spec *compose.OMap, mapKey string, loader compose.FileLoader, opts compose.ComposeOptions) (*compose.OMap, error) {
	composed, err := compose.ComposeSpec(spec, loader, opts)
	if err != nil {
		return nil, err
	}
	if m, ok := composed.Get(mapKey); ok {
		if om, isMap := m.(*compose.OMap); isMap {
			expanded, cerr := compose.ComposeProperties(om, loader, opts)
			if cerr != nil {
				return nil, cerr
			}
			composed.Set(mapKey, expanded)
		}
	}
	return composed, nil
}
