package validate

// Rule registry — a self-contained port of the JS reference rules
// (validator-js/src/rules). v2 does NOT import the v1 validator rules (R7
// isolation); the semantics and default messages mirror the JS engine, which is
// the source the shared 4-language fixture is generated from.
//
// A rule receives the field value, the EFFECTIVE param (already resolved from a
// possibly-conditional rule value by validator.go), and a ruleContext. It returns
// the error message and a failed flag. An empty message with failed=false means
// the rule passed (or was skipped).
//
// Empty-value skip: every rule except required / mincount / maxcount passes on an
// empty value (required is the only rule that fails empty; count rules count an
// empty array as 0). isEmpty mirrors JS isEmpty (rules/required).

import (
	"encoding/json"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/yejune/form-spec/packages/validator-go/validator/v2/compose"
)

// ruleContext carries the data a rule needs beyond value + param.
type ruleContext struct {
	// pathSegments is the field's path (its own name included).
	pathSegments []string
	// formData is the whole decoded form (map[string]any / []any / scalars).
	formData map[string]any
	// messages is the per-field custom-message map (rule name → message).
	messages map[string]string
	// ruleName is the invoked rule key (pattern vs match alias preserved).
	ruleName string
}

// ruleFn validates value with the effective param. Returns (message, failed).
type ruleFn func(value any, ruleParam any, ctx ruleContext) (string, bool)

// builtInRules is the v2 rule registry. "pattern" aliases "match". An unregistered
// rule produces no error (VALIDATION-RULES common §4).
var builtInRules = map[string]ruleFn{
	"required":    ruleRequired,
	"email":       ruleEmail,
	"minlength":   ruleMinLength,
	"maxlength":   ruleMaxLength,
	"min":         ruleMin,
	"max":         ruleMax,
	"match":       ruleMatch,
	"pattern":     ruleMatch,
	"unique":      ruleUnique,
	"in":          ruleIn,
	"range":       ruleRange,
	"rangelength": ruleRangeLength,
	"number":      ruleNumber,
	"digits":      ruleDigits,
	"equalTo":     ruleEqualTo,
	"notEqual":    ruleNotEqual,
	"date":        ruleDate,
	"dateISO":     ruleDateISO,
	"enddate":     ruleEndDate,
	"url":         ruleURL,
	"accept":      ruleAccept,
	"mincount":    ruleMinCount,
	"maxcount":    ruleMaxCount,
	"step":        ruleStep,
}

// getRule returns the rule fn and whether it is registered.
func getRule(name string) (ruleFn, bool) {
	fn, ok := builtInRules[name]
	return fn, ok
}

// msg returns the per-field message override for rule name, or the fallback.
func (ctx ruleContext) msg(name, fallback string) string {
	if ctx.messages != nil {
		if m, ok := ctx.messages[name]; ok {
			return m
		}
	}
	return fallback
}

// ---------------------------------------------------------------------------
// Value helpers (JS isEmpty / Number / toNumber parity).
// ---------------------------------------------------------------------------

// isEmpty mirrors JS isEmpty (rules/required): null/undefined empty; a string is
// empty when trim is ""; an array is empty when len 0; an object is empty when no
// keys; numbers / booleans (including 0 / false) are NOT empty.
func isEmpty(value any) bool {
	switch v := value.(type) {
	case nil:
		return true
	case string:
		return strings.TrimSpace(v) == ""
	case []any:
		return len(v) == 0
	case map[string]any:
		return len(v) == 0
	default:
		return false
	}
}

// jsString mirrors JS String(value) for the rule layer: strings pass; numbers use
// the JS number→string form; booleans → "true"/"false"; null → "" (rules only
// reach String() on non-empty values, but keep parity).
func jsString(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return v
	case bool:
		if v {
			return "true"
		}
		return "false"
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case float64:
		return formatJSNumber(v)
	case float32:
		return formatJSNumber(float64(v))
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return ""
		}
		return string(b)
	}
}

