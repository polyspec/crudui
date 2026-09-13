package validate

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
)

// Validation conformance verifies SPEC §2 G5, §3 and §2 G1.
//
// The shared fixture tests/fixtures/validate/cases.json defines the expected
// validity, errors, key order and messages for every runtime, or the exact
// failure record of a load or input failure.

type failureRecord struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	At      string `json:"at"`
}

type validateCase struct {
	Name          string          `json:"name"`
	Note          string          `json:"note"`
	Spec          json.RawMessage `json:"spec"`
	Data          json.RawMessage `json:"data"`
	Files         json.RawMessage `json:"files"`
	Expected      *expectedResult `json:"expected"`
	ExpectFailure *failureRecord  `json:"expectFailure"`
}

// failureOf returns the cross-language failure record of a validation failure.
func failureOf(err error) *failureRecord {
	switch e := err.(type) {
	case *compose.ComposeLoadError:
		return &failureRecord{Code: string(e.Code), Message: e.Message, At: strings.Join(e.Trace, ".")}
	case *FormInputError:
		return &failureRecord{Code: e.Code(), Message: e.Message, At: ""}
	default:
		return nil
	}
}

type expectedResult struct {
	Valid  bool              `json:"valid"`
	Errors []json.RawMessage `json:"errors"`
}

func loadValidateFixtures(t *testing.T) []validateCase {
	t.Helper()
	// validator-go/validator/model/validate → repo root is five levels up.
	path := filepath.Join("..", "..", "..", "..", "tests", "fixtures", "validate", "cases.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("shared validate fixture not found at %s: %v", path, err)
	}
	var cases []validateCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("fixture json decode: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("fixture is empty")
	}
	return cases
}

func TestValidateMatchesFixture(t *testing.T) {
	for _, c := range loadValidateFixtures(t) {
		c := c
		t.Run(c.Name, func(t *testing.T) {
			files := map[string][]byte{}
			if len(c.Files) > 0 {
				var fm map[string]json.RawMessage
				if err := json.Unmarshal(c.Files, &fm); err != nil {
					t.Fatalf("files decode: %v", err)
				}
				for k, v := range fm {
					files[k] = []byte(v)
				}
			}

			result, err := ValidateJSON(c.Spec, c.Data, files, "")

			if (c.Expected == nil) == (c.ExpectFailure == nil) {
				t.Fatalf("fixture case %q must declare exactly one of expected or expectFailure", c.Name)
			}

			// Failure case: no validation result, the exact failure record.
			if c.ExpectFailure != nil {
				if err == nil {
					t.Fatalf("expected failure %+v, but validated successfully (valid=%v)",
						*c.ExpectFailure, result.Valid)
				}
				got := failureOf(err)
				if got == nil {
					t.Fatalf("expected a load or input failure, got %T: %v", err, err)
				}
				if *got != *c.ExpectFailure {
					t.Fatalf("failure mismatch\n want: %+v\n  got: %+v", *c.ExpectFailure, *got)
				}
				return
			}

			if err != nil {
				t.Fatalf("expected success, got error: %v", err)
			}

			if result.Valid != c.Expected.Valid {
				t.Errorf("valid mismatch: expected %v, got %v\n errors: %s",
					c.Expected.Valid, result.Valid, dumpErrors(t, result.Errors))
			}

			wantErrors := make([]map[string]any, len(c.Expected.Errors))
			for i, raw := range c.Expected.Errors {
				var m map[string]any
				if err := json.Unmarshal(raw, &m); err != nil {
					t.Fatalf("expected error decode: %v", err)
				}
				wantErrors[i] = normalizeGeneric(m).(map[string]any)
			}

			gotErrors := make([]map[string]any, len(result.Errors))
			for i, e := range result.Errors {
				gotErrors[i] = normalizeError(t, e)
			}

			if len(wantErrors) != len(gotErrors) {
				t.Fatalf("error count mismatch: expected %d, got %d\n want: %s\n  got: %s",
					len(wantErrors), len(gotErrors), dumpJSON(t, wantErrors), dumpJSON(t, gotErrors))
			}
			for i := range wantErrors {
				if !reflect.DeepEqual(wantErrors[i], gotErrors[i]) {
					t.Errorf("error[%d] mismatch\n want: %s\n  got: %s",
						i, dumpJSON(t, wantErrors[i]), dumpJSON(t, gotErrors[i]))
				}
			}
		})
	}
}

// normalizeError converts a ValidationError to the generic map the fixture side
// produces (numbers as float64, arrays/objects recursed).
func normalizeError(t *testing.T, e ValidationError) map[string]any {
	t.Helper()
	b, err := json.Marshal(e)
	if err != nil {
		t.Fatalf("error marshal: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("error remarshal: %v", err)
	}
	return normalizeGeneric(m).(map[string]any)
}

// normalizeGeneric canonicalizes a decoded JSON tree (numbers float64, recurse).
func normalizeGeneric(v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, val := range x {
			out[k] = normalizeGeneric(val)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, val := range x {
			out[i] = normalizeGeneric(val)
		}
		return out
	default:
		return v
	}
}

func dumpErrors(t *testing.T, errs []ValidationError) string {
	t.Helper()
	return dumpJSON(t, errs)
}

func dumpJSON(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		return "<marshal error>"
	}
	return string(b)
}
