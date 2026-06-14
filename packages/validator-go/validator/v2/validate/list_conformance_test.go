package validate

// v2 list-spec structural-gate conformance — Go verification against the shared
// 4-language fixture tests/fixtures/v2-list-validity/cases.json.
//
// That ONE fixture is the cross-language single truth for the list-spec read
// surface (SPEC-V2 §9.4). It is read by TWO gates with DISJOINT ownership, and
// this test asserts ONLY the gate the 4-language engine owns:
//
//	(A) the meta-schema gate (ajv, schema/polyspec-v2.schema.json
//	    #/definitions/List; validator-ts list-metaschema.conformance.test.ts) owns
//	    the "schema-shape" verdicts — required:columns, additionalProperties:false
//	    (1급 closure), the sort.dir / pagination.mode enums, and the CellFormat
//	    anyOf polymorphism. ajv does NOT resolve $ref; it treats $ref/$patch as
//	    plain object keys.
//	(B) the 4-language ENGINE gate (this package) owns the SAME two structural
//	    passes a form runs — compose (G5, §5) and forbidden-scan (§6) — and nothing
//	    else. It RESOLVES $ref and rejects a §6 forbidden key at any depth as a
//	    *compose.ComposeLoadError. It is SILENT on schema-shape (that is gate A).
//
// So each fixture case is asserted in the bucket its OWN data places it in
// (derived here, independent of the engine — §6 forbidden set + the $ref/$patch
// compose-entry sigils are the contract, encoded in this test, that the engine
// must match):
//
//	1. spec carries a §6 forbidden key (any depth)  → engine REJECTS it
//	   (ComposeLoadError code FORBIDDEN_META_KEY). This is gate B. It catches
//	   red-forbidden-column-key, red-x-prefixed-column-key, red-unknown-column-key
//	   (show_if is a §6 key — ajv reports it as additionalProperties, the engine as
//	   FORBIDDEN_META_KEY: SAME rejection, DIFFERENT gate), red-forbidden-key-in-
//	   format-options.
//	2. spec carries a $ref/$patch compose entry → the columns/search files are
//	   supplied and the engine composes + scans CLEAN (no LOAD error). This is gate
//	   B's compose reuse — the SAME ComposeProperties/ComposeSpec the form path runs
//	   (ok-compose-ref-patch-columns, ok-search-form-ref).
//	3. otherwise → the engine produces NO LOAD error (a clean structural verdict).
//	   This covers the plain ok cases AND the meta-schema-only RED cases
//	   (required / enum / anyOf / non-§6 additionalProperties): the engine must NOT
//	   fabricate a LOAD error for a shape violation it does not own — gate A does.
//
// Never weaken an assertion to turn red green: the §6 set and the compose engine
// are the shared contract; fix the engine or the fixture at their source, not this
// test. The bucketing here is the cross-language definition of WHICH gate owns a
// case — it is the test's load-bearing claim.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/polyspec/polyspec/packages/validator-go/validator/v2/compose"
)

type listValidityCase struct {
	Name   string          `json:"name"`
	Note   string          `json:"note"`
	Expect string          `json:"expect"`
	Reason string          `json:"reason"`
	Spec   json.RawMessage `json:"spec"`
}

func loadListValidityFixtures(t *testing.T) []listValidityCase {
	t.Helper()
	// validator-go/validator/v2/validate → repo root is five levels up.
	path := filepath.Join("..", "..", "..", "..", "..", "tests", "fixtures", "v2-list-validity", "cases.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("shared v2-list-validity fixture not found at %s: %v", path, err)
	}
	var cases []listValidityCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("fixture json decode: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("fixture is empty")
	}
	return cases
}

// list§6ForbiddenKeys is the SPEC-V2 §6 forbidden meta-key set, restated here
// INDEPENDENTLY of the engine (validator/v2/types.go ForbiddenMetaKeys). The test
// must not import the engine's own list to decide what the engine should reject —
// that would be circular. §6 is the contract; this is the contract restated.
var listForbiddenKeys = map[string]bool{
	"display_switch": true, "display_target": true,
	"if": true, "when": true, "show_if": true,
	"_": true, "seqtokey": true, "__13hex__": true,
	"$after": true, "$before": true, "$merge": true, "$remove": true,
	"xclass": true, "xstyle": true,
}

// isListForbiddenKey mirrors SPEC-V2 §6: an enumerated literal OR an x{key}
// comment (x followed by ≥1 char). The bare "x" is not a comment. $ref/$patch are
// compose sigils, NOT forbidden (compose consumes them before the scan).
func isListForbiddenKey(key string) bool {
	if listForbiddenKeys[key] {
		return true
	}
	return len(key) > 1 && strings.HasPrefix(key, "x")
}

// specHasForbiddenKey walks a decoded JSON tree (map / []any / scalar) for any §6
// forbidden key at any depth — the test's independent classifier for bucket 1.
func specHasForbiddenKey(node any) bool {
	switch n := node.(type) {
	case map[string]any:
		for k, v := range n {
			if isListForbiddenKey(k) {
				return true
			}
			if specHasForbiddenKey(v) {
				return true
			}
		}
	case []any:
		return slices.ContainsFunc(n, specHasForbiddenKey)
	}
	return false
}