// formatJSNumber renders a float the way JS String(n) would for finite numbers:
// an integral value prints without a fractional part.
func formatJSNumber(v float64) string {
	if math.IsInf(v, 0) || math.IsNaN(v) {
		// JS String prints Infinity/NaN; not reached by the fixtures but kept.
		return strconv.FormatFloat(v, 'g', -1, 64)
	}
	if v == math.Floor(v) && math.Abs(v) < 1e21 {
		return strconv.FormatInt(int64(v), 10)
	}
	return strconv.FormatFloat(v, 'g', -1, 64)
}

// jsNumber mirrors JS Number(value): a whole-string number parses; an empty
// string is 0; booleans → 1/0; numbers pass; otherwise NaN (ok=false). Used by
// rules that call Number(ruleParam) / Number(value).
func jsNumber(value any) (float64, bool) {
	switch v := value.(type) {
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case float32:
		return float64(v), true
	case float64:
		return v, true
	case bool:
		if v {
			return 1, true
		}
		return 0, true
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return 0, true // JS Number('') === 0
		}
		f, err := strconv.ParseFloat(trimmed, 64)
		if err != nil {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}

// numberPattern is the finite-number gate (JS rules/min toNumber / number
// isValidNumber): optional sign, digits with optional decimal point.
// "Infinity"/"-Infinity"/"NaN" do not match.
var numberPattern = regexp.MustCompile(`^[-+]?(\d+\.?\d*|\d*\.?\d+)$`)

// toNumber mirrors JS rules/min toNumber: a number passes only if finite; a
// string must wholly match numberPattern AND be finite. Returns (n, true) or
// (0, false) — the "input must be a finite real number" gate.
func toNumber(value any) (float64, bool) {
	switch v := value.(type) {
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case float32:
		f := float64(v)
		if math.IsInf(f, 0) || math.IsNaN(f) {
			return 0, false
		}
		return f, true
	case float64:
		if math.IsInf(v, 0) || math.IsNaN(v) {
			return 0, false
		}
		return v, true
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return 0, false
		}
		if !numberPattern.MatchString(trimmed) {
			return 0, false
		}
		f, err := strconv.ParseFloat(trimmed, 64)
		if err != nil || math.IsInf(f, 0) || math.IsNaN(f) {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}

// runeLength returns the JS string length in UTF-16 code units is approximated by
// rune count for the BMP; the fixtures use ASCII, so rune count is exact for the
// shared contract. (JS .length is UTF-16; non-BMP differs, not exercised.)
func runeLength(s string) int {
	return len([]rune(s))
}

// ---------------------------------------------------------------------------
// Rules.
// ---------------------------------------------------------------------------

// ruleRequired: fails on an empty value when the effective param is true. The
// effective param is already resolved (a conditional required has been evaluated
// to true/false by validator.go). JS requiredRule returns null unless param ===
// true.
func ruleRequired(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if b, ok := ruleParam.(bool); !ok || !b {
		return "", false
	}
	if isEmpty(value) {
		return ctx.msg("required", "This field is required."), true
	}
	return "", false
}

// emailPattern mirrors the JS EMAIL_PATTERN (RFC 5322 simplified).
var emailPattern = regexp.MustCompile(`^[a-zA-Z0-9.!#$%&'*+/=?^_` + "`" + `{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$`)

// isValidEmail mirrors JS isValidEmail: a non-string is invalid; the pattern must
// match; the local part may not start/end with a dot or contain "..".
func isValidEmail(value any) bool {
	s, ok := value.(string)
	if !ok {
		return false
	}
	if !emailPattern.MatchString(s) {
		return false
	}
	local, _, _ := strings.Cut(s, "@")
	if strings.HasPrefix(local, ".") || strings.HasSuffix(local, ".") || strings.Contains(local, "..") {
		return false
	}
	return true
}

// ruleEmail: skipped unless param === true; passes on empty; else email format.
func ruleEmail(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if b, ok := ruleParam.(bool); !ok || !b {
		return "", false
	}
	if isEmpty(value) {
		return "", false
	}
	if !isValidEmail(value) {
		return ctx.msg("email", "Please enter a valid email address."), true
	}
	return "", false
}

// ruleMinLength: string length >= param. Empty skips.
func ruleMinLength(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if ruleParam == nil {
		return "", false
	}
	if isEmpty(value) {
		return "", false
	}
	minLen, ok := jsNumber(ruleParam)
	if !ok {
		return "", false
	}
	if float64(runeLength(jsString(value))) < minLen {
		m := ctx.msg("minlength", "Please enter at least {0} characters.")
		return strings.ReplaceAll(m, "{0}", formatJSNumber(minLen)), true
	}
	return "", false
}

// ruleMaxLength: string length <= param. Empty skips.
func ruleMaxLength(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if ruleParam == nil {
		return "", false
	}
	if isEmpty(value) {
		return "", false
	}
	maxLen, ok := jsNumber(ruleParam)
	if !ok {
		return "", false
	}
	if float64(runeLength(jsString(value))) > maxLen {
		m := ctx.msg("maxlength", "Please enter no more than {0} characters.")
		return strings.ReplaceAll(m, "{0}", formatJSNumber(maxLen)), true
	}
	return "", false
}

// ruleMin: value >= param (numeric). Empty skips; a NaN threshold skips; a
// non-number value skips (number rule handles it). JS minRule.
func ruleMin(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if ruleParam == nil {
		return "", false
	}
	if isEmpty(value) {
		return "", false
	}
	minValue, ok := jsNumber(ruleParam)
	if !ok {
		return "", false
	}
	num, ok := toNumber(value)
	if !ok {
		return "", false
	}
	if num < minValue {
		m := ctx.msg("min", "Please enter a value greater than or equal to {0}.")
		return strings.ReplaceAll(m, "{0}", formatJSNumber(minValue)), true
	}
	return "", false
}

// ruleMax: value <= param. Empty skips; NaN threshold skips; non-number skips.
func ruleMax(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if ruleParam == nil {
		return "", false
	}
	if isEmpty(value) {
		return "", false
	}
	maxValue, ok := jsNumber(ruleParam)
	if !ok {
		return "", false
	}
	num, ok := toNumber(value)
	if !ok {
		return "", false
	}
	if num > maxValue {
		m := ctx.msg("max", "Please enter a value less than or equal to {0}.")
		return strings.ReplaceAll(m, "{0}", formatJSNumber(maxValue)), true
	}
	return "", false
}

// anchorPattern forces full-string match (^...$) without double-anchoring (JS
// anchorPattern / PHP Pattern parity).
func anchorPattern(pattern string) string {
	a := pattern
	if !strings.HasPrefix(a, "^") {
		a = "^" + a
	}
	if !strings.HasSuffix(a, "$") {
		a = a + "$"
	}
	return a
}

// ruleMatch: regex match. The param is a regex string preserved verbatim. Empty
// skips; an invalid pattern skips. Message lookup tries the invoked ruleName
// (pattern/match), then pattern, then match, then the default (JS matchRule).
func ruleMatch(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if ruleParam == nil {
		return "", false
	}
	if isEmpty(value) {
		return "", false
	}
	pattern, ok := ruleParam.(string)
	if !ok {
		return "", false
	}
	re, err := regexp.Compile(anchorPattern(pattern))
	if err != nil {
		return "", false // invalid pattern, skip
	}
	if !re.MatchString(jsString(value)) {
		// JS message precedence: messages[ruleName] → messages.pattern →
		// messages.match → default.
		if ctx.messages != nil {
			if ctx.ruleName != "" {
				if m, ok := ctx.messages[ctx.ruleName]; ok {
					return m, true
				}
			}
			if m, ok := ctx.messages["pattern"]; ok {
				return m, true
			}
			if m, ok := ctx.messages["match"]; ok {
				return m, true
			}
		}
		return "Please enter a valid format.", true
	}
	return "", false
}

// comparisonKey builds a uniqueness key. Objects/arrays use their JSON form;
// scalars carry a type tag so the string "1" and the number 1 are NOT duplicates
// (JS comparisonKey is a SameValueZero Set key — distinct JS types differ).
func comparisonKey(value any) string {
	switch v := value.(type) {
	case nil:
		return "z:"
	case string:
		return "s:" + v
	case bool:
		return "b:" + strconv.FormatBool(v)
	case int:
		return "n:" + formatJSNumber(float64(v))
	case int64:
		return "n:" + formatJSNumber(float64(v))
	case float32:
		return "n:" + formatJSNumber(float64(v))
	case float64:
		return "n:" + formatJSNumber(v)
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return "x:"
		}
		return "j:" + string(b)
	}
}

// areAllUnique reports whether all values are distinct by comparisonKey.
func areAllUnique(values []any) bool {
	seen := make(map[string]bool, len(values))
	for _, v := range values {
		k := comparisonKey(v)
		if seen[k] {
			return false
		}
		seen[k] = true
	}
	return true
}

// ruleUnique: two modes (JS uniqueRule).
//
//	(1) array-level — the value is an array; non-empty elements must be unique. A
//	    string filter condition restricts which elements participate.
//	(2) item-level — a scalar inside a repeated group; the value must not
//	    duplicate the same field of any EARLIER sibling (error lands on the later
//	    item). A filter condition excludes non-matching items.
func ruleUnique(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if ruleParam == nil {
		return "", false
	}
	if b, ok := ruleParam.(bool); ok && !b {
		return "", false
	}

	paramStr, paramIsStr := ruleParam.(string)
	isFilter := paramIsStr && isConditionExpression(paramStr)
	errMsg := ctx.msg("unique", "Values must be unique.")

	// Array-level.
	if arr, ok := value.([]any); ok {
		var toCheck []any
		switch {
		case isFilter:
			for i, el := range arr {
				itemPath := append(append([]string{}, ctx.pathSegments...), strconv.Itoa(i))
				if !itemPassesCondition(paramStr, itemPath, ctx.formData) {
					continue
				}
				if !isEmpty(el) {
					toCheck = append(toCheck, el)
				}
			}
		case paramIsStr:
			// Param is a field name within array items.
			toCheck = extractFieldValues(arr, paramStr)
		default:
			for _, el := range arr {
				if !isEmpty(el) {
					toCheck = append(toCheck, el)
				}
			}
		}
		if len(toCheck) == 0 {
			return "", false
		}
		if !areAllUnique(toCheck) {
			return errMsg, true
		}
		return "", false
	}

	// Item-level: <containerPath>.<itemKey>.<fieldName>.
	if len(ctx.pathSegments) < 2 {
		return "", false
	}
	fieldName := ctx.pathSegments[len(ctx.pathSegments)-1]
	itemKey := ctx.pathSegments[len(ctx.pathSegments)-2]
	containerPath := ctx.pathSegments[:len(ctx.pathSegments)-2]
	container := getValueBySegments(ctx.formData, containerPath)

	// Ordered (key, item) entries.
	type entry struct {
		key  string
		item any
	}
	var entries []entry
	switch c := container.(type) {
	case []any:
		if !isNumericKey(itemKey) {
			return "", false
		}
		for i, it := range c {
			entries = append(entries, entry{strconv.Itoa(i), it})
		}
	case map[string]any:
		// Object container: iteration order must be deterministic; sort keys so
		// "earlier" matches the traversal order used by the engine (sorted keys).
		keys := sortedKeys(c)
		for _, k := range keys {
			entries = append(entries, entry{k, c[k]})
		}
	default:
		return "", false
	}

	if isEmpty(value) {
		return "", false
	}
	if isFilter && !itemPassesCondition(paramStr, ctx.pathSegments, ctx.formData) {
		return "", false
	}

	currentKey := comparisonKey(value)
	for _, e := range entries {
		if e.key == itemKey {
			break // only earlier siblings
		}
		itemMap, ok := e.item.(map[string]any)
		if !ok {
			continue
		}
		if isFilter {
			siblingPath := append(append([]string{}, containerPath...), e.key, fieldName)
			if !itemPassesCondition(paramStr, siblingPath, ctx.formData) {
				continue
			}
		}
		sibling, ok := itemMap[fieldName]
		if !ok || isEmpty(sibling) {
			continue
		}
		if comparisonKey(sibling) == currentKey {
			return errMsg, true
		}
	}
	return "", false
}

// extractFieldValues pulls non-empty field values from array items by name (JS
// extractFieldValues). Used when unique's param is a bare field name.
func extractFieldValues(items []any, fieldName string) []any {
	var out []any
	segs := parsePathString(strings.TrimLeft(fieldName, "."))
	for _, it := range items {
		if m, ok := it.(map[string]any); ok {
			v := getValueBySegments(m, segs)
			if !isEmpty(v) {
				out = append(out, v)
			}
		}
	}
	return out
}

// ruleIn: membership in the allowed list. Empty skips. The param may be a
// comma-string, an array (nested flattened), or an object; comparison is loose
// (string-normalized with numeric equivalence) — JS inRule.
func ruleIn(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if ruleParam == nil {
		return "", false
	}
	if isEmpty(value) {
		return "", false
	}
	allowed := flattenInValues(ruleParam)
	if len(allowed) == 0 {
		return "", false
	}
	if slices.ContainsFunc(allowed, func(a any) bool { return looseInEquals(value, a) }) {
		return "", false
	}
	return ctx.msg("in", "Please select a valid option."), true
}

// flattenInValues normalizes the in-param to a flat list of allowed values
// (JS flattenInValues): a comma-string splits and trims; an array flattens
// nested arrays; an object yields its values.
func flattenInValues(param any) []any {
	switch p := param.(type) {
	case string:
		var out []any
		for _, part := range strings.Split(p, ",") {
			out = append(out, strings.TrimSpace(part))
		}
		return out
	case []any:
		var out []any
		for _, item := range p {
			out = append(out, flattenInValues(item)...)
		}
		return out
	case *compose.OMap:
		// Composed object node (the value universe the v2 validate pass operates
		// on): same value→label vs values decision as a plain object.
		return flattenOrderedObject(p.Keys(), func(k string) any {
			v, _ := p.Get(k)
			return v
		})
	case map[string]any:
		return flattenOrderedObject(sortedKeys(p), func(k string) any { return p[k] })
	default:
		return []any{param}
	}
}

// flattenOrderedObject flattens an object (ordered keys + value lookup) for the
// `in` rule. Static value→label content map (SPEC §2 G3): the option VALUE is
// the KEY; the label (string | LangMap | null) is display-only and never a
// member, so membership uses the KEYS. A null label slot has no effect. Other
// objects keep the legacy values-flatten.
func flattenOrderedObject(keys []string, get func(string) any) []any {
	if isValueLabelMap(keys, get) {
		out := make([]any, 0, len(keys))
		for _, k := range keys {
			out = append(out, k)
		}
		return out
	}
	var out []any
	for _, k := range keys {
		out = append(out, flattenInValues(get(k))...)
	}
	return out
}

// isValueLabelMap reports whether an object (ordered keys + value lookup) is a
// static value→label content map (G3): a non-empty object whose entry values are
// all display labels — a string, a LangMap object (*compose.OMap or
// map[string]any), or null. An object carrying any non-label value (number,
// bool, array) is not a content map (legacy values-flatten).
func isValueLabelMap(keys []string, get func(string) any) bool {
	if len(keys) == 0 {
		return false
	}
	for _, k := range keys {
		switch get(k).(type) {
		case nil, string, *compose.OMap, map[string]any:
			// label shape
		default:
			return false
		}
	}
	return true
}

// looseInEquals is the in-rule loose comparison: normalize both to strings, with
// booleans mapped to '1'/'0' and numeric equivalence ('1' == 1) honored.
func looseInEquals(a, b any) bool {
	if normalizeInValue(a) == normalizeInValue(b) {
		return true
	}
	an, aok := jsNumber(a)
	bn, bok := jsNumber(b)
	if aok && bok {
		return an == bn
	}
	return false
}

// normalizeInValue maps a value to its in-rule string form: booleans → '1'/'0';
// numbers → JS number string; strings as-is.
func normalizeInValue(v any) string {
	switch x := v.(type) {
	case bool:
		if x {
			return "1"
		}
		return "0"
	default:
		return jsString(v)
	}
}

// ruleRange: numeric value within [min,max]. Empty skips; a non-number value
// fails with the number message (JS rangeRule).
func ruleRange(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if isEmpty(value) {
		return "", false
	}
	lo, hi, ok := twoNumbers(ruleParam)
	if !ok {
		return "", false
	}
	num, ok := jsNumber(value)
	if !ok {
		return ctx.msg("range", "Please enter a valid number."), true
	}
	if num < lo || num > hi {
		m := ctx.msg("range", "Please enter a value between {0} and {1}.")
		m = strings.ReplaceAll(m, "{0}", formatJSNumber(lo))
		m = strings.ReplaceAll(m, "{1}", formatJSNumber(hi))
		return m, true
	}
	return "", false
}

// ruleRangeLength: string length within [min,max]. Empty skips.
func ruleRangeLength(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if isEmpty(value) {
		return "", false
	}
	lo, hi, ok := twoNumbers(ruleParam)
	if !ok {
		return "", false
	}
	length := float64(runeLength(jsString(value)))
	if length < lo || length > hi {
		m := ctx.msg("rangelength", "Please enter a value between {0} and {1} characters.")
		m = strings.ReplaceAll(m, "{0}", formatJSNumber(lo))
		m = strings.ReplaceAll(m, "{1}", formatJSNumber(hi))
		return m, true
	}
	return "", false
}

// twoNumbers reads a [min,max] param (a 2-element array). Returns ok=false when
// the shape is wrong or a bound is not a number.
func twoNumbers(param any) (float64, float64, bool) {
	arr, ok := param.([]any)
	if !ok || len(arr) < 2 {
		return 0, 0, false
	}
	lo, ok1 := jsNumber(arr[0])
	hi, ok2 := jsNumber(arr[1])
	if !ok1 || !ok2 {
		return 0, 0, false
	}
	return lo, hi, true
}

// ruleNumber: finite-number validation. Skipped when param is false; empty skips;
// "Infinity"/"-Infinity"/"NaN" rejected (JS numberRule / isValidNumber).
func ruleNumber(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if b, ok := ruleParam.(bool); ok && !b {
		return "", false
	}
	if isEmpty(value) {
		return "", false
	}
	if !isValidNumber(value) {
		return ctx.msg("number", "Please enter a valid number."), true
	}
	return "", false
}

// isValidNumber mirrors JS isValidNumber: a finite number, or a whole-string
// number that is finite.
func isValidNumber(value any) bool {
	_, ok := toNumber(value)
	return ok
}

// digitsPattern matches a non-empty all-digit string.
var digitsPattern = regexp.MustCompile(`^\d+$`)

// ruleDigits: digits only. Skipped when param is false; empty skips (JS
// digitsRule / isDigitsOnly).
func ruleDigits(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if b, ok := ruleParam.(bool); ok && !b {
		return "", false
	}
	if isEmpty(value) {
		return "", false
	}
	if !isDigitsOnly(value) {
		return ctx.msg("digits", "Please enter only digits."), true
	}
	return "", false
}

// isDigitsOnly mirrors JS isDigitsOnly: a number must be a non-negative integer;
// a string must be all digits after trim.
func isDigitsOnly(value any) bool {
	switch v := value.(type) {
	case int:
		return v >= 0
	case int64:
		return v >= 0
	case float64:
		return v == math.Floor(v) && v >= 0 && !math.IsInf(v, 0)
	case float32:
		f := float64(v)
		return f == math.Floor(f) && f >= 0
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return false
		}
		return digitsPattern.MatchString(trimmed)
	default:
		return false
	}
}

