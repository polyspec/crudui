package validate

import (
	"fmt"
	"strconv"
	"testing"
	"time"

	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
)

// TestComparisonKeyCanonicalJSON tests that comparison keys for objects
// with different key orders are identical.
func TestComparisonKeyCanonicalJSON(t *testing.T) {
	// Two objects with same content but different key order
	obj1 := map[string]any{
		"a": float64(1),
		"b": "test",
		"c": true,
	}

	obj2 := map[string]any{
		"c": true,
		"a": float64(1),
		"b": "test",
	}

	key1 := comparisonKey(obj1)
	key2 := comparisonKey(obj2)

	if key1 != key2 {
		t.Errorf("comparisonKey for objects with different key order should be identical")
		t.Errorf("  obj1 key: %s", key1)
		t.Errorf("  obj2 key: %s", key2)
	}
}

// TestComparisonKeyTypeDistinction tests that comparison keys distinguish types.
func TestComparisonKeyTypeDistinction(t *testing.T) {
	tests := []struct {
		val1  any
		val2  any
		equal bool
	}{
		{float64(1), "1", false},       // number vs string
		{true, float64(1), false},      // bool vs number
		{nil, "null", false},           // null vs string
		{[]any{}, "[]", false},         // array vs string
		{float64(1), float64(1), true}, // same number
		{"1", "1", true},               // same string
	}

	for _, tt := range tests {
		key1 := comparisonKey(tt.val1)
		key2 := comparisonKey(tt.val2)
		keysMatch := key1 == key2

		if keysMatch != tt.equal {
			t.Errorf("comparisonKey(%v) vs comparisonKey(%v): got %v, want %v",
				tt.val1, tt.val2, keysMatch, tt.equal)
		}
	}
}

// TestUniqueLinearTime checks that areAllUnique scales linearly.
// We test with n values vs 4n values and verify the ratio is well below 16.
func TestUniqueLinearTime(t *testing.T) {
	// Build n test values (n=100)
	n := 100
	nValues := buildUniqueTestValues(n)

	// Time areAllUnique for n values (100 iterations)
	start := time.Now()
	for i := 0; i < 100; i++ {
		areAllUnique(nValues)
	}
	durationN := time.Since(start)

	// Build 4n test values
	fourNValues := buildUniqueTestValues(n * 4)

	// Time areAllUnique for 4n values (100 iterations)
	start = time.Now()
	for i := 0; i < 100; i++ {
		areAllUnique(fourNValues)
	}
	duration4N := time.Since(start)

	// Check ratio: should be close to 4, well below 16
	ratio := float64(duration4N) / float64(durationN)
	if ratio > 16 {
		t.Errorf("Time ratio for 4n vs n = %.2f, want < 16 (linear time not quadratic)", ratio)
	}

	t.Logf("Time for %d values: %v", n, durationN)
	t.Logf("Time for %d values: %v", n*4, duration4N)
	t.Logf("Ratio: %.2f", ratio)
}

// buildUniqueTestValues creates values for uniqueness testing.
// Each value has a unique object with differing key orders to test canonical JSON.
func buildUniqueTestValues(count int) []any {
	values := make([]any, count)
	for i := 0; i < count; i++ {
		// Create objects with different key orders to test canonical JSON
		if i%2 == 0 {
			values[i] = map[string]any{
				"a": float64(i),
				"b": "test",
				"c": true,
			}
		} else {
			values[i] = map[string]any{
				"c": true,
				"b": "test",
				"a": float64(i),
			}
		}
	}
	return values
}

// TestUniqueRowLevelLinearTime validates a repeated group whose field declares unique with n and
// 4n rows: the rows are walked once per validation, so the time grows about four times (sixteen
// if every row compared itself with every earlier row).
func TestUniqueRowLevelLinearTime(t *testing.T) {
	decoded, err := compose.DecodeOrdered([]byte(`{"type":"group","properties":{"rows":{"type":"group","multiple":true,"properties":{"code":{"type":"text","validate":{"unique":true}}}}}}`))
	if err != nil {
		t.Fatal(err)
	}
	spec := decoded.(*compose.OMap)
	best := func(count int) time.Duration {
		rows := map[string]any{}
		for i := 0; i < count; i++ {
			rows[fmt.Sprintf("__%013d__", i+1)] = map[string]any{"code": strconv.Itoa(i)}
		}
		data := map[string]any{"rows": rows}
		var fastest time.Duration
		for run := 0; run < 3; run++ {
			started := time.Now()
			if _, err := Validate(spec, data, Options{}); err != nil {
				t.Fatal(err)
			}
			if elapsed := time.Since(started); run == 0 || elapsed < fastest {
				fastest = elapsed
			}
		}
		return fastest
	}
	small, large := best(1500), best(6000)
	if ratio := float64(large) / float64(small); ratio >= 8 {
		t.Fatalf("4n rows took %.1f times as long as n rows (%v, %v)", ratio, small, large)
	}
}

// The duplicates found for one validation never reach another: a second validation of the same
// specification with different data answers from its own rows.
func TestUniqueRowsBelongToOneValidation(t *testing.T) {
	decoded, err := compose.DecodeOrdered([]byte(`{"type":"group","properties":{"rows":{"type":"group","multiple":true,"properties":{"code":{"type":"text","validate":{"unique":true}}}}}}`))
	if err != nil {
		t.Fatal(err)
	}
	spec := decoded.(*compose.OMap)
	rows := func(codes ...string) map[string]any {
		out := map[string]any{}
		for i, code := range codes {
			out[fmt.Sprintf("__%013d__", i+1)] = map[string]any{"code": code}
		}
		return map[string]any{"rows": out}
	}
	first, err := Validate(spec, rows("x", "x"), Options{})
	if err != nil || first.Valid {
		t.Fatalf("first validation: %+v %v", first, err)
	}
	second, err := Validate(spec, rows("x", "y"), Options{})
	if err != nil || !second.Valid {
		t.Fatalf("second validation took the first one's duplicates: %+v %v", second, err)
	}
}
