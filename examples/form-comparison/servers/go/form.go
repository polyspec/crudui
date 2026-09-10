package main

import (
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/url"
	"regexp"
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

func text(value any) (string, error) {
	switch value := value.(type) {
	case nil:
		return "", nil
	case string:
		return value, nil
	default:
		return "", fmt.Errorf("Expected string field value")
	}
}

func emptyRows() any { return record() }

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

// normalize retains submitted rows and normalizes omitted controls.
func normalize(data *object) (*object, error) {
	data = clone(data).(*object)
	var walk func(any, int, string) (any, error)
	walk = func(value any, level int, path string) (any, error) {
		items, err := rows(value, path)
		if err != nil {
			return nil, err
		}
		for _, item := range items {
			name, err := text(get(item.value, "name"))
			if err != nil {
				return nil, err
			}
			item.value.Set("name", name)
			if level == 1 {
				for _, name := range []string{"enabled", "detail"} {
					v, err := text(get(item.value, name))
					if err != nil {
						return nil, err
					}
					if name == "enabled" && v != "" && v != "1" {
						return nil, fmt.Errorf("Expected checkbox value 1 or empty string")
					}
					item.value.Set(name, v)
				}
				title := record()
				raw := get(item.value, "title")
				if raw != nil {
					var ok bool
					title, ok = raw.(*object)
					if !ok {
						return nil, fmt.Errorf("Expected language object")
					}
				}
				for _, language := range title.Keys() {
					if language != "ko" && language != "en" {
						return nil, fmt.Errorf("Expected ko or en title field")
					}
				}
				ko, err := text(get(title, "ko"))
				if err != nil {
					return nil, err
				}
				en, err := text(get(title, "en"))
				if err != nil {
					return nil, err
				}
				item.value.Set("title", record("ko", ko, "en", en))
			}
			if level < 2 {
				child := []string{"stores", "departments"}[level]
				v := get(item.value, child)
				if !item.value.Has(child) {
					v = emptyRows()
				}
				nested, err := walk(v, level+1, path+"."+item.key+"."+child)
				if err != nil {
					return nil, err
				}
				item.value.Set(child, nested)
			}
		}
		return rowCollection(items), nil
	}
	value := get(data, "companies")
	if !data.Has("companies") {
		value = emptyRows()
	}
	companies, err := walk(value, 0, "companies")
	if err != nil {
		return nil, err
	}
	return record("companies", companies), nil
}

func checkJSONShape(data *object) error {
	var walk func(any, int) error
	walk = func(value any, level int) error {
		items, err := rows(value, "JSON collection")
		if err != nil {
			return err
		}
		for _, item := range items {
			if level == 1 && item.value.Has("title") {
				if _, ok := get(item.value, "title").(*object); !ok {
					return fmt.Errorf("Expected language object")
				}
			}
			if level < 2 {
				child := []string{"stores", "departments"}[level]
				if item.value.Has(child) {
					if err = walk(get(item.value, child), level+1); err != nil {
						return err
					}
				}
			}
		}
		return nil
	}
	if data.Has("companies") {
		return walk(get(data, "companies"), 0)
	}
	return nil
}