// ruleEqualTo: value must equal a referenced field's value. The param is a field
// reference preserved verbatim. Empty skips. Comparison is strict (JS uses value
// !== targetValue) — the JS engine compares with === (SameValue-ish). We mirror
// that with a typed equality (JS strict equality across decoded JSON types).
func ruleEqualTo(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if ruleParam == nil {
		return "", false
	}
	if isEmpty(value) {
		return "", false
	}
	target := resolveFieldReference(jsString(ruleParam), ctx.pathSegments, ctx.formData)
	if !strictEquals(value, target) {
		return ctx.msg("equalTo", "Please enter the same value again."), true
	}
	return "", false
}

// strictEquals mirrors JS === over decoded JSON values: same JS type and equal.
// Numbers compare numerically across int/float spellings; strings, booleans, null
// compare directly; objects/arrays compare by reference (never equal here).
func strictEquals(a, b any) bool {
	switch av := a.(type) {
	case nil:
		return b == nil
	case string:
		bv, ok := b.(string)
		return ok && av == bv
	case bool:
		bv, ok := b.(bool)
		return ok && av == bv
	case int, int64, float32, float64:
		an, aok := numericValue(a)
		bn, bok := numericValue(b)
		return aok && bok && an == bn
	default:
		return false
	}
}

// numericValue reports a value's numeric value when it is a JS number.
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

