package legacy

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// OrderedMap is a JSON object that preserves key declaration order.
// Values are interface{} where nested objects are *OrderedMap,
// arrays are []interface{}, and scalars are string/float64/bool/nil.
type OrderedMap struct {
	keys   []string
	values map[string]interface{}
}

// NewOrderedMap creates an empty OrderedMap.
func NewOrderedMap() *OrderedMap {
	return &OrderedMap{
		keys:   []string{},
		values: map[string]interface{}{},
	}
}

// Keys returns the keys in declaration order.
func (m *OrderedMap) Keys() []string {
	return m.keys
}

// Get returns the value for a key and whether it exists.
func (m *OrderedMap) Get(key string) (interface{}, bool) {
	v, ok := m.values[key]
	return v, ok
}

// GetString returns the string value for a key, or "" if absent or not a string.
func (m *OrderedMap) GetString(key string) string {
	if v, ok := m.values[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// Set adds or replaces a key. New keys keep insertion order.
func (m *OrderedMap) Set(key string, value interface{}) {
	if _, exists := m.values[key]; !exists {
		m.keys = append(m.keys, key)
	}
	m.values[key] = value
}

// Len returns the number of keys.
func (m *OrderedMap) Len() int {
	return len(m.keys)
}

// DecodeOrderedJSON decodes JSON preserving object key order via a
// json.Decoder token walk. Objects become *OrderedMap.
func DecodeOrderedJSON(data []byte) (interface{}, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	value, err := decodeOrderedValue(dec)
	if err != nil {
		return nil, err
	}
	return value, nil
}

// decodeOrderedValue decodes the next JSON value from the decoder.
func decodeOrderedValue(dec *json.Decoder) (interface{}, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}

	switch t := tok.(type) {
	case json.Delim:
		switch t {
		case '{':
			om := NewOrderedMap()
			for dec.More() {
				keyTok, err := dec.Token()
				if err != nil {
					return nil, err
				}
				key, ok := keyTok.(string)
				if !ok {
					return nil, fmt.Errorf("expected object key, got %v", keyTok)
				}
				val, err := decodeOrderedValue(dec)
				if err != nil {
					return nil, err
				}
				om.Set(key, val)
			}
			// consume closing '}'
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return om, nil
		case '[':
			arr := []interface{}{}
			for dec.More() {
				val, err := decodeOrderedValue(dec)
				if err != nil {
					return nil, err
				}
				arr = append(arr, val)
			}
			// consume closing ']'
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return arr, nil
		default:
			return nil, fmt.Errorf("unexpected delimiter %v", t)
		}
	default:
		// string, float64, bool, nil
		return tok, nil
	}
}

// ToPlain converts ordered values back to plain Go values
// (*OrderedMap becomes map[string]interface{}).
func ToPlain(value interface{}) interface{} {
	switch v := value.(type) {
	case *OrderedMap:
		out := make(map[string]interface{}, v.Len())
		for _, k := range v.Keys() {
			val, _ := v.Get(k)
			out[k] = ToPlain(val)
		}
		return out
	case []interface{}:
		out := make([]interface{}, len(v))
		for i, item := range v {
			out[i] = ToPlain(item)
		}
		return out
	default:
		return v
	}
}
