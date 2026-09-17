// Package text checks input text (docs/spec/input-text.md). Every string and
// object member name in a specification, a composition file and caller data is
// valid UTF-8, the Go form of a sequence of Unicode scalar values. Invalid text
// is rejected before any other check of an operation; it is never replaced and
// never passed on.
package text

import (
	"reflect"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
)

// Message is the message of every input text failure.
const Message = "Text must be Unicode scalar values"

// InvalidPath returns the path of the first invalid text in value: the path of a
// string, or of the object whose member name is invalid. Members are visited in
// code point order of their names, which is the byte order of valid UTF-8, and
// list items in index order. The second result is false when every text is
// valid.
func InvalidPath(value any) ([]string, bool) {
	if !contains(value, walk{}) {
		return nil, false
	}
	return first(value, []string{}, walk{}), true
}

// walk holds the containers on the current path. A value that contains itself
// is not searched again; the operation's own value checks report it.
type walk map[uintptr]bool

// enter returns false when value is a container already on the current path.
func (w walk) enter(value any) (uintptr, bool) {
	reflected := reflect.ValueOf(value)
	switch reflected.Kind() {
	case reflect.Map, reflect.Pointer, reflect.Slice:
		if reflected.IsNil() || (reflected.Kind() == reflect.Slice && reflected.Len() == 0) {
			return 0, true
		}
		pointer := reflected.Pointer()
		if w[pointer] {
			return 0, false
		}
		w[pointer] = true
		return pointer, true
	}
	return 0, true
}

// member is one named child of an object value.
type member struct {
	name  string
	value any
}

// children returns the members of an object value, the items of a list value
// (with a nil name slice) and whether value is either.
func children(value any) (names []string, values []any, object bool, ok bool) {
	switch v := value.(type) {
	case *compose.OMap:
		if v == nil {
			return nil, nil, true, true
		}
		for _, key := range v.Keys() {
			child, _ := v.Get(key)
			names = append(names, key)
			values = append(values, child)
		}
		return names, values, true, true
	case map[string]any:
		for key, child := range v {
			names = append(names, key)
			values = append(values, child)
		}
		return names, values, true, true
	case []any:
		return nil, v, false, true
	}
	reflected := reflect.ValueOf(value)
	switch reflected.Kind() {
	case reflect.Map:
		if reflected.Type().Key().Kind() != reflect.String {
			return nil, nil, false, false
		}
		iterator := reflected.MapRange()
		for iterator.Next() {
			names = append(names, iterator.Key().String())
			values = append(values, iterator.Value().Interface())
		}
		return names, values, true, true
	case reflect.Slice, reflect.Array:
		if reflected.Type().Elem().Kind() == reflect.Uint8 {
			return nil, nil, false, false
		}
		for i := 0; i < reflected.Len(); i++ {
			values = append(values, reflected.Index(i).Interface())
		}
		return nil, values, false, true
	}
	return nil, nil, false, false
}

func contains(value any, w walk) bool {
	if s, isString := value.(string); isString {
		return !utf8.ValidString(s)
	}
	names, values, _, ok := children(value)
	if !ok {
		return false
	}
	pointer, fresh := w.enter(value)
	if !fresh {
		return false
	}
	defer delete(w, pointer)
	for _, name := range names {
		if !utf8.ValidString(name) {
			return true
		}
	}
	for _, child := range values {
		if contains(child, w) {
			return true
		}
	}
	return false
}

func first(value any, path []string, w walk) []string {
	if s, isString := value.(string); isString {
		if utf8.ValidString(s) {
			return nil
		}
		return path
	}
	names, values, object, ok := children(value)
	if !ok {
		return nil
	}
	pointer, fresh := w.enter(value)
	if !fresh {
		return nil
	}
	defer delete(w, pointer)
	if !object {
		for i, child := range values {
			if found := first(child, append(append([]string{}, path...), strconv.Itoa(i)), w); found != nil {
				return found
			}
		}
		return nil
	}
	members := make([]member, len(names))
	for i, name := range names {
		if !utf8.ValidString(name) {
			return path
		}
		members[i] = member{name, values[i]}
	}
	sort.SliceStable(members, func(i, j int) bool { return members[i].name < members[j].name })
	for _, m := range members {
		if found := first(m.value, append(append([]string{}, path...), m.name), w); found != nil {
			return found
		}
	}
	return nil
}

// LoadFailure returns the INVALID_TEXT load failure at trace.
func LoadFailure(trace []string) *compose.ComposeLoadError {
	return &compose.ComposeLoadError{Code: compose.InvalidText, Message: Message, Trace: trace}
}

// CheckSpecification checks a specification and then the composition files an
// operation reads. Invalid text is the INVALID_TEXT load failure located at its
// specification path, or at the file name followed by its path in the file; an
// invalid file name is located at the empty path.
func CheckSpecification(spec any, files any) *compose.ComposeLoadError {
	for _, value := range []any{spec, files} {
		if trace, found := InvalidPath(value); found {
			return LoadFailure(trace)
		}
	}
	return nil
}

// Input is one named caller value of an operation.
type Input struct {
	// Name is the documented argument name, such as data or options.basepath.
	Name string
	// Value is the caller value.
	Value any
}

// CheckInputs checks named caller values in order and returns the failure
// message of the first invalid text, which names the value and its path, or
// the empty string.
func CheckInputs(inputs ...Input) string {
	for _, input := range inputs {
		if path, found := InvalidPath(input.Value); found {
			return Message + ": " + strings.Join(append([]string{input.Name}, path...), ".")
		}
	}
	return ""
}

// checkedLoader checks each document its loader returns.
type checkedLoader struct {
	loader compose.FileLoader
}

// CheckedLoader returns a loader that checks each document it loads, located
// as a composition file.
func CheckedLoader(loader compose.FileLoader) compose.FileLoader {
	return checkedLoader{loader}
}

// Normalize delegates to the wrapped loader.
func (l checkedLoader) Normalize(path, basepath string) string {
	return l.loader.Normalize(path, basepath)
}

// Load returns the wrapped loader's document, or the INVALID_TEXT failure of
// its first invalid text.
func (l checkedLoader) Load(key string) (*compose.OMap, error) {
	doc, err := l.loader.Load(key)
	if err != nil {
		return nil, err
	}
	if trace, found := InvalidPath(doc); found {
		return nil, LoadFailure(append([]string{key}, trace...))
	}
	return doc, nil
}