// ruleNotEqual: value must differ from a reference (param starts with '.') or a
// literal. Empty skips. The param is preserved verbatim (JS notEqualRule). The JS
// rule compares with String() coercion.
func ruleNotEqual(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if ruleParam == nil {
		return "", false
	}
	if isEmpty(value) {
		return "", false
	}
	compare, ok := ruleParam.(string)
	if !ok {
		compare = jsString(ruleParam)
	}
	if strings.HasPrefix(compare, ".") {
		target := resolveFieldReference(compare, ctx.pathSegments, ctx.formData)
		if jsString(value) == jsString(target) {
			return ctx.msg("notEqual", "Please enter a different value."), true
		}
	} else {
		if jsString(value) == compare {
			return ctx.msg("notEqual", "Please enter a different value."), true
		}
	}
	return "", false
}

// dateFormats are the date layouts the date / enddate rules accept.
var dateFormats = []string{
	"2006-01-02",
	"01/02/2006",
	"02/01/2006",
	"2006/01/02",
	"2006-01-02T15:04:05Z07:00",
}

// ruleDate: a parseable date. Empty skips.
func ruleDate(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if isEmpty(value) {
		return "", false
	}
	if parseDate(jsString(value)) == nil {
		return ctx.msg("date", "Please enter a valid date."), true
	}
	return "", false
}

var dateISOPattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// ruleDateISO: an ISO-8601 (YYYY-MM-DD) date. Empty skips.
func ruleDateISO(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if isEmpty(value) {
		return "", false
	}
	s := jsString(value)
	if !dateISOPattern.MatchString(s) || parseExactDate("2006-01-02", s) == nil {
		return ctx.msg("dateISO", "Please enter a valid date in ISO format (YYYY-MM-DD)."), true
	}
	return "", false
}

// ruleEndDate: the end date must not be before the referenced start date (same
// day passes). Either side unparseable skips. The param is a field reference.
func ruleEndDate(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if ruleParam == nil {
		return "", false
	}
	if isEmpty(value) {
		return "", false
	}
	end := parseDate(jsString(value))
	if end == nil {
		return "", false
	}
	startRef, ok := ruleParam.(string)
	if !ok {
		startRef = jsString(ruleParam)
	}
	startVal := resolveFieldReference(startRef, ctx.pathSegments, ctx.formData)
	if isEmpty(startVal) {
		return "", false
	}
	start := parseDate(jsString(startVal))
	if start == nil {
		return "", false
	}
	if end.Before(*start) {
		return ctx.msg("enddate", "End date must be after the start date."), true
	}
	return "", false
}

// ruleURL: a valid http/https/ftp URL with a host. Empty skips.
func ruleURL(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if b, ok := ruleParam.(bool); ok && !b {
		return "", false
	}
	if isEmpty(value) {
		return "", false
	}
	if !isValidURL(jsString(value)) {
		return ctx.msg("url", "Please enter a valid URL."), true
	}
	return "", false
}

