package generator

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"math"
	"regexp"
	"strings"
)

var sequenceRE = regexp.MustCompile(`^\d{1,13}$`)
var rowKeyRE = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
var numericKeyRE = regexp.MustCompile(`^\d+$`)

// SequenceRowKey converts a nonnegative sequence of at most 13 digits to a scoped row key.
func SequenceRowKey(sequence any) (string, error) {
	switch sequence.(type) {
	case string, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64:
	default:
		return "", fmt.Errorf("A sequence must contain 1–13 decimal digits")
	}
	if n, ok := asNumber(sequence); ok && (math.IsNaN(n) || math.IsInf(n, 0) || math.Trunc(n) != n || n < 0 || n > 9999999999999) {
		return "", fmt.Errorf("A sequence must contain 1–13 decimal digits")
	}
	digits := scalar(sequence)
	if !sequenceRE.MatchString(digits) {
		return "", fmt.Errorf("A sequence must contain 1–13 decimal digits")
	}
	return "__" + strings.Repeat("0", 13-len(digits)) + digits + "__", nil
}

// CreateRowKey creates a row key containing 13 random hexadecimal characters.
func CreateRowKey() (string, error) {
	var data [7]byte
	if _, e := rand.Read(data[:]); e != nil {
		return "", e
	}
	return "__" + hex.EncodeToString(data[:])[:13] + "__", nil
}
func checkKey(k string) error {
	if !rowKeyRE.MatchString(k) || numericKeyRE.MatchString(k) || k == "__proto__" || k == "prototype" || k == "constructor" {
		return fmt.Errorf("Invalid row key: %s; use sequenceRowKey for numeric ids", k)
	}
	return nil
}
func checkedSegments(path string) ([]string, error) {
	s := parsePath(path)
	if len(s) == 0 {
		return nil, fmt.Errorf("Invalid form path: %s", path)
	}
	for _, k := range s {
		if k == "__proto__" || k == "prototype" || k == "constructor" {
			return nil, fmt.Errorf("Invalid form path: %s", path)
		}
	}
	return s, nil
}

// AddRowOptions preserves explicit null through ValueProvided.
type AddRowOptions struct {
	Key           string
	AfterKey      string
	Value         any
	ValueProvided bool
}

// Form owns an independent record, compiled template and current field models.
type Form struct {
	template *FormTemplate
	data     *Object
	fields   []*Object
	options  BindOptions
	revision uint64
}

// NewForm copies the template and record, applies missing defaults and binds fields.
func NewForm(template *FormTemplate, data *Object, options BindOptions) (*Form, error) {
	if e := checkOrderedValue(data); e != nil {
		return nil, e
	}
	t, e := cloneTemplate(template)
	if e != nil {
		return nil, e
	}
	f := &Form{template: t, options: options}
	var input any = data
	if data == nil {
		input = absent
	}
	d, e := f.normalizeFields(t.Fields, input, "")
	if e != nil {
		return nil, e
	}
	fields, e := BindForm(t, d, options)
	if e != nil {
		return nil, e
	}
	f.data, f.fields = d, fields
	return f, nil
}

// GetData returns a deep copy of the current ordered record.
func (f *Form) GetData() *Object { return copyValue(f.data).(*Object) }

// Template returns a deep copy of the reusable form structure.
func (f *Form) Template() *FormTemplate { t, _ := cloneTemplate(f.template); return t }

// Fields returns deep copies of the current field models.
func (f *Form) Fields() []*Object {
	out := make([]*Object, len(f.fields))
	for i, v := range f.fields {
		out[i] = copyValue(v).(*Object)
	}
	return out
}

// Revision returns the number of successful instance mutations.
func (f *Form) Revision() uint64 { return f.revision }

// GetValue returns a detached value at a record path; absent values return nil.
func (f *Form) GetValue(path string) (any, error) {
	if _, e := checkedSegments(path); e != nil {
		return nil, e
	}
	v := getPath(f.data, path)
	if isAbsent(v) {
		return nil, nil
	}
	return copyValue(v), nil
}

// SetData replaces the complete record and rebinds fields atomically.
func (f *Form) SetData(data *Object) error {
	if e := checkOrderedValue(data); e != nil {
		return e
	}
	if data == nil {
		return fmt.Errorf("Form data must be an object")
	}
	d, e := f.normalizeFields(f.template.Fields, data, "")
	if e != nil {
		return e
	}
	return f.commit(d)
}

