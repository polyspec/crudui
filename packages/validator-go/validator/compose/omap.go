package compose

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

// OMap is an insertion-order-preserving string map — the Go stand-in for a JS
// object. Declaration order is LOAD-BEARING in composition (a key declared after
// $ref overrides the inherited base; a key before it is overridden by it). Go's native map randomizes iteration, and
// encoding/json drops object key order, so the engine carries order explicitly
// in OMap and decodes JSON through it.
//
// The compose engine operates only on OMap / []any / scalars — the same value
// universe the JS engine sees (object / array / primitive). Every node that is a
// JS "plain object" is an *OMap here.
type OMap struct {
	keys   []string
	values map[string]any
}

// NewOMap returns an empty ordered map.
func NewOMap() *OMap {
	return &OMap{values: map[string]any{}}
}

// Keys returns the keys in insertion order (a copy; mutating it is harmless).
func (m *OMap) Keys() []string {
	out := make([]string, len(m.keys))
	copy(out, m.keys)
	return out
}

// Len returns the number of entries.
func (m *OMap) Len() int { return len(m.keys) }

// Has reports whether key is present.
func (m *OMap) Has(key string) bool {
	_, ok := m.values[key]
	return ok
}

// Get returns the value for key and whether it was present.
func (m *OMap) Get(key string) (any, bool) {
	v, ok := m.values[key]
	return v, ok
}

// Set inserts or updates key. A new key appends to the order; an existing key
// keeps its position (matching JS object assignment semantics).
func (m *OMap) Set(key string, value any) {
	if m.values == nil {
		m.values = map[string]any{}
	}
	if _, ok := m.values[key]; !ok {
		m.keys = append(m.keys, key)
	}
	m.values[key] = value
}

// Delete removes key (and its position). A no-op if absent.
func (m *OMap) Delete(key string) {
	if _, ok := m.values[key]; !ok {
		return
	}
	delete(m.values, key)
	for i, k := range m.keys {
		if k == key {
			m.keys = append(m.keys[:i:i], m.keys[i+1:]...)
			break
		}
	}
}

// Clone makes a shallow copy (new key slice + value map; values shared). The
// engine never mutates shared value subtrees in place — it rebuilds (mirrors the
// JS spread `{ ...node }`).
func (m *OMap) Clone() *OMap {
	out := &OMap{
		keys:   make([]string, len(m.keys)),
		values: make(map[string]any, len(m.values)),
	}
	copy(out.keys, m.keys)
	for k, v := range m.values {
		out.values[k] = v
	}
	return out
}

// MarshalJSON emits the entries in insertion order so a round trip is stable.
func (m *OMap) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, k := range m.keys {
		if i > 0 {
			buf.WriteByte(',')
		}
		kb, err := json.Marshal(k)
		if err != nil {
			return nil, err
		}
		buf.Write(kb)
		buf.WriteByte(':')
		vb, err := json.Marshal(m.values[k])
		if err != nil {
			return nil, err
		}
		buf.Write(vb)
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

// DecodeOrdered parses a JSON document into the engine value universe (*OMap /
// []any / scalars), preserving object declaration order. It is the exported entry
// the model validate pass uses to load a spec into the compose value model before
// composing it. Same semantics as the internal decodeOrdered.
func DecodeOrdered(data []byte) (any, error) {
	return decodeOrdered(data)
}

// decodeOrdered parses a JSON document, decoding every object as an *OMap (order
// preserved), arrays as []any, and primitives as their natural Go types
// (json.Number off; numbers are float64 — JSON loses the int/float distinction,
// matching the JS side). This is how declaration order survives into the engine.
func decodeOrdered(data []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	value, err := decodeValue(dec)
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		if err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("Expected one JSON document")
	}
	return value, nil
}

// decodeValue reads one JSON value from dec, recursively, preserving object order.
func decodeValue(dec *json.Decoder) (any, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	switch t := tok.(type) {
	case json.Delim:
		switch t {
		case '{':
			m := NewOMap()
			for dec.More() {
				keyTok, err := dec.Token()
				if err != nil {
					return nil, err
				}
				key := keyTok.(string)
				val, err := decodeValue(dec)
				if err != nil {
					return nil, err
				}
				m.Set(key, val)
			}
			// consume closing '}'
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return m, nil
		case '[':
			arr := []any{}
			for dec.More() {
				val, err := decodeValue(dec)
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
		}
	}
	// primitive: string / float64 / bool / nil
	return tok, nil
}

// isOMap reports whether v is a JS "plain object" (an *OMap). Arrays and scalars
// are not. This is the Go equivalent of the JS guard
// `v !== null && typeof v === 'object' && !Array.isArray(v)`.
func isOMap(v any) (*OMap, bool) {
	m, ok := v.(*OMap)
	return m, ok && m != nil
}
