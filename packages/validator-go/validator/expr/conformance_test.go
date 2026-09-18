package expr

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"

	"github.com/polyspec/crudui/packages/validator-go/validator/internal/conformance"
)

// Expression conformance verifies the three stages in expressions.md §9:
//
//	(1) Tokenize(expr)   == fixture tokens
//	(2) Parse(toks)      == fixture ast
//	(3) Evaluate / EvaluateValue == fixture truthy / value
//
// The shared fixture tests/fixtures/expr/cases.json defines the expected tokens,
// syntax tree and evaluation result for every runtime.

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
	// Error is the parse failure message of an expression the parser rejects.
	Error string `json:"error"`
}

func loadFixture(t *testing.T) []fixtureSpec {
	t.Helper()
	// packages/validator-go/validator/expr → repo root is four levels up.
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

// TestExpressionMatchesFixture runs every fixture entry as one subtest whose
// stages (tokens, ast, evaluation) are nested subtests, so the recorded
// conformance result reflects all three stages of that entry.
func TestExpressionMatchesFixture(t *testing.T) {
	for _, spec := range loadFixture(t) {
		spec := spec
		t.Run(spec.Name, func(t *testing.T) {
			conformance.Record(t, "validate", "tests/fixtures/expr/cases.json", spec.Name)
			if spec.Error != "" {
				t.Run("rejection", func(t *testing.T) { checkRejection(t, spec) })
				return
			}
			t.Run("tokens", func(t *testing.T) { checkTokens(t, spec) })
			t.Run("ast", func(t *testing.T) { checkAST(t, spec) })
			t.Run("evaluation", func(t *testing.T) { checkEvaluation(t, spec) })
		})
	}
}

func checkRejection(t *testing.T, spec fixtureSpec) {
	_, err := Parse(spec.Expr)
	if err == nil {
		t.Fatalf("%s parsed; want error %q", spec.Name, spec.Error)
	}
	if err.Error() != spec.Error {
		t.Errorf("%s error mismatch\n want: %s\n  got: %s", spec.Name, spec.Error, err.Error())
	}
}

func checkTokens(t *testing.T, spec fixtureSpec) {
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
}

func checkAST(t *testing.T, spec fixtureSpec) {
	ast, err := Parse(spec.Expr)
	if err != nil {
		t.Fatalf("parse error for %q: %v", spec.Expr, err)
	}
	want := normalize(toAny(spec.AST))
	got := normalize(toAny(ast.ToMap()))
	if !reflect.DeepEqual(want, got) {
		t.Errorf("AST mismatch for %q\n want: %v\n  got: %v", spec.Expr, want, got)
	}
}

func checkEvaluation(t *testing.T, spec fixtureSpec) {
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
