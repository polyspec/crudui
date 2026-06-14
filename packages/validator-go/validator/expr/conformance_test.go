package expr

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

// CRUDUI expression-engine conformance (EXPRESSION-GRAMMAR §9 three-stage check):
//
//	(1) Tokenize(expr)   == fixture tokens
//	(2) Parse(toks)      == fixture ast
//	(3) Evaluate / EvaluateValue == fixture truthy / value
//
// Single truth = the shared 4-language fixture tests/fixtures/expr/cases.json.
// All four engines (JS / PHP / Go / Rust) load this ONE file and must pass it.
// Its values are the JS reference engine's actual output (tokens+AST+eval); Go
// matches it. Never weaken an assertion to turn red green; fix the engine, the
// fixture, or both at their shared source — not this test.

type fixtureCase struct {
	Data        map[string]any `json:"data"`
	CurrentPath []string       `json:"currentPath"`
	Value       any            `json:"value"`
	Truthy      bool           `json:"truthy"`
}

type fixtureSpec struct {
	Name   string           `json:"name"`
	Expr   string           `json:"expr"`
	Tokens []map[string]any `json:"tokens"`
	AST    map[string]any   `json:"ast"`
	Cases  []fixtureCase    `json:"cases"`
}

func loadFixture(t *testing.T) []fixtureSpec {
	t.Helper()
	// validator-go/validator/expr → repo root is five levels up.
	path := filepath.Join("..", "..", "..", "..", "tests", "fixtures", "expr", "cases.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("shared expr fixture not found at %s: %v", path, err)
	}
	var specs []fixtureSpec
	if err := json.Unmarshal(raw, &specs); err != nil {
		t.Fatalf("fixture json decode: %v", err)
	}
	if len(specs) == 0 {
		t.Fatal("fixture is empty")
	}
	return specs
}

func TestLexerMatchesFixture(t *testing.T) {
	for _, spec := range loadFixture(t) {
		spec := spec
		t.Run(spec.Name, func(t *testing.T) {
			toks, err := Tokenize(spec.Expr)
			if err != nil {
				t.Fatalf("tokenize error for %q: %v", spec.Expr, err)
			}
			got := make([]map[string]any, len(toks))
			for i, tk := range toks {
				got[i] = tk.ToMap()
			}
			want := normalize(toAny(spec.Tokens))
			gotN := normalize(toAny(got))
			if !reflect.DeepEqual(want, gotN) {
				t.Errorf("tokens mismatch for %q\n want: %v\n  got: %v", spec.Expr, want, gotN)
			}
		})
	}
}

func TestParserMatchesFixture(t *testing.T) {
	for _, spec := range loadFixture(t) {
		spec := spec
		t.Run(spec.Name, func(t *testing.T) {
			ast, err := Parse(spec.Expr)
			if err != nil {
				t.Fatalf("parse error for %q: %v", spec.Expr, err)
			}
			want := normalize(toAny(spec.AST))
			got := normalize(toAny(ast.ToMap()))
			if !reflect.DeepEqual(want, got) {
				t.Errorf("AST mismatch for %q\n want: %v\n  got: %v", spec.Expr, want, got)
			}
		})
	}
}

func TestEvaluationMatchesFixture(t *testing.T) {
	for _, spec := range loadFixture(t) {
		spec := spec
		t.Run(spec.Name, func(t *testing.T) {
			for i, c := range spec.Cases {
				val, err := EvaluateValue(spec.Expr, c.Data, c.CurrentPath)
				if err != nil {
					t.Fatalf("evaluateValue error [%s] case %d: %v", spec.Expr, i, err)
				}
				if !valueEquals(c.Value, val) {
					t.Errorf("value mismatch [%s] case %d: expected %#v got %#v", spec.Expr, i, c.Value, val)
				}

				truthy, err := Evaluate(spec.Expr, c.Data, c.CurrentPath)
				if err != nil {
					t.Fatalf("evaluate error [%s] case %d: %v", spec.Expr, i, err)
				}
				if truthy != c.Truthy {
					t.Errorf("truthy mismatch [%s] case %d: expected %v got %v", spec.Expr, i, c.Truthy, truthy)
				}
			}
		})
	}
}

// --- normalization helpers (key order is not part of the contract; numbers
// canonicalize so 0 and 0.0 match — PHP normalize parity) -------------------

// toAny deep-converts typed structures into the generic any tree (map[string]any
// / []any / scalars) reflect.DeepEqual can compare against the JSON-decoded side.
func toAny(v any) any {
	switch x := v.(type) {
	case []map[string]any:
		out := make([]any, len(x))
		for i, m := range x {
			out[i] = toAny(m)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, val := range x {
			out[k] = toAny(val)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, val := range x {
			out[i] = toAny(val)
		}
		return out
	default:
		return x
	}
}

// normalize canonicalizes a generic any tree for comparison: numbers → float64
// (so int literals match JSON's float64 and 0 matches 0.0), maps recurse, lists
// preserve order. Key order is irrelevant since maps compare by key.
func normalize(v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(x))
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			out[k] = normalize(x[k])
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, val := range x {
			out[i] = normalize(val)
		}
		return out
	case int:
		return float64(x)
	case int64:
		return float64(x)
	case float32:
		return float64(x)
	case float64:
		return x
	default:
		return v
	}
}

// valueEquals is value equality tolerant of int/float spelling (JSON loses the
// int/float distinction; the engine may return either for a numeric literal).
func valueEquals(expected, actual any) bool {
	en, eok := numericValue(expected)
	an, aok := numericValue(actual)
	if eok && aok {
		return en == an
	}
	return reflect.DeepEqual(expected, actual)
}

func numericValue(v any) (float64, bool) {
	switch n := v.(type) {
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case float32:
		return float64(n), true
	case float64:
		return n, true
	default:
		return 0, false
	}
}
