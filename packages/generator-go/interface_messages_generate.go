//go:build ignore

// Command interface_messages_generate writes interface_messages.go from
// contracts/interface-messages.json, the interface text every CRUDUI runtime embeds.
// Run it with `go generate` in this directory.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/format"
	"os"
	"path/filepath"
	"sort"
)

// contractPath is the interface messages contract relative to this directory.
var contractPath = filepath.Join("..", "..", "contracts", "interface-messages.json")

// contract is the part of the contract the generator embeds.
type contract struct {
	Form map[string]map[string]string `json:"form"`
}

func main() {
	raw, err := os.ReadFile(contractPath)
	if err != nil {
		fail(err)
	}
	var data contract
	if err := json.Unmarshal(raw, &data); err != nil {
		fail(err)
	}

	// Collect all keys from all languages
	keySet := make(map[string]bool)
	for _, lang := range data.Form {
		for key := range lang {
			keySet[key] = true
		}
	}
	var keys []string
	for key := range keySet {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	var b bytes.Buffer
	b.WriteString("// Code generated from contracts/interface-messages.json by `go generate` (interface_messages_generate.go). DO NOT EDIT.\n\n")
	b.WriteString("package generator\n\n")

	// Write the messageTables variable
	b.WriteString("var messageTables = map[string]formMessages{\n")

	languages := []string{"ko", "en", "ja", "zh"}
	for _, lang := range languages {
		fmt.Fprintf(&b, "%q: {\n", lang)
		langData := data.Form[lang]
		for _, key := range keys {
			value := langData[key]
			fmt.Fprintf(&b, "%s: %q,\n", key, value)
		}
		b.WriteString("},\n")
	}
	b.WriteString("}\n")

	source, err := format.Source(b.Bytes())
	if err != nil {
		fail(err)
	}
	if err := os.WriteFile("interface_messages.go", source, 0o644); err != nil {
		fail(err)
	}
}

// fail reports an error and exits.
func fail(err error) {
	fmt.Fprintln(os.Stderr, "interface_messages_generate:", err)
	os.Exit(1)
}
