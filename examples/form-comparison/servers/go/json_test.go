package main

import (
	"bytes"
	"testing"
)

// The record server keeps the member order of a record through @polyspec/ordered-json, numeric keys and keyed rows
// included, and the empty types of a document; OrderedJSON's own tests own the processor itself.
func TestJSONKeepsMemberOrderAndEmptyTypes(t *testing.T) {
	source := []byte(`{"z":1,"10":true,"2":"two","rows":{"__0000000000005__":{"b":[],"a":{}},"__0000000000001__":null}}`)
	decoded, err := decodeJSON(source)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := encodeJSON(decoded)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(encoded, source) {
		t.Fatalf("encodeJSON(decodeJSON(source)) = %s, want %s", encoded, source)
	}
}

func TestJSONRejectsNumbersOutsideTheFormRange(t *testing.T) {
	for _, source := range []string{`9007199254740993`, `1e400`} {
		if _, err := decodeJSON([]byte(source)); err == nil {
			t.Errorf("decodeJSON(%s) accepted a number outside the form data range", source)
		}
	}
}
