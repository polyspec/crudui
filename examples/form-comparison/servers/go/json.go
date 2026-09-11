package main

import (
	"fmt"
	"math"
	"strconv"

	"github.com/ordered-json/go"
	"github.com/polyspec/crudui/packages/validator-go/validator/compose"
)

type object = compose.OMap

func record(fields ...any) *object {
	result := compose.NewOMap()
	for i := 0; i < len(fields); i += 2 {
		result.Set(fields[i].(string), fields[i+1])
	}
	return result
}

func get(value *object, key string) any { result, _ := value.Get(key); return result }

// decodeJSON preserves object order and rejects numbers outside the form range.
func decodeJSON(data []byte) (any, error) {
	value, err := orderedjson.ParseBytes(data)
	if err != nil {
		return nil, err
	}
	return fromJSON(value)
}

func fromJSON(value *orderedjson.Value) (any, error) {
	switch value.Kind() {
	case orderedjson.ObjectKind:
		members, _ := value.Members()
		result := record()
		for _, key := range members.Keys() {
			name, err := key.StringValue()
			if err != nil {
				return nil, err
			}
			child, err := fromJSON(members.Get(name))
			if err != nil {
				return nil, err
			}
			result.Set(name, child)
		}
		return result, nil
	case orderedjson.ArrayKind:
		items, _ := value.Items()
		result := make([]any, 0, len(items))
		for _, item := range items {
			child, err := fromJSON(item)
			if err != nil {
				return nil, err
			}
			result = append(result, child)
		}
		return result, nil
	case orderedjson.StringKind:
		return value.StringValue()
	case orderedjson.NumberKind:
		literal, _ := value.NumberLiteral()
		number, err := strconv.ParseFloat(literal, 64)
		if err != nil || math.IsInf(number, 0) || math.IsNaN(number) || (math.Trunc(number) == number && math.Abs(number) > 9007199254740991) {
			return nil, fmt.Errorf("JSON number exceeds the form data range")
		}
		return number, nil
	case orderedjson.BooleanKind:
		return value.BooleanValue()
	case orderedjson.NullKind:
		return nil, nil
	}
	return nil, fmt.Errorf("Invalid JSON value")
}

// encodeJSON uses ordered-json for responses and persisted records.
func encodeJSON(value any) ([]byte, error) {
	node, err := toJSON(value)
	if err != nil {
		return nil, err
	}
	text, err := orderedjson.Stringify(node)
	return []byte(text), err
}

func toJSON(value any) (*orderedjson.Value, error) {
	switch value := value.(type) {
	case *object:
		members := &orderedjson.OrderedMap{}
		for _, name := range value.Keys() {
			key, err := orderedjson.String(name)
			if err != nil {
				return nil, err
			}
			child, err := toJSON(get(value, name))
			if err != nil {
				return nil, err
			}
			if err = members.Set(key, child); err != nil {
				return nil, err
			}
		}
		return orderedjson.Object(members)
	case []*object:
		items := make([]any, len(value))
		for index, item := range value {
			items[index] = item
		}
		return toJSON(items)
	case []any:
		items := make([]*orderedjson.Value, 0, len(value))
		for _, child := range value {
			node, err := toJSON(child)
			if err != nil {
				return nil, err
			}
			items = append(items, node)
		}
		return orderedjson.Array(items)
	case string:
		return orderedjson.String(value)
	case bool:
		return orderedjson.Boolean(value), nil
	case nil:
		return orderedjson.Null(), nil
	case uint64:
		if value > 9007199254740991 {
			return nil, fmt.Errorf("JSON number exceeds the form data range")
		}
		return orderedjson.Number(strconv.FormatUint(value, 10))
	case int:
		return orderedjson.Number(strconv.Itoa(value))
	case float64:
		if math.IsInf(value, 0) || math.IsNaN(value) || (math.Trunc(value) == value && math.Abs(value) > 9007199254740991) {
			return nil, fmt.Errorf("JSON number exceeds the form data range")
		}
		return orderedjson.Number(strconv.FormatFloat(value, 'g', -1, 64))
	}
	return nil, fmt.Errorf("Unsupported JSON value: %T", value)
}

func clone(value any) any {
	switch value := value.(type) {
	case *object:
		result := record()
		for _, key := range value.Keys() {
			result.Set(key, clone(get(value, key)))
		}
		return result
	case []any:
		result := make([]any, len(value))
		for i, item := range value {
			result[i] = clone(item)
		}
		return result
	default:
		return value
	}
}

// validatorData converts only validation input to the existing validator model.
func validatorData(value any) any {
	switch value := value.(type) {
	case *object:
		result := map[string]any{}
		for _, key := range value.Keys() {
			result[key] = validatorData(get(value, key))
		}
		return result
	case []any:
		result := make([]any, len(value))
		for i, item := range value {
			result[i] = validatorData(item)
		}
		return result
	default:
		return value
	}
}