// ruleAccept: file MIME/extension validation. The param is a literal preserved
// verbatim (.jpg is NOT a relative reference). Empty skips (JS acceptRule).
func ruleAccept(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if ruleParam == nil {
		return "", false
	}
	if b, ok := ruleParam.(bool); ok && !b {
		return "", false
	}
	if isEmpty(value) {
		return "", false
	}
	acceptList := parseAcceptParam(ruleParam)
	if len(acceptList) == 0 {
		return "", false
	}

	failMsg := ctx.msg("accept", "Please upload a file with a valid format.")

	switch v := value.(type) {
	case string:
		if strings.Contains(v, "/") {
			if !matchesMimeType(v, acceptList) {
				return failMsg, true
			}
		} else {
			if !matchesExtension(v, acceptList) {
				return failMsg, true
			}
		}
		return "", false
	case []any:
		for _, file := range v {
			if m, ok := file.(map[string]any); ok {
				mime := firstString(m, "type", "mimeType")
				name := firstString(m, "name", "filename")
				valid := (mime != "" && matchesMimeType(mime, acceptList)) ||
					(name != "" && matchesExtension(name, acceptList))
				if !valid {
					return ctx.msg("accept", "Please upload files with valid formats."), true
				}
			}
		}
		return "", false
	case map[string]any:
		mime := firstString(v, "type", "mimeType")
		name := firstString(v, "name", "filename")
		valid := (mime != "" && matchesMimeType(mime, acceptList)) ||
			(name != "" && matchesExtension(name, acceptList))
		if !valid {
			return failMsg, true
		}
		return "", false
	default:
		return "", false
	}
}

