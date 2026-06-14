package validate

// CRUDUI recursive forbidden-scan conformance — Go verification against the shared
// 4-language fixture.
//
// Single truth = tests/fixtures/spec-validity/cases.json, the cross-language
// contract for schema §6 global meta-key rejection: a clean spec passes; a
// forbidden meta key found at ANY depth (slot/bucket body and one level below,
// deep child subtrees, array elements, $ref-inherited bases) is a LOAD ERROR,
// never valid:true. JS / PHP / Go / Rust load this ONE file and must reproduce
// it identically. This test re-runs the real load path
// (ValidateJSON = compose → forbidden-scan → validate) against it.
//
// Each ok case must validate without a load error. Each error case must return a
// *compose.ComposeLoadError whose Code is the fixture error_code AND whose path
// (Trace, dotted) equals the fixture at_path — depth is load-bearing, so the path
// is asserted, not just the code. Never weaken an assertion to turn red green; fix
// the engine, the fixture, or both at their shared source — not this test.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/crudui/crudui/packages/validator-go/validator/compose"
)

type forbiddenScanCase struct {
	Name   string          `json:"name"`
	Note   string          `json:"note"`
	Spec   json.RawMessage `json:"spec"`
	Files  json.RawMessage `json:"files"`
	Expect json.RawMessage `json:"expect"`
}

// expectError is the {error_code, at_path} object form of a fixture expectation.
type expectError struct {
	ErrorCode string `json:"error_code"`
	AtPath    string `json:"at_path"`
}

func loadForbiddenScanFixtures(t *testing.T) []forbiddenScanCase {
	t.Helper()
	// validator-go/validator/validate → repo root is five levels up.
	path := filepath.Join("..", "..", "..", "..", "tests", "fixtures", "spec-validity", "cases.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("shared spec-validity fixture not found at %s: %v", path, err)
	}
	var cases []forbiddenScanCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("fixture json decode: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("fixture is empty")
	}
	return cases
}

// filesFor decodes the optional fixture files map into the { key: rawJSON } shape
// ValidateJSON consumes.
func filesFor(t *testing.T, c forbiddenScanCase) map[string][]byte {
	t.Helper()
	files := map[string][]byte{}
	if len(c.Files) == 0 {
		return files
	}
	var fm map[string]json.RawMessage
	if err := json.Unmarshal(c.Files, &fm); err != nil {
		t.Fatalf("%s: files decode: %v", c.Name, err)
	}
	for k, v := range fm {
		files[k] = []byte(v)
	}
	return files
}

// expectIsOK reports whether the fixture expect field is the literal string "ok".
func expectIsOK(raw json.RawMessage) bool {
	var s string
	return json.Unmarshal(raw, &s) == nil && s == "ok"
}

func TestForbiddenScanMatchesFixture(t *testing.T) {
	for _, c := range loadForbiddenScanFixtures(t) {
		c := c
		t.Run(c.Name, func(t *testing.T) {
			// Data is irrelevant to the scan; pass empty. The scan runs in the load
			// path before any data-driven validation.
			_, err := ValidateJSON(c.Spec, nil, filesFor(t, c), "")

			if expectIsOK(c.Expect) {
				if err != nil {
					t.Fatalf("clean spec must pass the load path, got error: %v", err)
				}
				return
			}

			var want expectError
			if uerr := json.Unmarshal(c.Expect, &want); uerr != nil {
				t.Fatalf("%s: expect must be \"ok\" | {error_code, at_path}: %v", c.Name, uerr)
			}
			if err == nil {
				t.Fatalf("expected load error %s at %s, but validated successfully",
					want.ErrorCode, want.AtPath)
			}
			le, ok := err.(*compose.ComposeLoadError)
			if !ok {
				t.Fatalf("expected *compose.ComposeLoadError, got %T: %v", err, err)
			}
			if string(le.Code) != want.ErrorCode {
				t.Fatalf("error code mismatch: expected %s, got %s (%s)",
					want.ErrorCode, le.Code, le.Message)
			}
			gotPath := strings.Join(le.Trace, ".")
			if gotPath != want.AtPath {
				t.Fatalf("error path mismatch: expected %s, got %s", want.AtPath, gotPath)
			}
		})
	}
}

// TestForbiddenScanEveryCaseDeclaresExpectation locks the contract shape: no
// fixture case may silently omit its expectation.
func TestForbiddenScanEveryCaseDeclaresExpectation(t *testing.T) {
	cases := loadForbiddenScanFixtures(t)
	for _, c := range cases {
		if expectIsOK(c.Expect) {
			continue
		}
		var want expectError
		if err := json.Unmarshal(c.Expect, &want); err != nil || want.ErrorCode == "" || want.AtPath == "" {
			t.Errorf("%s must declare expect: \"ok\" | {error_code, at_path}", c.Name)
		}
	}
}
