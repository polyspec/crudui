package main

import (
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"
)

var rowKey = regexp.MustCompile(`^__[a-f0-9]{13}__$`)
var fieldName = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*(\[[^\[\]]+\])*$`)

// parseNative visits fields in request order, including multipart parts.
func parseNative(body []byte, contentType string) (*object, error) {
	kind, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return nil, err
	}
	result := record()
	count := 0
	add := func(name, value string) error {
		count++
		if count > 10000 {
			return fmt.Errorf("Too many native form fields")
		}
		if !fieldName.MatchString(name) || !utf8.ValidString(name) || !utf8.ValidString(value) {
			return fmt.Errorf("Invalid native field")
		}
		segments := strings.Split(strings.ReplaceAll(name, "]", ""), "[")
		current := result
		for _, key := range segments[:len(segments)-1] {
			child := get(current, key)
			if child == nil {
				child = record()
				current.Set(key, child)
			}
			next, ok := child.(*object)
			if !ok {
				return fmt.Errorf("Conflicting native field: %s", name)
			}
			current = next
		}
		if current.Has(segments[len(segments)-1]) {
			return fmt.Errorf("Repeated native field: %s", name)
		}
		current.Set(segments[len(segments)-1], value)
		return nil
	}
	switch kind {
	case "application/x-www-form-urlencoded":
		for _, pair := range strings.Split(string(body), "&") {
			if pair == "" {
				continue
			}
			parts := strings.SplitN(pair, "=", 2)
			name, err := url.QueryUnescape(parts[0])
			if err != nil {
				return nil, err
			}
			value := ""
			if len(parts) == 2 {
				value, err = url.QueryUnescape(parts[1])
				if err != nil {
					return nil, err
				}
			}
			if err = add(name, value); err != nil {
				return nil, err
			}
		}
	case "multipart/form-data":
		if params["boundary"] == "" {
			return nil, fmt.Errorf("Missing multipart boundary")
		}
		reader := multipart.NewReader(strings.NewReader(string(body)), params["boundary"])
		for {
			part, err := reader.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				return nil, err
			}
			if part.FileName() != "" {
				return nil, fmt.Errorf("File uploads are not part of this form")
			}
			data, err := io.ReadAll(part)
			if err != nil {
				return nil, err
			}
			if err = add(part.FormName(), string(data)); err != nil {
				return nil, err
			}
		}
	default:
		return nil, fmt.Errorf("Expected a native form")
	}
	return result, nil
}

type row struct {
	key   string
	value *object
}

func rows(value any, path string) ([]row, error) {
	result := []row{}
	items, ok := value.(*object)
	if !ok {
		return nil, fmt.Errorf("Expected collection: %s", path)
	}
	for _, key := range items.Keys() {
		if !rowKey.MatchString(key) {
			return nil, fmt.Errorf("Invalid row key: %s", path)
		}
		value, ok := get(items, key).(*object)
		if !ok {
			return nil, fmt.Errorf("Expected row object: %s", path)
		}
		result = append(result, row{key, value})
	}
	return result, nil
}

func rowCollection(items []row) any {
	result := record()
	for _, item := range items {
		result.Set(item.key, item.value)
	}
	return result
}

// shape is one part of the submitted form: a text or checkbox leaf, an object of exactly these
// text members, an object of fields or keyed rows of one object of fields.
type shape struct {
	leaf   string
	texts  []string
	fields []field
	rows   *shape
}

// field is one member of an object of fields; only a required field must be present.
type field struct {
	name     string
	shape    shape
	required bool
}

var (
	textLeaf     = shape{leaf: "text"}
	checkboxLeaf = shape{leaf: "checkbox"}
)

func textsOf(names ...string) shape { return shape{texts: names} }

// requiredShape marks a field that must be present.
type requiredShape struct{ shape shape }

func required(s shape) requiredShape { return requiredShape{s} }

// fieldsOf is an object of fields of name and shape (or required shape) pairs in member order.
func fieldsOf(pairs ...any) shape {
	result := shape{}
	for index := 0; index < len(pairs); index += 2 {
		member := field{name: pairs[index].(string)}
		switch child := pairs[index+1].(type) {
		case requiredShape:
			member.shape, member.required = child.shape, true
		case shape:
			member.shape = child
		}
		result.fields = append(result.fields, member)
	}
	return result
}

func rowsOf(row shape) shape { return shape{rows: &row} }

// companiesShape is the submitted companies of docs/spec/form-comparison.md, "Record resource",
// and scenarioShape the benchmark form that holds only them.
var (
	companiesShape = rowsOf(fieldsOf("name", textLeaf, "stores", rowsOf(fieldsOf(
		"name", textLeaf, "enabled", checkboxLeaf, "detail", textLeaf, "title", textsOf("ko", "en"),
		"departments", rowsOf(fieldsOf("name", textLeaf)),
	))))
	scenarioShape = fieldsOf("companies", companiesShape)
)

// empty is the value of an absent field: empty text, empty texts or no rows.
func empty(s shape) any {
	if s.leaf != "" {
		return ""
	}
	result := record()
	for _, name := range s.texts {
		result.Set(name, "")
	}
	return result
}

// shaped returns the submitted value of s at path, completed and in the member order of s. Form
// data leaves out a field that holds no value, so an absent field other than a required one
// completes as its empty value in both media types. Any other difference answers 400.
func shaped(value any, s shape, path string) (any, error) {
	if s.leaf != "" {
		text, ok := value.(string)
		if !ok {
			return nil, fail(http.StatusBadRequest, "Expected text at "+path)
		}
		if s.leaf == "checkbox" && text != "" && text != "1" {
			return nil, fail(http.StatusBadRequest, `Expected "" or "1" at `+path)
		}
		return text, nil
	}
	submitted, ok := value.(*object)
	if !ok {
		return nil, fail(http.StatusBadRequest, "Expected an object at "+path)
	}
	result := record()
	if s.rows != nil {
		for _, key := range submitted.Keys() {
			if !rowKey.MatchString(key) {
				return nil, fail(http.StatusBadRequest, "Expected a row key at "+path+": "+key)
			}
			row, err := shaped(get(submitted, key), *s.rows, path+"."+key)
			if err != nil {
				return nil, err
			}
			result.Set(key, row)
		}
		return result, nil
	}
	// An object of texts holds every member; a field may be absent unless it is required.
	members := s.fields
	for _, name := range s.texts {
		members = append(members, field{name: name, shape: textLeaf, required: true})
	}
	for _, key := range submitted.Keys() {
		if !slices.ContainsFunc(members, func(member field) bool { return member.name == key }) {
			return nil, fail(http.StatusBadRequest, "Unexpected member "+path+"."+key)
		}
	}
	for _, member := range members {
		if !submitted.Has(member.name) {
			if member.required {
				return nil, fail(http.StatusBadRequest, "Missing member "+path+"."+member.name)
			}
			result.Set(member.name, empty(member.shape))
			continue
		}
		child, err := shaped(get(submitted, member.name), member.shape, path+"."+member.name)
		if err != nil {
			return nil, err
		}
		result.Set(member.name, child)
	}
	return result, nil
}