// firstString returns the first non-empty string among the given keys.
func firstString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if s, ok := m[k].(string); ok && s != "" {
			return s
		}
	}
	return ""
}

// arrayLength returns the JS getArrayLength: an array's length; an object's key
// count (object-key multiple groups); else 0.
func arrayLength(value any) int {
	switch v := value.(type) {
	case []any:
		return len(v)
	case map[string]any:
		return len(v)
	default:
		return 0
	}
}

// ruleMinCount: item count >= param. Does NOT skip empty (an empty array fails
// mincount>=1). JS mincountRule.
func ruleMinCount(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if ruleParam == nil {
		return "", false
	}
	minCount, ok := jsNumber(ruleParam)
	if !ok {
		return "", false
	}
	if float64(arrayLength(value)) < minCount {
		m := ctx.msg("mincount", "Please select at least {0} items.")
		return strings.ReplaceAll(m, "{0}", formatJSNumber(minCount)), true
	}
	return "", false
}

// ruleMaxCount: item count <= param. Empty array counts 0 (passes). JS
// maxcountRule.
func ruleMaxCount(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if ruleParam == nil {
		return "", false
	}
	maxCount, ok := jsNumber(ruleParam)
	if !ok {
		return "", false
	}
	if float64(arrayLength(value)) > maxCount {
		m := ctx.msg("maxcount", "Please select no more than {0} items.")
		return strings.ReplaceAll(m, "{0}", formatJSNumber(maxCount)), true
	}
	return "", false
}

