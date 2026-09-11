package validate

// List structure conformance verifies the Go runtime against
// tests/fixtures/list-validity/cases.json. The meta-schema and runtime check
// separate requirements from SPEC §9.4:
//
//	(A) The meta-schema checks required columns, closed objects, sort.dir and
//	    pagination.mode enums, and CellFormat polymorphism. Ajv treats $ref and
//	    $patch as plain object keys.
//	(B) The runtime resolves $ref and $patch and rejects a §6 forbidden key at
//	    any depth with *compose.ComposeLoadError. It does not repeat meta-schema
//	    shape checks.
//
// This test classifies each fixture from its forbidden keys and composition
// entries independently of the runtime implementation:
//
//	1. spec carries a §6 forbidden key (any depth)  → engine REJECTS it
//	   (ComposeLoadError code FORBIDDEN_META_KEY).
//	2. spec carries a $ref/$patch compose entry → the columns/search files are
//	   supplied and the runtime composes and scans without a load error.
//	3. otherwise → the runtime produces no load error. The meta-schema reports any
//	   required, enum, anyOf or non-§6 additional-property error separately.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
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
	// validator-go/validator/model/validate → repo root is five levels up.
	path := filepath.Join("..", "..", "..", "..", "tests", "fixtures", "list-validity", "cases.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("shared list-validity fixture not found at %s: %v", path, err)
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

// list§6ForbiddenKeys is the SPEC §6 forbidden meta-key set, restated here
// INDEPENDENTLY of the engine (validator/model/types.go ForbiddenMetaKeys). The test
// must not import the engine's own list to decide what the engine should reject —
// that would be circular. §6 is the contract; this is the contract restated.
var listForbiddenKeys = map[string]bool{
	"display_switch": true, "display_target": true,
	"if": true, "when": true, "show_if": true,
	"_": true, "seqtokey": true, "__13hex__": true,
	"$after": true, "$before": true, "$merge": true, "$remove": true,
	"xclass": true, "xstyle": true,
}

// isListForbiddenKey mirrors SPEC §6: an enumerated literal OR an x{key}
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

			// Bucket 3 has no forbidden key or composition entry. The runtime does
			// not report meta-schema shape errors as load errors.
			if err != nil {
				t.Fatalf("%s: runtime must produce no load error for a meta-schema shape result, got: %v", c.Name, err)
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
