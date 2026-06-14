package compose

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

// v2 composition-engine conformance (SPEC-V2 §5, G5).
//
// Single truth = the shared 4-language fixture tests/fixtures/compose/cases.json.
// All four engines (JS / PHP / Go / Rust) load this ONE file and must reproduce
// it. Its values are the JS reference engine's actual output (expanded single
// spec | load-error code); Go matches it bit-for-bit. Never weaken an assertion
// to turn red green; fix the engine, the fixture, or both at their shared source
// — not this test.

type fixtureCase struct {
	Name        string          `json:"name"`
	Note        string          `json:"note"`
	Input       json.RawMessage `json:"input"`
	Expected    json.RawMessage `json:"expected"`
	ExpectError *struct {
		Code string `json:"code"`
	} `json:"expectError"`
}

func loadFixtures(t *testing.T) []fixtureCase {
	t.Helper()
	// validator-go/validator/v2/compose → repo root is five levels up.
	path := filepath.Join("..", "..", "..", "..", "..", "tests", "fixtures", "compose", "cases.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("shared compose fixture not found at %s: %v", path, err)
	}
	var cases []fixtureCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("fixture json decode: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("fixture is empty")
	}
	return cases
}

// inputShape is the ordered-decoded view of a fixture `input`.
type inputShape struct {
	files    map[string]*OMap
	entry    *OMap
	kind     string // "properties" (default) | "spec"
	basepath string
}

// parseInput ordered-decodes the raw `input` object into typed fields, preserving
// declaration order in `files` docs and `entry` (order is load-bearing).
func parseInput(t *testing.T, raw json.RawMessage) inputShape {
	t.Helper()
	decoded, err := decodeOrdered(raw)
	if err != nil {
		t.Fatalf("input decode: %v", err)
	}
	root, ok := isOMap(decoded)
	if !ok {
		t.Fatalf("input is not an object")
	}

	out := inputShape{files: map[string]*OMap{}, kind: "properties"}

	if filesV, ok := root.Get("files"); ok {
		fm, ok := isOMap(filesV)
		if !ok {
			t.Fatalf("input.files is not an object")
		}
		for _, k := range fm.Keys() {
			v, _ := fm.Get(k)
			doc, ok := isOMap(v)
			if !ok {
				t.Fatalf("input.files[%q] is not an object", k)
			}
			out.files[k] = doc
		}
	}

	entryV, ok := root.Get("entry")
	if !ok {
		t.Fatalf("input.entry missing")
	}
	if em, ok := isOMap(entryV); ok {
		out.entry = em
	} else {
		t.Fatalf("input.entry is not an object")
	}

	if kindV, ok := root.Get("kind"); ok {
		if s, ok := kindV.(string); ok {
			out.kind = s
		}
	}
	if bpV, ok := root.Get("basepath"); ok {
		if s, ok := bpV.(string); ok {
			out.basepath = s
		}
	}
	return out
}

func TestComposeMatchesFixture(t *testing.T) {
	for _, c := range loadFixtures(t) {
		c := c
		t.Run(c.Name, func(t *testing.T) {
			in := parseInput(t, c.Input)
			loader := NewMemoryLoader(in.files)
			opts := ComposeOptions{Basepath: in.basepath}

			var result *OMap
			var err error
			if in.kind == "spec" {
				result, err = ComposeSpec(in.entry, loader, opts)
			} else {
				result, err = ComposeProperties(in.entry, loader, opts)
			}

			if c.ExpectError != nil {
				if err == nil {
					t.Fatalf("expected load error %s, but composed successfully", c.ExpectError.Code)
				}
				le, ok := err.(*ComposeLoadError)
				if !ok {
					t.Fatalf("expected *ComposeLoadError, got %T: %v", err, err)
				}
				if string(le.Code) != c.ExpectError.Code {
					t.Fatalf("error code mismatch: expected %s, got %s (%s)",
						c.ExpectError.Code, le.Code, le.Message)
				}
				return
			}

			if err != nil {
				t.Fatalf("expected success, got load error: %v", err)
			}

			// Compare expanded spec against the fixture expected value. Key order
			// is not part of the value contract (maps compare by key); numbers
			// canonicalize to float64.
			want := normalizeJSON(t, c.Expected)
			got := normalizeAny(result)
			if !reflect.DeepEqual(want, got) {
				t.Errorf("expanded spec mismatch for %s\n want: %#v\n  got: %#v", c.Name, want, got)
			}
		})
	}
}

// normalizeJSON decodes raw fixture JSON into a generic any tree (map[string]any
// / []any / scalars) with numbers as float64, for comparison.
func normalizeJSON(t *testing.T, raw json.RawMessage) any {
	t.Helper()
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("expected decode: %v", err)
	}
	return normalizeGeneric(v)
}

// normalizeGeneric canonicalizes a json.Unmarshal tree: sorts map keys
// implicitly (maps compare by key), recurses, numbers stay float64.
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

// normalizeAny converts the engine's *OMap / []any / scalar tree into the same
// generic map[string]any tree the fixture side produces, so reflect.DeepEqual
// compares like with like. Number spelling is canonicalized to float64.
func normalizeAny(v any) any {
	switch x := v.(type) {
	case *OMap:
		out := make(map[string]any, x.Len())
		keys := x.Keys()
		sort.Strings(keys) // order-irrelevant; sorting is harmless for map compare
		for _, k := range keys {
			val, _ := x.Get(k)
			out[k] = normalizeAny(val)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, val := range x {
			out[i] = normalizeAny(val)
		}
		return out
	case int:
		return float64(x)
	case int64:
		return float64(x)
	case float32:
		return float64(x)
	default:
		return v
	}
}