// specHasComposeEntry reports whether the tree carries a $ref/$patch compose entry
// at any depth — the test's classifier for bucket 2 (compose reuse).
func specHasComposeEntry(node any) bool {
	switch n := node.(type) {
	case map[string]any:
		for k, v := range n {
			if k == "$ref" || k == "$patch" {
				return true
			}
			if specHasComposeEntry(v) {
				return true
			}
		}
	case []any:
		return slices.ContainsFunc(n, specHasComposeEntry)
	}
	return false
}

// listComposeFiles supplies the in-memory file set the bucket-2 ($ref) cases
// reference. The shared fixture declares no files (ajv does not resolve $ref); the
// engine DOES resolve, so the referenced docs are supplied here to drive the real
// compose reuse — the SAME ComposeProperties/ComposeSpec the form path runs. The
// docs are clean (no §6 key) so the case composes AND forbidden-scans clean,
// proving the columns/search $ref path expands without leaking a LOAD error.
func listComposeFiles() map[string][]byte {
	return map[string][]byte{
		// A bare-path $ref descends the default detectKey ["properties"] (ref.go /
		// ref.ts) — the SAME form-spec convention columns reuse. The base file exposes
		// its column map under `properties`; the resolver flattens it into the columns
		// base. The docs carry no §6 key so the case composes AND scans clean.
		"base-columns.yml": []byte(`{"properties":{"id":{"field":".id","label":"ID"}}}`),
		"search-form.yml":  []byte(`{"properties":{"q":{"type":"text"}}}`),
	}
}

func TestValidateListMatchesFixture(t *testing.T) {
	for _, c := range loadListValidityFixtures(t) {
		c := c
		t.Run(c.Name, func(t *testing.T) {
			var tree any
			if err := json.Unmarshal(c.Spec, &tree); err != nil {
				t.Fatalf("%s: spec decode: %v", c.Name, err)
			}

			forbidden := specHasForbiddenKey(tree)
			composeEntry := specHasComposeEntry(tree)

			files := map[string][]byte{}
			if composeEntry {
				files = listComposeFiles()
			}
			_, err := ValidateListJSON(c.Spec, files, "")

			// Bucket 1 — a §6 forbidden key: the engine MUST reject it as a
			// FORBIDDEN_META_KEY load failure (regardless of the fixture's ajv reason).
			if forbidden {
				if err == nil {
					t.Fatalf("%s: spec carries a §6 forbidden key — engine must reject it as a LOAD failure, got valid", c.Name)
				}
				le, ok := err.(*compose.ComposeLoadError)
				if !ok {
					t.Fatalf("%s: expected *compose.ComposeLoadError, got %T: %v", c.Name, err, err)
				}
				if le.Code != compose.ForbiddenMetaKey {
					t.Fatalf("%s: expected code FORBIDDEN_META_KEY, got %s (%s)", c.Name, le.Code, le.Message)
				}
				return
			}

			// Bucket 2 — a $ref/$patch compose entry: the engine composes the supplied
			// files and forbidden-scans CLEAN. No LOAD error (the compose reuse path
			// works); a clean list is valid with no errors (no rows → no DATA pass).
			if composeEntry {
				if err != nil {
					t.Fatalf("%s: compose reuse must resolve the supplied $ref and scan clean, got LOAD error: %v", c.Name, err)
				}
				return
			}

			// Bucket 3 — no forbidden key, no compose entry: the structural gate is
			// SILENT. The engine must NOT fabricate a LOAD error — schema-shape
			// (required / enum / anyOf / non-§6 additionalProperties) is the meta-schema's
			// job (gate A). This holds for the plain ok cases AND the meta-schema-only
			// RED cases.
			if err != nil {
				t.Fatalf("%s: engine must produce no LOAD error (schema-shape is the meta-schema's gate, not the engine's), got: %v", c.Name, err)
			}
		})
	}
}

// TestValidateListCleanListIsValid pins the no-rows semantics: a clean list-spec
// (composes + scans clean) is valid:true with an empty error set — a list carries
// no rows, so there is no DATA pass to produce field errors.
func TestValidateListCleanListIsValid(t *testing.T) {
	spec := []byte(`{"columns":{"name":{"field":".name","label":"Name"}}}`)
	res, err := ValidateListJSON(spec, nil, "")
	if err != nil {
		t.Fatalf("clean list must not error: %v", err)
	}
	if !res.Valid {
		t.Fatalf("clean list must be valid:true, got %v", res.Valid)
	}
	if len(res.Errors) != 0 {
		t.Fatalf("clean list must carry no errors (no rows → no DATA pass), got %d", len(res.Errors))
	}
}

// TestValidateListForbiddenTraceIntoListTree pins that the forbidden-scan trace
// points INTO the list tree (root prefix "list" + the path to the offending key),
// so a load failure says WHERE in the list a forbidden key sits.
func TestValidateListForbiddenTraceIntoListTree(t *testing.T) {
	spec := []byte(`{"columns":{"name":{"field":".name"},"display_switch":{"field":".x"}}}`)
	_, err := ValidateListJSON(spec, nil, "")
	le, ok := err.(*compose.ComposeLoadError)
	if !ok {
		t.Fatalf("expected *compose.ComposeLoadError, got %T: %v", err, err)
	}
	got := strings.Join(le.Trace, ".")
	want := "list.columns.display_switch"
	if got != want {
		t.Fatalf("forbidden trace: want %s, got %s", want, got)
	}
}
