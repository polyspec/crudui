package expr

import "testing"

// Targeted unit checks beyond the shared fixture (mirrors PHP ExprConformanceTest
// non-fixture cases).

// Condition map (§8): first truthy key in declaration order wins; on a miss the
// literal `true` key's value is used, else nil. The default key never
// short-circuits an earlier real condition even when declared first.
func TestConditionMap(t *testing.T) {
	gold := []ConditionEntry{
		{Expr: ".tier == 'gold'", Value: "premium"},
		{Expr: ".tier == 'silver'", Value: "standard"},
		{Expr: "true", Value: "basic"},
	}

	mustResolve := func(entries []ConditionEntry, data map[string]any, path []string) any {
		v, err := ResolveConditionMap(entries, data, path)
		if err != nil {
			t.Fatalf("resolve error: %v", err)
		}
		return v
	}

	if got := mustResolve(gold, map[string]any{"tier": "gold", "x": 1}, []string{"x"}); got != "premium" {
		t.Errorf("gold: want premium got %#v", got)
	}
	if got := mustResolve(gold, map[string]any{"tier": "silver", "x": 1}, []string{"x"}); got != "standard" {
		t.Errorf("silver: want standard got %#v", got)
	}
	if got := mustResolve(gold, map[string]any{"tier": "bronze", "x": 1}, []string{"x"}); got != "basic" {
		t.Errorf("bronze: want basic got %#v", got)
	}

	noDefault := []ConditionEntry{{Expr: ".a == 1", Value: "one"}}
	if got := mustResolve(noDefault, map[string]any{"a": 9, "x": 1}, []string{"x"}); got != nil {
		t.Errorf("no-default miss: want nil got %#v", got)
	}
}

// Default key declared first must not pre-empt a later matching condition.
func TestConditionMapDefaultDoesNotShortCircuit(t *testing.T) {
	m := []ConditionEntry{
		{Expr: "true", Value: "fallback"},
		{Expr: ".tier == 'gold'", Value: "premium"},
	}
	if got, _ := ResolveConditionMap(m, map[string]any{"tier": "gold", "x": 1}, []string{"x"}); got != "premium" {
		t.Errorf("want premium got %#v", got)
	}
	if got, _ := ResolveConditionMap(m, map[string]any{"tier": "none", "x": 1}, []string{"x"}); got != "fallback" {
		t.Errorf("want fallback got %#v", got)
	}
}

// JS-parity value semantics: == / != loose equality (numeric strings coerce);
// > >= < <= coerce both sides to number; EvaluateValue returns the boolean
// condition result for non-ternary nodes.
func TestValueSemanticsMatchJsReference(t *testing.T) {
	if ok, _ := Evaluate(".n == 5", map[string]any{"n": "5", "x": 1}, []string{"x"}); !ok {
		t.Error(".n == 5 with n='5' should be true")
	}
	if ok, _ := Evaluate(".score < 50", map[string]any{"score": "30", "x": 1}, []string{"x"}); !ok {
		t.Error(".score < 50 with score='30' should be true")
	}
	if v, _ := EvaluateValue(".v", map[string]any{"v": "hi", "x": 1}, []string{"x"}); v != true {
		t.Errorf(".v non-ternary should return bool true, got %#v", v)
	}
	if v, _ := EvaluateValue(".v", map[string]any{"v": 0, "x": 1}, []string{"x"}); v != false {
		t.Errorf(".v non-ternary should return bool false, got %#v", v)
	}
	if v, _ := EvaluateValue("true", map[string]any{}, nil); v != true {
		t.Errorf("standalone true should be bool true, got %#v", v)
	}
	if v, _ := EvaluateValue("false", map[string]any{}, nil); v != false {
		t.Errorf("standalone false should be bool false, got %#v", v)
	}
}

// Ternary returns the branch's raw value (string/number/null), recursively for
// nested right-associative ternaries. Non-ternary branches return their boolean.
func TestTernaryValueReturn(t *testing.T) {
	if v, _ := EvaluateValue(".big ? 'huge' : 'tiny'", map[string]any{"big": true, "x": 1}, []string{"x"}); v != "huge" {
		t.Errorf("want huge got %#v", v)
	}
	if v, _ := EvaluateValue(".big ? 'huge' : 'tiny'", map[string]any{"big": false, "x": 1}, []string{"x"}); v != "tiny" {
		t.Errorf("want tiny got %#v", v)
	}
	if v, _ := EvaluateValue(".a ? 'A' : .b ? 'B' : 'C'", map[string]any{"a": false, "b": true, "x": 1}, []string{"x"}); v != "B" {
		t.Errorf("want B got %#v", v)
	}
	if v, _ := EvaluateValue(".active ? 1 : 0", map[string]any{"active": false, "x": 1}, []string{"x"}); !valueEquals(0, v) {
		t.Errorf("want 0 got %#v", v)
	}
	if v, _ := EvaluateValue(".show == 1 ? 1 : null", map[string]any{"show": 0, "x": 1}, []string{"x"}); v != nil {
		t.Errorf("want nil got %#v", v)
	}
}