// ruleStep: value must be a multiple of the step. Empty skips; a non-positive or
// non-number step skips. JS stepRule.
func ruleStep(value any, ruleParam any, ctx ruleContext) (string, bool) {
	if ruleParam == nil {
		return "", false
	}
	if isEmpty(value) {
		return "", false
	}
	step, ok := jsNumber(ruleParam)
	if !ok || step <= 0 {
		return "", false
	}
	num, ok := jsNumber(value)
	if !ok {
		return "", false
	}
	if !isValidStep(num, step) {
		m := ctx.msg("step", "Please enter a value that is a multiple of {0}.")
		return strings.ReplaceAll(m, "{0}", formatJSNumber(step)), true
	}
	return "", false
}

// isValidStep reports whether num is an integer multiple of step, accounting for
// float precision (JS isValidStep).
func isValidStep(num, step float64) bool {
	dp := decimalPlaces(num)
	if sp := decimalPlaces(step); sp > dp {
		dp = sp
	}
	mult := math.Pow(10, float64(dp))
	iv := int64(math.Round(num * mult))
	is := int64(math.Round(step * mult))
	if is == 0 {
		return true
	}
	return iv%is == 0
}

// decimalPlaces counts the fractional digits of a number's shortest decimal form.
func decimalPlaces(n float64) int {
	s := strconv.FormatFloat(n, 'f', -1, 64)
	_, frac, found := strings.Cut(s, ".")
	if !found {
		return 0
	}
	return len(frac)
}
