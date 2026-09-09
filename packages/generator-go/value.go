package generator

import (
	"encoding/json"
	"fmt"
	"math"
	"net/url"
	"reflect"
	"regexp"
	"strconv"
	"strings"

	"github.com/crudui/crudui/packages/validator-go/validator/compose"
)

// Object preserves JSON member order. Arrays use []any and null uses nil.
type Object = compose.OMap

// NewObject creates an ordered object from alternating string keys and values.
func NewObject(pairs ...any) *Object {
	o := compose.NewOMap()
	if len(pairs)%2 != 0 {
		panic("NewObject requires key/value pairs")
	}
	for i := 0; i < len(pairs); i += 2 {
		key, ok := pairs[i].(string)
		if !ok {
			panic("Object keys must be strings")
		}
		o.Set(key, pairs[i+1])
	}
	return o
}

// DecodeJSON preserves object order and rejects malformed or multiple documents.
func DecodeJSON(data []byte) (any, error) {
	if !json.Valid(data) {
		return nil, fmt.Errorf("Invalid JSON document")
	}
	return compose.DecodeOrdered(data)
}

type absentValue struct{}

var absent any = absentValue{}

func isAbsent(v any) bool  { _, ok := v.(absentValue); return ok }
func object(v any) *Object { o, _ := v.(*Object); return o }
func read(v any, key string) any {
	if o := object(v); o != nil {
		if x, ok := o.Get(key); ok {
			return x
		}
	}
	return absent
}
func stringAt(v any, key string) string { return scalar(read(v, key)) }
func has(v any, key string) bool        { o := object(v); return o != nil && o.Has(key) }
func list(v any) []any                  { a, _ := v.([]any); return a }
func copyValue(v any) any {
	switch x := v.(type) {
	case *Object:
		if x == nil {
			return nil
		}
		o := NewObject()
		for _, k := range x.Keys() {
			a, _ := x.Get(k)
			o.Set(k, copyValue(a))
		}
		return o
	case []*Object:
		out := make([]*Object, len(x))
		for i, v := range x {
			out[i] = copyValue(v).(*Object)
		}
		return out
	case []any:
		a := make([]any, len(x))
		for i, v := range x {
			a[i] = copyValue(v)
		}
		return a
	default:
		return v
	}
}
func merge(dst *Object, src any) {
	if o := object(src); o != nil {
		for _, k := range o.Keys() {
			v, _ := o.Get(k)
			dst.Set(k, v)
		}
	}
}
func scalar(v any) string {
	if v == nil || isAbsent(v) {
		return ""
	}
	switch x := v.(type) {
	case string:
		return x
	case bool:
		if x {
			return "1"
		}
		return ""
	case *Object, []any:
		return ""
	case float64:
		return numberString(x)
	case float32:
		return numberString(float64(x))
	default:
		return fmt.Sprint(x)
	}
}
func jsString(v any) string {
	if isAbsent(v) {
		return "undefined"
	}
	if v == nil {
		return "null"
	}
	switch x := v.(type) {
	case bool:
		if x {
			return "true"
		}
		return "false"
	case *Object:
		return "[object Object]"
	case []any:
		a := []string{}
		for _, e := range x {
			if e == nil || isAbsent(e) {
				a = append(a, "")
			} else {
				a = append(a, jsString(e))
			}
		}
		return strings.Join(a, ",")
	default:
		return scalar(v)
	}
}
func truthy(v any) bool {
	if v == nil || isAbsent(v) {
		return false
	}
	switch x := v.(type) {
	case bool:
		return x
	case string:
		return x != ""
	case float64:
		return x != 0 && !math.IsNaN(x)
	case int:
		return x != 0
	default:
		if n, ok := asNumber(v); ok {
			return n != 0 && !math.IsNaN(n)
		}
		return true
	}
}
func defaultString(value, def any) string {
	if isAbsent(value) && def != nil && !isAbsent(def) {
		if _, array := def.([]any); !array {
			return scalar(def)
		}
	}
	return scalar(value)
}
func asNumber(v any) (float64, bool) {
	switch n := v.(type) {
	case float32:
		return float64(n), true
	case int8:
		return float64(n), true
	case int16:
		return float64(n), true
	case int32:
		return float64(n), true
	case uint:
		return float64(n), true
	case uint8:
		return float64(n), true
	case uint16:
		return float64(n), true
	case uint32:
		return float64(n), true
	case uint64:
		return float64(n), true
	case float64:
		return n, true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case json.Number:
		f, e := n.Float64()
		return f, e == nil
	default:
		return 0, false
	}
}
func keys(v any) []string {
	if o := object(v); o != nil {
		return o.Keys()
	}
	if a, ok := v.([]any); ok {
		out := make([]string, len(a))
		for i := range a {
			out[i] = strconv.Itoa(i)
		}
		return out
	}
	return nil
}
func item(v any, k string) any {
	if o := object(v); o != nil {
		return read(o, k)
	}
	if a, ok := v.([]any); ok {
		n, e := strconv.Atoi(k)
		if e == nil && n >= 0 && n < len(a) {
			return a[n]
		}
	}
	return absent
}
func translate(v any, language string) string {
	if s, ok := v.(string); ok {
		return s
	}
	if o := object(v); o != nil {
		for _, k := range []string{language, "en", "ko"} {
			if x := read(o, k); truthy(x) {
				return scalar(x)
			}
		}
		if ks := o.Keys(); len(ks) > 0 {
			return scalar(read(o, ks[0]))
		}
	}
	return ""
}
func parsePath(path string) []string {
	return strings.FieldsFunc(path, func(r rune) bool { return r == '.' || r == '[' || r == ']' })
}
func valueSegments(path string) []string {
	a := parsePath(path)
	for i, s := range a {
		if positionRE.MatchString(s) {
			a[i] = s[1:]
		}
	}
	return a
}
func getPath(v any, path string) any {
	for _, s := range valueSegments(path) {
		v = item(v, s)
		if isAbsent(v) {
			return v
		}
	}
	return v
}