// SetValue replaces one path value and rebinds fields atomically.
func (f *Form) SetValue(path string, value any) error {
	if e := checkOrderedValue(value); e != nil {
		return e
	}
	s, e := checkedSegments(path)
	if e != nil {
		return e
	}
	d, e := f.normalizeFields(f.template.Fields, putAt(f.data, s, copyValue(value)), "")
	if e != nil {
		return e
	}
	return f.commit(d)
}
func (f *Form) commit(data *Object) error {
	fields, e := BindForm(f.template, data, f.options)
	if e != nil {
		return e
	}
	f.data, f.fields = data, fields
	f.revision++
	return nil
}
func putAt(data *Object, path []string, value any) *Object {
	out := NewObject()
	if data != nil {
		out = data.Clone()
	}
	if len(path) == 1 {
		out.Set(path[0], value)
	} else {
		out.Set(path[0], putAt(object(read(data, path[0])), path[1:], value))
	}
	return out
}
func freshKey(used *Object) (string, error) {
	for i := 0; i < 100; i++ {
		k, e := CreateRowKey()
		if e != nil {
			return "", e
		}
		if used == nil || !used.Has(k) {
			return k, nil
		}
	}
	return "", fmt.Errorf("Unable to generate an unused row key")
}

// normalizeFields normalizes record data; path is the full data path, empty at the root.
func (f *Form) normalizeFields(fields []FieldTemplate, value any, path string) (*Object, error) {
	if !isAbsent(value) && object(value) == nil {
		if path == "" {
			return nil, fmt.Errorf("Form data must be an object")
		}
		return nil, fmt.Errorf("Group data must be an object: %s", path)
	}
	data := NewObject()
	if !isAbsent(value) {
		data = copyValue(value).(*Object)
	}
	for _, field := range fields {
		raw := read(data, field.Name)
		fieldPath := field.Name
		if path != "" {
			fieldPath = path + "." + field.Name
		}
		if repeated(field) {
			if !isAbsent(raw) && object(raw) == nil {
				return nil, fmt.Errorf("Repeated data must be a keyed object: %s", fieldPath)
			}
			rows := NewObject()
			if isAbsent(raw) {
				k, e := freshKey(nil)
				if e != nil {
					return nil, e
				}
				v, e := f.normalizeRow(field, absent, fieldPath+"."+k)
				if e != nil {
					return nil, e
				}
				rows.Set(k, v)
			} else {
				for _, k := range object(raw).Keys() {
					if e := checkKey(k); e != nil {
						return nil, e
					}
					v, e := f.normalizeRow(field, read(raw, k), fieldPath+"."+k)
					if e != nil {
						return nil, e
					}
					rows.Set(k, v)
				}
			}
			data.Set(field.Name, rows)
		} else if stringAt(field.Spec, "type") == "group" {
			v, e := f.normalizeFields(field.Children, raw, fieldPath)
			if e != nil {
				return nil, e
			}
			data.Set(field.Name, v)
		} else if isAbsent(raw) && field.Spec.Has("default") {
			data.Set(field.Name, copyValue(read(field.Spec, "default")))
		}
	}
	return data, nil
}
func (f *Form) normalizeRow(field FieldTemplate, value any, path string) (any, error) {
	if stringAt(field.Spec, "type") == "group" {
		return f.normalizeFields(field.Children, value, path)
	}
	if isAbsent(value) {
		value = read(field.Spec, "default")
		if value == nil || isAbsent(value) {
			value = ""
		}
	}
	return copyValue(value), nil
}
func (f *Form) collection(path string) (FieldTemplate, *Object, error) {
	segments, e := checkedSegments(path)
	if e != nil {
		return FieldTemplate{}, nil, e
	}
	fields := f.template.Fields
	var found *FieldTemplate
	for i := 0; i < len(segments); i++ {
		found = nil
		for j := range fields {
			if fields[j].Name == segments[i] {
				found = &fields[j]
				break
			}
		}
		if found == nil {
			return FieldTemplate{}, nil, fmt.Errorf("Unknown collection: %s", path)
		}
		if i == len(segments)-1 {
			break
		}
		if repeated(*found) {
			i++
		}
		fields = found.Children
		found = nil
	}
	rows := object(getPath(f.data, path))
	if found == nil || !repeated(*found) || rows == nil {
		return FieldTemplate{}, nil, fmt.Errorf("Not a keyed collection: %s", path)
	}
	return *found, rows, nil
}

// AddRow inserts a default or supplied row in the selected repeated collection.
func (f *Form) AddRow(path string, options AddRowOptions) (string, error) {
	if e := checkOrderedValue(options.Value); e != nil {
		return "", e
	}
	field, rows, e := f.collection(path)
	if e != nil {
		return "", e
	}
	if max, ok := asNumber(read(read(field.Spec, "multiple"), "max")); ok && float64(rows.Len()) >= max {
		return "", fmt.Errorf("Maximum row count reached: %s", path)
	}
	key := options.Key
	if key == "" {
		key, e = freshKey(rows)
		if e != nil {
			return "", e
		}
	}
	if e = checkKey(key); e != nil {
		return "", e
	}
	if rows.Has(key) {
		return "", fmt.Errorf("Row key already exists: %s", key)
	}
	if options.AfterKey != "" && !rows.Has(options.AfterKey) {
		return "", fmt.Errorf("Unknown row: %s", options.AfterKey)
	}
	v := absent
	if options.ValueProvided || options.Value != nil {
		v = options.Value
	}
	segs, _ := checkedSegments(path)
	v, e = f.normalizeRow(field, v, strings.Join(append(append([]string{}, segs...), key), "."))
	if e != nil {
		return "", e
	}
	out := NewObject()
	for _, k := range rows.Keys() {
		out.Set(k, read(rows, k))
		if k == options.AfterKey {
			out.Set(key, v)
		}
	}
	if options.AfterKey == "" {
		out.Set(key, v)
	}
	if e = f.commit(putAt(f.data, segs, out)); e != nil {
		return "", e
	}
	return key, nil
}

