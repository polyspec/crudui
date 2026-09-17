package validate

// Canonical text of a scalar (docs/spec/validation-rules.md, Values): a string
// itself, true as "1", false as "0", and a finite number as ECMAScript
// Number.prototype.toString writes it.

import (
	"math"
	"strconv"
	"strings"
)

// numberValue returns the double value of a number, whatever Go numeric type
// carries it; an integer converts to the nearest double.
func numberValue(value any) (float64, bool) {
	switch n := value.(type) {
	case uint:
		return float64(n), true
	case uint64:
		return float64(n), true
	case uint32:
		return float64(n), true
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case int32:
		return float64(n), true
	default:
		return 0, false
	}
}

// canonicalText returns the canonical text of a scalar. It reports false for an
// array, an object, null and a nonfinite number, which have no canonical text.
func canonicalText(value any) (string, bool) {
	switch v := value.(type) {
	case string:
		return v, true
	case bool:
		if v {
			return "1", true
		}
		return "0", true
	}
	n, ok := numberValue(value)
	if !ok || math.IsInf(n, 0) || math.IsNaN(n) {
		return "", false
	}
	return canonicalNumber(n), true
}

// canonicalNumber writes a finite number as ECMAScript Number.prototype.toString
// does: the shortest digits that read back as the same double, laid out in plain
// notation for magnitudes from 10^-6 up to 10^21 and in exponent notation
// otherwise; negative zero is "0". A nonfinite number, which has no canonical
// text, is written as ECMAScript writes it (NaN, Infinity) for messages and keys.
func canonicalNumber(v float64) string {
	switch {
	case math.IsNaN(v):
		return "NaN"
	case math.IsInf(v, 1):
		return "Infinity"
	case math.IsInf(v, -1):
		return "-Infinity"
	case v == 0:
		return "0"
	}
	if v < 0 {
		return "-" + canonicalNumber(-v)
	}
	// Shortest round-trip digits as d.ddde±x: digits s, k = len(s), and the
	// decimal point position n, so that v = 0.s × 10^n.
	mantissa, exponent, _ := strings.Cut(strconv.FormatFloat(v, 'e', -1, 64), "e")
	digits := strings.Replace(mantissa, ".", "", 1)
	e, _ := strconv.Atoi(exponent)
	k, n := len(digits), e+1
	switch {
	case k <= n && n <= 21:
		return digits + strings.Repeat("0", n-k)
	case 0 < n && n <= 21:
		return digits[:n] + "." + digits[n:]
	case -6 < n && n <= 0:
		return "0." + strings.Repeat("0", -n) + digits
	}
	sign := "+"
	if n-1 < 0 {
		sign = "-"
	}
	power := strconv.Itoa(abs(n - 1))
	if k == 1 {
		return digits + "e" + sign + power
	}
	return digits[:1] + "." + digits[1:] + "e" + sign + power
}

// abs returns the magnitude of an int.
func abs(i int) int {
	if i < 0 {
		return -i
	}
	return i
}