var positionRE = regexp.MustCompile(`^#\d+$`)

func bracketName(path, prefix string) string {
	segs := valueSegments(path)
	if prefix != "" {
		segs = append([]string{prefix}, segs...)
	}
	if len(segs) == 0 {
		if prefix != "" {
			return prefix + "[]"
		}
		return ""
	}
	return segs[0] + func() string {
		var b strings.Builder
		for _, s := range segs[1:] {
			b.WriteString("[" + s + "]")
		}
		return b.String()
	}()
}
func containsInt(a []int, n int) bool {
	for _, i := range a {
		if i == n {
			return true
		}
	}
	return false
}
func leafName(path string, rows []int) string {
	suffix := ""
	if strings.HasSuffix(path, "[]") {
		suffix = "[]"
		path = strings.TrimSuffix(path, "[]")
	}
	s := parsePath(path)
	if len(s) == 0 {
		return path + suffix
	}
	n := len(s) - 1
	if (positionRE.MatchString(s[n]) || containsInt(rows, n)) && n > 0 {
		return s[n-1] + "[]"
	}
	return s[n] + suffix
}
func ruleName(path string, rows []int) string {
	suffix := ""
	if strings.HasSuffix(path, "[]") {
		suffix = "[]"
		path = strings.TrimSuffix(path, "[]")
	}
	s := parsePath(path)
	if len(s) == 0 {
		return path + suffix
	}
	out := s[0]
	for i, v := range s[1:] {
		if positionRE.MatchString(v) || containsInt(rows, i+1) {
			out += "[]"
		} else {
			out += "[" + v + "]"
		}
	}
	return out + suffix
}
func cleanString(s string) string {
	return strings.NewReplacer("[]", "", "][", "-", "[", "-", "]", "-").Replace(s)
}

var elementRE = regexp.MustCompile(`[^A-Za-z0-9_-]`)

func elementID(prefix, path string) string {
	base := elementRE.ReplaceAllString(cleanString(path), "-")
	if prefix != "" {
		return prefix + "-" + base
	}
	return base
}
func uriComponent(s string) string {
	return strings.NewReplacer("+", "%20", "%21", "!", "%27", "'", "%28", "(", "%29", ")", "%2A", "*").Replace(url.QueryEscape(s))
}
func controlID(prefix, path string) string { return uriComponent(prefix) + ":" + uriComponent(path) }
func joinClass(parts ...string) string {
	return strings.Join(strings.Fields(strings.Join(parts, " ")), " ")
}
func styleString(source string) string {
	parts := []string{}
	for _, d := range parseStyle(source) {
		parts = append(parts, d.property+": "+d.value)
	}
	return strings.Join(parts, "; ")
}
func compactStyle(source string) string {
	values := NewObject()
	for _, d := range parseStyle(source) {
		values.Set(d.property, d.value)
	}
	parts := []string{}
	for _, k := range values.Keys() {
		parts = append(parts, k+":"+stringAt(values, k))
	}
	return strings.Join(parts, ";")
}
func plainLookup(v any) any {
	switch x := v.(type) {
	case *Object:
		m := map[string]any{}
		for _, k := range x.Keys() {
			a, _ := x.Get(k)
			m[k] = plainLookup(a)
		}
		return m
	case []any:
		a := make([]any, len(x))
		for i, v := range x {
			a[i] = plainLookup(v)
		}
		return a
	default:
		return v
	}
}

// checkOrderedValue rejects values whose object member order is unavailable.
func checkOrderedValue(value any) error {
	return checkValue(value, make(map[*Object]bool), make(map[uintptr]bool))
}
func checkValue(value any, objects map[*Object]bool, arrays map[uintptr]bool) error {
	switch v := value.(type) {
	case nil, string, bool, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return nil
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return fmt.Errorf("Form numbers must be finite")
		}
		return nil
	case float32:
		if math.IsNaN(float64(v)) || math.IsInf(float64(v), 0) {
			return fmt.Errorf("Form numbers must be finite")
		}
		return nil
	case *Object:
		if v == nil {
			return nil
		}
		if objects[v] {
			return fmt.Errorf("Recursive form values are not supported")
		}
		objects[v] = true
		defer delete(objects, v)
		for _, k := range v.Keys() {
			child, _ := v.Get(k)
			if e := checkValue(child, objects, arrays); e != nil {
				return e
			}
		}
		return nil
	case []any:
		ptr := reflect.ValueOf(v).Pointer()
		if arrays[ptr] && len(v) > 0 {
			return fmt.Errorf("Recursive form values are not supported")
		}
		arrays[ptr] = true
		defer delete(arrays, ptr)
		for _, child := range v {
			if e := checkValue(child, objects, arrays); e != nil {
				return e
			}
		}
		return nil
	default:
		return fmt.Errorf("Unsupported form value %T; objects must preserve member order", value)
	}
}