// CopyRow copies a row and generates fresh keys for its repeated descendants.
func (f *Form) CopyRow(path, key string, options AddRowOptions) (string, error) {
	field, rows, e := f.collection(path)
	if e != nil {
		return "", e
	}
	if !rows.Has(key) {
		return "", fmt.Errorf("Unknown row: %s", key)
	}
	v, e := f.copyRowValue(field, read(rows, key))
	if e != nil {
		return "", e
	}
	options.Value = v
	options.ValueProvided = true
	if options.AfterKey == "" {
		options.AfterKey = key
	}
	return f.AddRow(path, options)
}
func (f *Form) copyRowValue(field FieldTemplate, value any) (any, error) {
	if stringAt(field.Spec, "type") != "group" {
		return copyValue(value), nil
	}
	return f.copyChildren(field.Children, object(value))
}
func (f *Form) copyChildren(fields []FieldTemplate, value *Object) (*Object, error) {
	out := copyValue(value).(*Object)
	for _, child := range fields {
		raw := read(out, child.Name)
		if repeated(child) && object(raw) != nil {
			used := object(raw).Clone()
			rows := NewObject()
			for _, old := range object(raw).Keys() {
				key, e := freshKey(used)
				if e != nil {
					return nil, e
				}
				used.Set(key, true)
				v, e := f.copyRowValue(child, read(raw, old))
				if e != nil {
					return nil, e
				}
				rows.Set(key, v)
			}
			out.Set(child.Name, rows)
		} else if stringAt(child.Spec, "type") == "group" && object(raw) != nil {
			v, e := f.copyChildren(child.Children, object(raw))
			if e != nil {
				return nil, e
			}
			out.Set(child.Name, v)
		}
	}
	return out, nil
}

// RemoveRow removes a row when the collection minimum permits removal.
func (f *Form) RemoveRow(path, key string) error {
	field, rows, e := f.collection(path)
	if e != nil {
		return e
	}
	if !rows.Has(key) {
		return fmt.Errorf("Unknown row: %s", key)
	}
	if min, ok := asNumber(read(read(field.Spec, "multiple"), "min")); ok && float64(rows.Len()) <= min {
		return fmt.Errorf("Minimum row count reached: %s", path)
	}
	out := rows.Clone()
	out.Delete(key)
	segs, _ := checkedSegments(path)
	return f.commit(putAt(f.data, segs, out))
}

// MoveRow moves an existing row to a zero-based collection position.
func (f *Form) MoveRow(path, key string, index int) error {
	_, rows, e := f.collection(path)
	if e != nil {
		return e
	}
	if !rows.Has(key) {
		return fmt.Errorf("Unknown row: %s", key)
	}
	if index < 0 || index >= rows.Len() {
		return fmt.Errorf("Invalid row position: %d", index)
	}
	ks := rows.Keys()
	from := 0
	for i, k := range ks {
		if k == key {
			from = i
		}
	}
	if from == index {
		return nil
	}
	ks = append(ks[:from], ks[from+1:]...)
	ks = append(ks, "")
	copy(ks[index+1:], ks[index:])
	ks[index] = key
	out := NewObject()
	for _, k := range ks {
		out.Set(k, read(rows, k))
	}
	segs, _ := checkedSegments(path)
	return f.commit(putAt(f.data, segs, out))
}

// RekeyRow replaces a row key without changing its value or collection position.
func (f *Form) RekeyRow(path, oldKey, newKey string) error {
	_, rows, e := f.collection(path)
	if e != nil {
		return e
	}
	if e = checkKey(newKey); e != nil {
		return e
	}
	if !rows.Has(oldKey) {
		return fmt.Errorf("Unknown row: %s", oldKey)
	}
	if oldKey == newKey {
		return nil
	}
	if rows.Has(newKey) {
		return fmt.Errorf("Row key already exists: %s", newKey)
	}
	out := NewObject()
	for _, k := range rows.Keys() {
		v := read(rows, k)
		if k == oldKey {
			k = newKey
		}
		out.Set(k, v)
	}
	segs, _ := checkedSegments(path)
	return f.commit(putAt(f.data, segs, out))
}
